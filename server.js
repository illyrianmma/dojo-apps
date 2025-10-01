const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------------
// Persistent data dir (Render Disk)
// -------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dbFile = path.join(DATA_DIR, "dojo.db");
const uploadsDir = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// -------------------------------
// Parsers & static
// -------------------------------
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve frontend from /public (disable caching during development)
app.use(express.static(path.join(__dirname, "public"), { maxAge: 0, etag: false }));

// Serve uploaded photos from the persistent disk
app.use("/uploads", express.static(uploadsDir));

// -------------------------------
// Multer (photo uploads -> persistent disk)
// -------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});
const fileFilter = (req, file, cb) => (/^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Only image files")));
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// -------------------------------
// Database
// -------------------------------
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error("Error opening database:", err.message);
  else console.log("Connected to SQLite database:", dbFile);
});
db.exec("PRAGMA foreign_keys = ON;");

// -------------------------------
// Schema
// -------------------------------
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
    notes TEXT
  )`);
});

// -------------------------------
// Helpers
// -------------------------------
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// -------------------------------
// Health
// -------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, data_dir: DATA_DIR, port: PORT });
});

// -------------------------------
// API Routes
// -------------------------------

// ---- Students ----
app.get("/api/students", (req, res) => {
  db.all("SELECT * FROM students ORDER BY name COLLATE NOCASE ASC, id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
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
app.post("/api/students", upload.single("photo"), (req, res) => {
  let {
    name, first_name, last_name, phone, email, address, age,
    program, start_date, renewal_date, parent_name, parent_phone, notes
  } = req.body;

  if (!name) name = [first_name, last_name].filter(Boolean).join(" ").trim();
  const start = start_date || todayISO();
  const renewal = renewal_date || addDays(start, 28);
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
app.put("/api/students/:id", upload.single("photo"), (req, res) => {
  let {
    name, first_name, last_name, phone, email, address, age,
    program, start_date, renewal_date, parent_name, parent_phone, notes
  } = req.body;

  if (!name) name = [first_name, last_name].filter(Boolean).join(" ").trim();
  const start = start_date || todayISO();
  const renewal = renewal_date || addDays(start, 28);
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

app.post("/api/payments", (req, res) => {
  const { student_id, date, amount, method, taxable, note } = req.body;
  db.run(
    "INSERT INTO payments (student_id, date, amount, method, taxable, note) VALUES (?, ?, ?, ?, ?, ?)",
    [student_id, date, amount, method, taxable, note],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
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
  db.all("SELECT * FROM leads ORDER BY id DESC", [], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

app.post("/api/leads", (req, res) => {
  const { name, phone, email, interested_program, follow_up_date, status, notes } = req.body;
  db.run(
    "INSERT INTO leads (name, phone, email, interested_program, follow_up_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [name, phone, email, interested_program, follow_up_date, status, notes],
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

  if (!Number.isFinite(sid)) {
    return res.status(400).json({ error: "student_id is required" });
  }

  db.get("SELECT id FROM students WHERE id = ?", [sid], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ error: "Student " + sid + " not found" });

    db.run(
      "INSERT INTO attendance (student_id, date, present) VALUES (?, ?, ?)",
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
// Start server (Render needs 0.0.0.0)
// -------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(">>> server.js started <<<");
  console.log("Server running on port " + PORT + " (data at " + DATA_DIR + ")");
});
