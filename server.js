// server.js (accounting fixes + diagnostics)
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Persistent data directory (Render uses /data)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dbFile = path.join(DATA_DIR, "dojo.db");
const uploadsDir = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: 0, etag: false }));
app.use("/uploads", express.static(uploadsDir));

// Convenience routes so /page and /page.htm work
const PAGES = ["index","students","payments","attendance","leads","expenses","accounting","dashboard","admin-tools","admin-import"];
app.get("/", (req,res) => res.redirect("/index.html"));
PAGES.forEach(name => {
  app.get("/" + name, (req,res) =>
    res.sendFile(path.join(__dirname, "public", `${name}.html`))
  );
  app.get("/" + name + ".htm", (req,res) => res.redirect("/" + name + ".html"));
});

// --- uploads (photos) ---
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});
const imageFilter = (req, file, cb) => (/^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Only images")));
const uploadPhoto = multer({ storage: photoStorage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// --- DB ---
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error("DB open error:", err.message);
  else console.log("Connected to SQLite database:", dbFile);
});
db.exec("PRAGMA foreign_keys = ON;");

// Schema (with auto-migrations)
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

  // Auto-migrate: add leads.created_at if missing
  db.all(`PRAGMA table_info(leads)`, [], (e, cols) => {
    if (e) return;
    const hasCreatedAt = cols.some(c => c.name === "created_at");
    if (!hasCreatedAt) {
      db.run(`ALTER TABLE leads ADD COLUMN created_at TEXT`, [], () => {
        console.log("Auto-migrate: leads.created_at added");
      });
    }
  });
});

// Helpers
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(iso, n){ const d=new Date(iso); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function cmpDays(aISO,bISO){ return Math.floor((new Date(aISO)-new Date(bISO))/86400000); }

// Health
app.get("/api/health", (req,res)=> res.json({ ok:true, data_dir:DATA_DIR, port:PORT }));

// ==================== STUDENTS ====================
app.get("/api/students", (req,res)=>{
  const today = todayISO();
  db.all("SELECT * FROM students ORDER BY name COLLATE NOCASE ASC, id DESC", [], (err, rows)=>{
    if (err) return res.status(500).json({ error: err.message });
    const out = rows.map(s=>{
      const rd = s.renewal_date || "";
      let due_status = "ok";
      if (rd) {
        if (new Date(rd) < new Date(today)) due_status = "overdue";
        else if (cmpDays(rd, today) <= 3) due_status = "due_soon";
      }
      return {...s, due_status};
    });
    res.json(out);
  });
});

// Create (auto-fill start=Today, renewal=+28 if blank)
app.post("/api/students", uploadPhoto.single("photo"), (req,res)=>{
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
    name||null, phone||null, email||null, address||null, age||null, program||null,
    start, renewal, parent_name||null, parent_phone||null, notes||null, photoPath
  ], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id:this.lastID, name, start_date:start, renewal_date:renewal, photo:photoPath });
  });
});

// Update
app.put("/api/students/:id", uploadPhoto.single("photo"), (req,res)=>{
  let {
    name, first_name, last_name, phone, email, address, age,
    program, start_date, renewal_date, parent_name, parent_phone, notes
  } = req.body;
  if (!name) name = [first_name, last_name].filter(Boolean).join(" ").trim();
  const start = (start_date && String(start_date).trim()) ? String(start_date).slice(0,10) : todayISO();
  const renewal = (renewal_date && String(renewal_date).trim()) ? String(renewal_date).slice(0,10) : addDays(start, 28);
  const photoPath = req.file ? "/uploads/" + req.file.filename : null;

  const sql = "UPDATE students SET " +
    "name=?, phone=?, email=?, address=?, age=?, program=?, start_date=?, renewal_date=?, " +
    "parent_name=?, parent_phone=?, notes=?" + (photoPath ? ", photo=?" : "") +
    " WHERE id=?";
  const params = [
    name||null, phone||null, email||null, address||null, age||null, program||null, start, renewal,
    parent_name||null, parent_phone||null, notes||null
  ];
  if (photoPath) params.push(photoPath);
  params.push(req.params.id);

  db.run(sql, params, function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// Delete
app.delete("/api/students/:id", (req,res)=>{
  db.run("DELETE FROM students WHERE id=?", [req.params.id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ==================== PAYMENTS (income) ====================
app.get("/api/payments", (req,res)=>{
  const sql = `SELECT payments.*, students.name AS student_name
               FROM payments LEFT JOIN students ON payments.student_id = students.id
               ORDER BY date DESC, payments.id DESC`;
  db.all(sql, [], (err,rows)=> err ? res.status(500).json({error:err.message}) : res.json(rows));
});

// Summary income (taxable/nontax/all) — CAST to REAL to be safe
app.get("/api/payments/summary", (req,res)=>{
  const { from, to } = req.query;
  const cond=[], p=[];
  if (from) { cond.push("date >= ?"); p.push(from); }
  if (to)   { cond.push("date <= ?"); p.push(to); }
  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN taxable=1 THEN CAST(amount AS REAL) ELSE 0 END),0) AS taxable_total,
      COALESCE(SUM(CASE WHEN taxable=0 THEN CAST(amount AS REAL) ELSE 0 END),0) AS nontax_total,
      COALESCE(SUM(CAST(amount AS REAL)),0) AS grand_total
    FROM payments ${where}`;
  db.get(sql, p, (err,row)=> err ? res.status(500).json({error:err.message}) : res.json(row));
});

app.post("/api/payments", (req,res)=>{
  const { student_id, date, amount, method, taxable, note } = req.body;
  db.run("INSERT INTO payments (student_id, date, amount, method, taxable, note) VALUES (?, ?, ?, ?, ?, ?)",
    [student_id, date, amount, method, taxable, note],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ id:this.lastID });});
});

app.delete("/api/payments/:id", (req,res)=>{
  db.run("DELETE FROM payments WHERE id=?", [req.params.id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ==================== EXPENSES ====================
app.get("/api/expenses", (req,res)=>{
  db.all("SELECT * FROM expenses ORDER BY date DESC, id DESC", [], (err,rows)=> err?res.status(500).json({error:err.message}):res.json(rows));
});

// Summary expenses (taxable/nontax/all) — CAST to REAL to be safe
app.get("/api/expenses/summary", (req,res)=>{
  const { from, to } = req.query;
  const cond=[], p=[];
  if (from) { cond.push("date >= ?"); p.push(from); }
  if (to)   { cond.push("date <= ?"); p.push(to); }
  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN taxable=1 THEN CAST(amount AS REAL) ELSE 0 END),0) AS taxable_total,
      COALESCE(SUM(CASE WHEN taxable=0 THEN CAST(amount AS REAL) ELSE 0 END),0) AS nontax_total,
      COALESCE(SUM(CAST(amount AS REAL)),0) AS grand_total
    FROM expenses ${where}`;
  db.get(sql, p, (err,row)=> err ? res.status(500).json({error:err.message}) : res.json(row));
});

app.post("/api/expenses", (req,res)=>{
  const { vendor, date, amount, taxable, category, note } = req.body;
  db.run("INSERT INTO expenses (vendor, date, amount, taxable, category, note) VALUES (?, ?, ?, ?, ?, ?)",
    [vendor, date, amount, taxable, category, note],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ id:this.lastID });});
});

// Edit expenses
app.put("/api/expenses/:id", (req,res)=>{
  const { vendor, date, amount, taxable, category, note } = req.body;
  db.run("UPDATE expenses SET vendor=?, date=?, amount=?, taxable=?, category=?, note=? WHERE id=?",
    [vendor, date, amount, taxable, category, note, req.params.id],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ updated:this.changes });});
});

// Delete expenses
app.delete("/api/expenses/:id", (req,res)=>{
  db.run("DELETE FROM expenses WHERE id=?", [req.params.id],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ deleted:this.changes });});
});

// ==================== LEADS ====================
// Compute age_days in SQL so colors work even if created_at is NULL
app.get("/api/leads", (req,res)=>{
  const sql = `
    SELECT
      id, name, phone, email, interested_program, follow_up_date, status, notes, created_at,
      CAST(julianday('now') - julianday(COALESCE(created_at, follow_up_date, date('now'))) AS INTEGER) AS age_days
    FROM leads
    ORDER BY id DESC`;
  db.all(sql, [], (err,rows)=> err?res.status(500).json({error:err.message}):res.json(rows));
});

app.post("/api/leads", (req,res)=>{
  const { name, phone, email, interested_program, follow_up_date, status, notes } = req.body;
  db.run(`INSERT INTO leads (name, phone, email, interested_program, follow_up_date, status, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, phone, email, interested_program, follow_up_date, status, notes, todayISO()],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ id:this.lastID });});
});

// Full update (edit)
app.put("/api/leads/:id", (req,res)=>{
  const { name, phone, email, interested_program, follow_up_date, status, notes } = req.body;
  db.run(`UPDATE leads SET name=?, phone=?, email=?, interested_program=?, follow_up_date=?, status=?, notes=? WHERE id=?`,
    [name, phone, email, interested_program, follow_up_date, status, notes, req.params.id],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ updated:this.changes });});
});

// Quick update (status/notes)
app.patch("/api/leads/:id", (req,res)=>{
  const { status, notes } = req.body;
  db.run("UPDATE leads SET status=COALESCE(?,status), notes=COALESCE(?,notes) WHERE id=?",
    [status||null, notes||null, req.params.id],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ updated:this.changes });});
});

// Delete lead
app.delete("/api/leads/:id", (req,res)=>{
  db.run("DELETE FROM leads WHERE id=?", [req.params.id],
    function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ deleted:this.changes });});
});

// ==================== ATTENDANCE ====================
app.get("/api/attendance", (req,res)=>{
  const sql = `SELECT a.id,a.student_id,a.date,a.present,COALESCE(s.name,'ID '||a.student_id) AS student_name
               FROM attendance a LEFT JOIN students s ON a.student_id=s.id
               ORDER BY a.date DESC, a.id DESC`;
  db.all(sql, [], (err,rows)=> err?res.status(500).json({error:err.message}):res.json(rows));
});
app.post("/api/attendance", (req,res)=>{
  let { student_id, date, present } = req.body;
  const sid = parseInt(student_id,10);
  const pres = (present==1 || present==="1" || present===true || present==="true") ? 1 : 0;
  const d = (date && String(date).trim()) ? String(date).slice(0,10) : todayISO();
  if (!Number.isFinite(sid)) return res.status(400).json({ error:"student_id is required" });

  db.get("SELECT id FROM students WHERE id=?", [sid], (e,row)=>{
    if (e) return res.status(500).json({ error:e.message });
    if (!row) return res.status(400).json({ error:"Student "+sid+" not found" });

    db.run("INSERT INTO attendance (student_id,date,present) VALUES (?,?,?)", [sid,d,pres], function(err2){
      if (err2) return res.status(500).json({ error: err2.message });
      db.get(`SELECT a.id,a.student_id,a.date,a.present,COALESCE(s.name,'ID '||a.student_id) AS student_name
              FROM attendance a LEFT JOIN students s ON a.student_id=s.id WHERE a.id=?`,
        [this.lastID],
        (e2,row2)=> e2?res.status(500).json({error:e2.message}):res.json(row2));
    });
  });
});
app.delete("/api/attendance/:id", (req,res)=>{
  db.run("DELETE FROM attendance WHERE id=?", [req.params.id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted:this.changes });
  });
});

// ==================== ACCOUNTING COMBINED + DIAGNOSTICS ====================
app.get("/api/accounting/summary", (req,res)=>{
  const { from, to } = req.query;
  const run = (sql, params)=> new Promise((resolve,reject)=>{
    db.get(sql, params, (e,row)=> e?reject(e):resolve(row||{}));
  });
  const cond=[], p=[];
  if (from){ cond.push("date >= ?"); p.push(from); }
  if (to){ cond.push("date <= ?"); p.push(to); }
  const where = cond.length ? ("WHERE "+cond.join(" AND ")) : "";
  const paySQL = `SELECT
    COALESCE(SUM(CASE WHEN taxable=1 THEN CAST(amount AS REAL) ELSE 0 END),0) AS income_taxable,
    COALESCE(SUM(CASE WHEN taxable=0 THEN CAST(amount AS REAL) ELSE 0 END),0) AS income_nontax,
    COALESCE(SUM(CAST(amount AS REAL)),0) AS income_total
    FROM payments ${where}`;
  const expSQL = `SELECT
    COALESCE(SUM(CASE WHEN taxable=1 THEN CAST(amount AS REAL) ELSE 0 END),0) AS expense_taxable,
    COALESCE(SUM(CASE WHEN taxable=0 THEN CAST(amount AS REAL) ELSE 0 END),0) AS expense_nontax,
    COALESCE(SUM(CAST(amount AS REAL)),0) AS expense_total
    FROM expenses ${where}`;
  Promise.all([run(paySQL,p), run(expSQL,p)]).then(([i,e])=>{
    res.json({
      ...i, ...e,
      net_total: (i.income_total||0) - (e.expense_total||0)
    });
  }).catch(err=> res.status(500).json({ error: err.message }));
});

// Quick diagnostics for Accounting page
app.get("/api/accounting/stats", (req,res)=>{
  const q = (sql)=> new Promise((resolve,reject)=> db.get(sql, [], (e,row)=> e?reject(e):resolve(row)));
  Promise.all([
    q("SELECT COUNT(*) AS payments_count, MIN(date) AS min_date, MAX(date) AS max_date FROM payments"),
    q("SELECT COUNT(*) AS expenses_count, MIN(date) AS min_date, MAX(date) AS max_date FROM expenses")
  ]).then(([p,e])=>{
    res.json({ payments:p, expenses:e });
  }).catch(err=> res.status(500).json({ error: err.message }));
});

// --- start ---
app.listen(PORT, "0.0.0.0", ()=>{
  console.log(">>> server.js started <<<");
  console.log("Server running on port " + PORT + " (data at " + DATA_DIR + ")");
});
