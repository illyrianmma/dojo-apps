// server.js (complete)
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const AdmZip = require("adm-zip");

// optional mail/SMS libs (safe if env not set)
let sgMail = null, twilioClient = null;
if (process.env.SENDGRID_API_KEY) {
  try {
    sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  } catch {}
}
if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
  try {
    const twilio = require("twilio");
    twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  } catch {}
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // set in Render → Environment

// -------------------------------
// Persistent data dir (Render Disk or local)
// -------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dbFile = path.join(DATA_DIR, "dojo.db");
const uploadsDir = path.join(DATA_DIR, "uploads");
const tmpDir = path.join(DATA_DIR, "tmp");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// -------------------------------
// Parsers & static
// -------------------------------
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: 0, etag: false }));
app.use("/uploads", express.static(uploadsDir));

// Friendly routes / redirects so .htm and extensionless work
const PAGES = ["index","students","payments","attendance","leads","expenses","accounting","admin-tools","admin-import"];
app.get("/", (req,res) => res.redirect("/index.html"));
PAGES.forEach(name => {
  app.get("/" + name, (req,res) =>
    res.sendFile(path.join(__dirname, "public", `${name}.html`))
  );
  app.get("/" + name + ".htm", (req,res) => res.redirect("/" + name + ".html"));
});

// -------------------------------
// Multer (photo uploads -> persistent disk)
// -------------------------------
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});
const imageFilter = (req, file, cb) =>
  (/^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Only image files")));
const uploadPhoto = multer({ storage: photoStorage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Separate multer for admin file uploads (DB or ZIP → tmp)
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});
const uploadAny = multer({ storage: fileStorage, limits: { fileSize: 200 * 1024 * 1024 } }); // up to 200MB

// -------------------------------
// Database helpers
// -------------------------------
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error("Error opening database:", err.message);
  else console.log("Connected to SQLite database:", dbFile);
});
db.exec("PRAGMA foreign_keys = ON;");

// Schema + simple auto-migrations
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    age INTEGER,
    program TEXT,
    start_date TEXT,
    renewal_date TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    notes TEXT,
    photo TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    date TEXT,
    present INTEGER,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    date TEXT,
    amount REAL,
    method TEXT,
    taxable INTEGER,
    note TEXT,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT,
    date TEXT,
    amount REAL,
    taxable INTEGER,
    category TEXT,
    note TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    interested_program TEXT,
    follow_up_date TEXT,
    status TEXT,
    notes TEXT,
    created_at TEXT
  )`);
});

// -------------------------------
// Helpers
// -------------------------------
function addDays(dateISO, days) {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function cmpDays(aISO, bISO) {
  return Math.floor((new Date(aISO) - new Date(bISO)) / 86400000);
}

// mail & sms (no-op if not configured)
async function sendEmail(to, subject, text) {
  if (!sgMail || !process.env.SENDGRID_FROM) {
    console.log(`[email disabled] would send to ${to}: ${subject}`);
    return { ok: false, skipped: true };
  }
  try {
    await sgMail.send({ to, from: process.env.SENDGRID_FROM, subject, text });
    return { ok: true };
  } catch (e) {
    console.error("sendEmail error:", e.message);
    return { ok: false, error: e.message };
  }
}
async function sendSMS(to, text) {
  if (!twilioClient || !process.env.TWILIO_FROM) {
    console.log(`[sms disabled] would text ${to}: ${text}`);
    return { ok: false, skipped: true };
  }
  try {
    const r = await twilioClient.messages.create({ to, from: process.env.TWILIO_FROM, body: text });
    return { ok: true, sid: r.sid };
  } catch (e) {
    console.error("sendSMS error:", e.message);
    return { ok: false, error: e.message };
  }
}
function adminGuard(req, res) {
  const token = req.headers["x-admin-token"] || req.query.token || req.body.token;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    res.status(403).json({ error: "Forbidden" }); return false;
  }
  return true;
}

// -------------------------------
// Health
// -------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, data_dir: DATA_DIR, port: PORT, has_admin: !!ADMIN_TOKEN });
});

// -------------------------------
// API Routes
// -------------------------------

// ---- Students ----
app.get("/api/students", (req, res) => {
  const today = todayISO();
  db.all("SELECT * FROM students ORDER BY name COLLATE NOCASE ASC, id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // decorate with due_status
    const out = rows.map(r => {
      const rd = r.renewal_date || "";
      let due_status = "ok";
      if (rd) {
        if (new Date(rd) < new Date(today)) due_status = "overdue";
        else if (cmpDays(rd, today) <= 3) due_status = "due_soon";
      }
      return { ...r, due_status };
    });
    res.json(out);
  });
});

app.get("/api/students/due", (req, res) => {
  const within = parseInt(req.query.within || "7", 10);
  const max = addDays(todayISO(), within);
  const sql = `SELECT * FROM students
               WHERE COALESCE(renewal_date,'') <> '' AND renewal_date <= ?
               ORDER BY renewal_date ASC`;
  db.all(sql, [max], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// Create student
app.post("/api/students", uploadPhoto.single("photo"), (req, res) => {
  let {
    name, first_name, last_name, phone, email, address, age,
    program, start_date, renewal_date, parent_name, parent_phone, notes
  } = req.body;

  if (!name) name = [first_name, last_name].filter(Boolean).join(" ").trim();
  const start = (start_date && String(start_date).trim()) ? String(start_date).slice(0,10) : todayISO();
  const renewal = (renewal_date && String(renewal_date).trim()) ? String(renewal_date).slice(0,10) : addDays(start, 28);
  const photoPath = req.file ? "/uploads/" + req.file.filename : null;

  const sql = `INSERT INTO students
    (name, phone, email, address, age, program, start_date, renewal_date, parent_name, parent_phone, notes, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [
    name || null, phone || null, email || null, address || null,
    age || null, program || null, start, renewal,
    parent_name || null, parent_phone || null, notes || null, photoPath
  ],
  function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, start_date: start, renewal_date: renewal, photo: photoPath });
  });
});

// Update student
app.put("/api/students/:id", uploadPhoto.single("photo"), (req, res) => {
  let {
    name, first_name, last_name, phone, email, address, age,
    program, start_date, renewal_date, parent_name, parent_phone, notes
  } = req.body;

  if (!name) name = [first_name, last_name].filter(Boolean).join(" ").trim();
  const start = (start_date && String(start_date).trim()) ? String(start_date).slice(0,10) : todayISO();
  const renewal = (renewal_date && String(renewal_date).trim()) ? String(renewal_date).slice(0,10) : addDays(start, 28);
  const photoPath = req.file ? "/uploads/" + req.file.filename : null;

  const sql = "UPDATE students SET " +
    "name=?, phone=?, email=?, address=?, age=?, program=?, start_date=?, renewal_date=?," +
    "parent_name=?, parent_phone=?, notes=?" + (photoPath ? ", photo=?" : "") +
    " WHERE id=?";

  const params = [
    name || null, phone || null, email || null, address || null,
    age || null, program || null, start, renewal,
    parent_name || null, parent_phone || null, notes || null
  ];
  if (photoPath) params.push(photoPath);
  params.push(req.params.id);

  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// Delete student
app.delete("/api/students/:id", (req, res) => {
  db.run("DELETE FROM students WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Student " + req.params.id + " and related records deleted." });
  });
});

// ---- Payments ----
app.get("/api/payments", (req, res) => {
  const sql = "SELECT payments.*, students.name AS student_name " +
              "FROM payments LEFT JOIN students ON payments.student_id = students.id " +
              "ORDER BY date DESC, payments.id DESC";
  db.all(sql, [], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// summary: ?from=YYYY-MM-DD&to=YYYY-MM-DD (optional)
app.get("/api/payments/summary", (req, res) => {
  const { from, to } = req.query;
  const cond = [], params = [];
  if (from) { cond.push("date >= ?"); params.push(from); }
  if (to)   { cond.push("date <= ?"); params.push(to); }
  const where = cond.length ? ("WHERE " + cond.join(" AND ")) : "";
  const sql = `
    SELECT
      SUM(CASE WHEN taxable=1 THEN amount ELSE 0 END) AS taxable_total,
      SUM(CASE WHEN taxable=0 THEN amount ELSE 0 END) AS nontax_total,
      SUM(amount) AS grand_total
    FROM payments ${where}
  `;
  db.get(sql, params, (err, row) =>
    err ? res.status(500).json({ error: err.message }) :
    res.json({
      taxable_total: row.taxable_total || 0,
      nontax_total: row.nontax_total || 0,
      grand_total: row.grand_total || 0
    })
  );
});

app.post("/api/payments", async (req, res) => {
  const { student_id, date, amount, method, taxable, note } = req.body;
  db.run(
    "INSERT INTO payments (student_id, date, amount, method, taxable, note) VALUES (?, ?, ?, ?, ?, ?)",
    [student_id, date, amount, method, taxable, note],
    async function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // send receipt (best-effort; non-blocking)
      const pid = this.lastID;
      db.get("SELECT name, email, phone FROM students WHERE id = ?", [student_id], async (e, stu) => {
        if (!e && stu) {
          const msgText = `Receipt: ${stu.name}\nDate: ${date}\nAmount: $${Number(amount).toFixed(2)}\nMethod: ${method}\nThank you!`;
          if (stu.email) await sendEmail(stu.email, "Membership Payment Receipt", msgText);
          if (stu.phone) await sendSMS(stu.phone, msgText);
        }
      });

      res.json({ id: pid });
    }
  );
});

app.delete("/api/payments/:id", (req, res) => {
  db.run("DELETE FROM payments WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Payment " + req.params.id + " deleted." });
  });
});

// ---- Expenses ----
app.get("/api/expenses", (req, res) => {
  db.all("SELECT * FROM expenses ORDER BY date DESC, id DESC", [], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});
app.post("/api/expenses", (req, res) => {
  const { vendor, date, amount, taxable, category, note } = req.body;
  db.run(
    "INSERT INTO expenses (vendor, date, amount, taxable, category, note) VALUES (?, ?, ?, ?, ?, ?)",
    [vendor, date, amount, taxable, category, note],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// ---- Leads ----
app.get("/api/leads", (req, res) => {
  db.all("SELECT * FROM leads ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const today = todayISO();
    const out = rows.map(r => {
      const created = r.created_at || today;
      const age_days = Math.max(0, Math.floor((new Date(today) - new Date(created)) / 86400000));
      return { ...r, age_days };
    });
    res.json(out);
  });
});
app.post("/api/leads", (req, res) => {
  const { name, phone, email, interested_program, follow_up_date, status, notes } = req.body;
  db.run(
    "INSERT INTO leads (name, phone, email, interested_program, follow_up_date, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [name, phone, email, interested_program, follow_up_date, status, notes, todayISO()],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});
app.patch("/api/leads/:id", (req, res) => {
  const { status, notes } = req.body;
  db.run(
    "UPDATE leads SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?",
    [status || null, notes || null, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});
app.delete("/api/leads/:id", (req, res) => {
  db.run("DELETE FROM leads WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ---- Attendance ----
app.get("/api/attendance", (req, res) => {
  const sql =
    "SELECT " +
    "  attendance.id, attendance.student_id, attendance.date, attendance.present, " +
    "  COALESCE(students.name, 'ID ' || attendance.student_id) AS student_name " +
    "FROM attendance " +
    "LEFT JOIN students ON attendance.student_id = students.id " +
    "ORDER BY attendance.date DESC, attendance.id DESC";
  db.all(sql, [], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});
app.post("/api/attendance", (req, res) => {
  let { student_id, date, present } = req.body;
  const sid = parseInt(student_id, 10);
  const pres = (present === 1 || present === "1" || present === true || present === "true") ? 1 : 0;
  const d = (date && String(date).trim()) ? String(date).slice(0,10) : todayISO();
  if (!Number.isFinite(sid)) return res.status(400).json({ error: "student_id is required" });

  db.get("SELECT id FROM students WHERE id = ?", [sid], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ error: "Student " + sid + " not found" });

    db.run("INSERT INTO attendance (student_id, date, present) VALUES (?, ?, ?)",
      [sid, d, pres],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get(
          "SELECT attendance.id, attendance.student_id, attendance.date, attendance.present, " +
          "COALESCE(students.name, 'ID ' || attendance.student_id) AS student_name " +
          "FROM attendance LEFT JOIN students ON attendance.student_id = students.id " +
          "WHERE attendance.id = ?",
          [this.lastID],
          (err3, row2) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.json(row2);
          }
        );
      }
    );
  });
});
app.delete("/api/attendance/:id", (req, res) => {
  db.run("DELETE FROM attendance WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// -------------------------------
// ADMIN: backup & CSV export (token required)
// -------------------------------
function checkAdmin(req, res) {
  const token = req.headers["x-admin-token"] || req.query.token || req.body.token;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}
app.get("/admin/backup/db", (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.download(dbFile, "dojo.db");
});
app.get("/admin/export/csv", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const allowed = new Set(["students","payments","expenses","leads","attendance"]);
  const table = String(req.query.table || "").toLowerCase();
  if (!allowed.has(table)) return res.status(400).json({ error: "invalid table" });

  db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const csv = [cols.join(",")].concat(
      rows.map(r => cols.map(c => {
        const v = r[c] == null ? "" : String(r[c]);
        return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
      }).join(","))
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${table}.csv"`);
    res.send(csv);
  });
});

// -------------------------------
// TASK: daily reminders (due in 3 days)
// -------------------------------
app.post("/api/tasks/due-reminders", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const target = addDays(todayISO(), 3);
  db.all("SELECT * FROM students WHERE renewal_date = ?", [target], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    let sent = 0;
    for (const s of rows) {
      const msg = `Hi ${s.name || ""}, reminder: your membership renews on ${s.renewal_date}. See you at the dojo!`;
      if (s.email) { const r = await sendEmail(s.email, "Membership Renewal Reminder", msg); if (r.ok) sent++; }
      if (s.phone) { const r = await sendSMS(s.phone, msg); if (r.ok) sent++; }
    }
    res.json({ checked: rows.length, notifications_sent: sent });
  });
});

// -------------------------------
// Start server (Render needs 0.0.0.0)
// -------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(">>> server.js started <<<");
  console.log("Server running on port " + PORT + " (data at " + DATA_DIR + ")");
});
