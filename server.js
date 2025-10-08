/** server.js — dojo apps (leads→students, archive students, printable receipts) */
console.log(">>> server.js started <<<");

const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const AdmZip = require("adm-zip");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----- config / data dir ------------------------------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, "dojo.db");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, "public")));

// ----- db helpers --------------------------------------------------------------
const db = new sqlite3.Database(DB_FILE);
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// ----- bootstrap schema --------------------------------------------------------
db.serialize(() => {
  // leads
  run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      note TEXT,
      created_at TEXT DEFAULT (date('now')),
      last_contacted TEXT
    )
  `).catch(()=>{});

  // students (active)
  run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      picture TEXT,
      join_date TEXT DEFAULT (date('now')),
      renewal_date TEXT,
      status TEXT DEFAULT 'active'
    )
  `).catch(()=>{});

  // old_students (archived copy)
  run(`
    CREATE TABLE IF NOT EXISTS old_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      picture TEXT,
      join_date TEXT,
      renewal_date TEXT,
      archived_at TEXT DEFAULT (datetime('now'))
    )
  `).catch(()=>{});

  // payments
  run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT,
      taxable INTEGER DEFAULT 1,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )
  `).catch(()=>{});

  // expenses
  run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT,
      amount REAL NOT NULL,
      category TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).catch(()=>{});

  // attendance (if you use it later)
  run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      at_date TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )
  `).catch(()=>{});
});

// ----- utilities ---------------------------------------------------------------
function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ----- health/admin ------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    data_dir: DATA_DIR,
    port: process.env.PORT || 3000,
    has_admin: !!ADMIN_TOKEN,
  });
});

// backup (zip data dir + uploads) and restore
app.get("/admin", async (req, res) => {
  const token = req.query.token || "";
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(401).send("Unauthorized");
  // very plain admin UI
  res.send(`
    <!doctype html><meta charset="utf-8">
    <h1>Admin Tools</h1>
    <p>Data dir: ${DATA_DIR}</p>
    <p><a href="/admin/export?token=${token}">Export Backup (zip)</a></p>
    <form action="/admin/restore?token=${token}" method="post" enctype="multipart/form-data">
      <input type="file" name="zip" accept=".zip" required>
      <button type="submit">Restore From Zip</button>
    </form>
    <p><a href="/">Back to app</a></p>
  `);
});

app.get("/admin/export", async (req, res) => {
  const token = req.query.token || "";
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(401).send("Unauthorized");
  const zip = new AdmZip();
  if (fs.existsSync(DB_FILE)) zip.addLocalFile(DB_FILE, "data");
  if (fs.existsSync(UPLOAD_DIR)) zip.addLocalFolder(UPLOAD_DIR, "uploads");
  const tmp = path.join(os.tmpdir(), `dojo-backup-${Date.now()}.zip`);
  zip.writeZip(tmp);
  res.setHeader("Content-Disposition", "attachment; filename=dojo-backup.zip");
  res.sendFile(tmp, err => { try { fs.unlinkSync(tmp); } catch(_){} });
});

const upload = multer({ dest: path.join(os.tmpdir(), "dojo-restore") });
app.post("/admin/restore", upload.single("zip"), async (req, res) => {
  const token = req.query.token || "";
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(401).send("Unauthorized");
  if (!req.file) return res.status(400).send("No file");
  const zip = new AdmZip(req.file.path);
  const entries = zip.getEntries();
  entries.forEach(e => {
    if (e.entryName.startsWith("data/") && e.name === "dojo.db") {
      fs.writeFileSync(DB_FILE, e.getData());
    }
    if (e.entryName.startsWith("uploads/")) {
      const out = path.join(UPLOAD_DIR, e.entryName.replace(/^uploads\//, ""));
      const dir = path.dirname(out);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(out, e.getData());
    }
  });
  res.send(`<p>Restored. <a href="/admin?token=${token}">Back</a></p>`);
});

// ----- LEADS -------------------------------------------------------------------
app.get("/api/leads", async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM leads ORDER BY id DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/leads", async (req, res) => {
  const { name, phone, email, note } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const created_at = today();
    const out = await run(
      `INSERT INTO leads (name, phone, email, note, created_at) VALUES (?,?,?,?,?)`,
      [name, phone || "", email || "", note || "", created_at]
    );
    res.json({ ok: true, id: out.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/leads/:id", async (req, res) => {
  const { name, phone, email, note, last_contacted } = req.body;
  try {
    await run(
      `UPDATE leads SET name=?, phone=?, email=?, note=?, last_contacted=? WHERE id=?`,
      [name, phone, email, note, last_contacted || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/leads/:id", async (req, res) => {
  try { await run(`DELETE FROM leads WHERE id=?`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// NEW: Convert lead → student
app.post("/api/leads/:id/convert", async (req, res) => {
  try {
    const lead = await get(`SELECT * FROM leads WHERE id=?`, [req.params.id]);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const join_date = today();
    const renewal_date = addDaysISO(join_date, 28);

    const ins = await run(
      `INSERT INTO students (name, phone, email, join_date, renewal_date, status)
       VALUES (?,?,?,?,?, 'active')`,
      [lead.name, lead.phone || "", lead.email || "", join_date, renewal_date]
    );

    // Remove the lead after converting
    await run(`DELETE FROM leads WHERE id=?`, [req.params.id]);

    res.json({ ok: true, studentId: ins.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- STUDENTS ----------------------------------------------------------------
app.get("/api/students", async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM students WHERE status='active' ORDER BY id DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/students", async (req, res) => {
  const { name, phone, email, join_date, renewal_date } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const jd = join_date || today();
    const rd = renewal_date || addDaysISO(jd, 28);
    const out = await run(
      `INSERT INTO students (name, phone, email, join_date, renewal_date, status)
       VALUES (?,?,?,?,?, 'active')`,
      [name, phone || "", email || "", jd, rd]
    );
    res.json({ ok: true, id: out.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/students/:id", async (req, res) => {
  const { name, phone, email, join_date, renewal_date, status } = req.body;
  try {
    await run(
      `UPDATE students SET name=?, phone=?, email=?, join_date=?, renewal_date=?, status=? WHERE id=?`,
      [name, phone, email, join_date, renewal_date, status || 'active', req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/students/:id", async (req, res) => {
  try { await run(`DELETE FROM students WHERE id=?`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// NEW: Archive student → old_students (and remove from active table)
app.post("/api/students/:id/archive", async (req, res) => {
  try {
    const s = await get(`SELECT * FROM students WHERE id=?`, [req.params.id]);
    if (!s) return res.status(404).json({ error: "Student not found" });

    await run(
      `INSERT INTO old_students (name, phone, email, picture, join_date, renewal_date)
       VALUES (?,?,?,?,?,?)`,
      [s.name, s.phone || "", s.email || "", s.picture || "", s.join_date || null, s.renewal_date || null]
    );
    await run(`DELETE FROM students WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/old-students", async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM old_students ORDER BY id DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- PAYMENTS + RECEIPTS -----------------------------------------------------
app.get("/api/payments", async (req, res) => {
  try {
    const rows = await all(`
      SELECT p.*, s.name AS student_name
      FROM payments p
      LEFT JOIN students s ON s.id=p.student_id
      ORDER BY p.id DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/payments", async (req, res) => {
  const { student_id, amount, method, taxable, note } = req.body;
  if (!student_id || !amount) return res.status(400).json({ error: "student_id & amount required" });
  try {
    const out = await run(
      `INSERT INTO payments (student_id, amount, method, taxable, note) VALUES (?,?,?,?,?)`,
      [student_id, parseFloat(amount), method || "", taxable ? 1 : 0, note || ""]
    );
    res.json({ ok: true, id: out.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/payments/:id", async (req, res) => {
  try { await run(`DELETE FROM payments WHERE id=?`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// NEW: Printable receipt page
app.get("/receipt/:id", async (req, res) => {
  try {
    const row = await get(`
      SELECT p.*, s.name AS student_name, s.phone, s.email
      FROM payments p
      LEFT JOIN students s ON s.id=p.student_id
      WHERE p.id=?
    `, [req.params.id]);
    if (!row) return res.status(404).send("Receipt not found");

    const dojoName = process.env.DOJO_NAME || "Your Dojo";
    const dojoAddr = process.env.DOJO_ADDR || "";
    const dojoPhone = process.env.DOJO_PHONE || "";
    const logoUrl = "/logo.png"; // put a logo in /public/logo.png if you want

    const taxableText = row.taxable ? "Taxable" : "Non-Taxable";
    const created = row.created_at || new Date().toISOString();

    res.send(`<!doctype html>
<html><head><meta charset="utf-8">
<title>Receipt #${row.id}</title>
<style>
  :root { --ink:#111; --muted:#666; --line:#ddd; }
  *{ box-sizing:border-box; }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:var(--ink); margin:24px; }
  .wrap{ max-width:720px; margin:0 auto; border:1px solid var(--line); padding:24px; border-radius:12px; }
  header{ display:flex; gap:16px; align-items:center; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:16px; }
  header img{ width:64px; height:64px; object-fit:contain; }
  h1{ font-size:20px; margin:0; }
  .muted{ color:var(--muted); font-size:14px; }
  table{ width:100%; border-collapse:collapse; margin-top:8px; }
  th,td{ text-align:left; padding:8px 0; }
  .line{ border-top:1px dashed var(--line); margin:12px 0; }
  .right{ text-align:right; }
  .btnbar{ margin-top:16px; display:flex; gap:8px; }
  @media print{
    .btnbar{ display:none; }
    body{ margin:0; }
    .wrap{ border:none; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <img src="${logoUrl}" onerror="this.style.display='none'">
      <div>
        <h1>${dojoName}</h1>
        <div class="muted">${dojoAddr || ""}${dojoAddr && dojoPhone ? " · " : ""}${dojoPhone || ""}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div class="muted">Receipt</div>
        <div>#${row.id}</div>
        <div class="muted">${created}</div>
      </div>
    </header>

    <section>
      <strong>Billed To:</strong><br>
      ${row.student_name || "Student"}<br>
      <span class="muted">${row.email || ""}${row.email && row.phone ? " · " : ""}${row.phone || ""}</span>
    </section>

    <div class="line"></div>

    <table>
      <tr><th>Description</th><th class="right">Amount (USD)</th></tr>
      <tr><td>Membership Payment — ${taxableText}${row.method ? " · " + row.method : ""}${row.note ? " · " + row.note : ""}</td>
          <td class="right">${Number(row.amount).toFixed(2)}</td></tr>
      <tr><td></td><td class="right"><strong>Total: $${Number(row.amount).toFixed(2)}</strong></td></tr>
    </table>

    <div class="btnbar">
      <button onclick="window.print()">Print</button>
      <button onclick="window.close()">Close</button>
    </div>
  </div>
</body></html>`);
  } catch (e) { res.status(500).send(e.message); }
});

// ----- EXPENSES (unchanged endpoints but kept for completeness) ----------------
app.get("/api/expenses", async (req, res) => {
  try { res.json(await all(`SELECT * FROM expenses ORDER BY id DESC`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/expenses", async (req, res) => {
  const { vendor, amount, category, note } = req.body;
  if (!amount) return res.status(400).json({ error: "amount required" });
  try {
    const out = await run(
      `INSERT INTO expenses (vendor, amount, category, note) VALUES (?,?,?,?)`,
      [vendor || "", parseFloat(amount), category || "", note || ""]
    );
    res.json({ ok: true, id: out.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/expenses/:id", async (req, res) => {
  try { await run(`DELETE FROM expenses WHERE id=?`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- server ------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (data at ${DATA_DIR})`);
  console.log(`Connected to SQLite database: ${DB_FILE}`);
});
