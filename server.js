const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");

const app = express();
  
// --- sanitizeLeadsBody & sanitizeExpensesBody (auto-inserted) ---
app.use('/api/leads', (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      const keep = new Set(['name','phone','email','interested_program','id']);
      Object.keys(req.body).forEach(k => { if (!keep.has(k)) delete req.body[k]; });
    }
  } catch (e) {}
  next();
});

app.use('/api/expenses', (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      const keep = new Set(['vendor','amount','date','taxable','id']);
      Object.keys(req.body).forEach(k => { if (!keep.has(k)) delete req.body[k]; });
      if (typeof req.body.amount === 'string') req.body.amount = Number(req.body.amount || 0);
      if (typeof req.body.taxable === 'string') req.body.taxable = Number(req.body.taxable ? 1 : 0);
    }
  } catch (e) {}
  next();
});
// --- end sanitizers ---
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH = process.env.DOJO_DB || path.join(DATA_DIR, "dojo.db");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Disk storage for photos
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file?.originalname || "") || ".jpg";
    cb(null, `student_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(UPLOADS_DIR));
// simple logger
app.use((req,res,next)=>{ console.log(`[${new Date().toISOString()}]`, req.method, req.url); next(); });

// --- DB helpers ---
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) { console.error("DB open error:", err); process.exit(1); }
});
const run = (sql, p=[]) => new Promise((res, rej)=>db.run(sql, p, function(e){ e?rej(e):res(this); }));
const all = (sql, p=[]) => new Promise((res, rej)=>db.all(sql, p, (e,r)=>e?rej(e):res(r)));
const get = (sql, p=[]) => new Promise((res, rej)=>db.get(sql, p, (e,r)=>e?rej(e):res(r)));

(async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name  TEXT NOT NULL,
      phone      TEXT,
      email      TEXT,
      address    TEXT,
      age        INTEGER,
      parents_name TEXT,
      program    TEXT,
      referral_source TEXT,
      picture_path TEXT,
      join_date    TEXT,
      renewal_date TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT,
      note TEXT,
      taxable INTEGER DEFAULT 1,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      vendor TEXT,
      category TEXT,
      amount REAL NOT NULL,
      taxable INTEGER DEFAULT 0,
      note TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      present INTEGER DEFAULT 1,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      interested_program TEXT,
      source TEXT,
      follow_up_date TEXT,
      status TEXT DEFAULT 'new',
      notes TEXT
    )
  `);
})().catch(e=>console.error("Migration error:", e));

// Helpers
const todayISO = ()=> new Date().toISOString().slice(0,10);
const plusDaysISO = (base, d)=>{ const t = base? new Date(base) : new Date(); t.setDate(t.getDate()+d); return t.toISOString().slice(0,10); };

// ===== STUDENTS =====
app.get("/api/students", async (req,res)=>{
  try{
    const rows = await all(`
      SELECT s.*,
        (SELECT COUNT(*) FROM payments p WHERE p.student_id=s.id) AS payment_count
      FROM students s
      ORDER BY s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE
    `);
    res.json(rows);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.get("/api/students/:id", async (req,res)=>{
  try{
    const row = await get(`SELECT * FROM students WHERE id=?`, [req.params.id]);
    if(!row) return res.status(404).json({error:"Not found"});
    res.json(row);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.post("/api/students", upload.single("picture"), async (req,res)=>{
  try{
    const b = req.body;
    if(!b.first_name || !b.last_name) return res.status(400).json({error:"first_name and last_name are required"});
    const join = b.join_date?.trim() || todayISO();
    const renewal = b.renewal_date?.trim() || plusDaysISO(join, 28);
    const pic = req.file ? `/uploads/${path.basename(req.file.path)}` : null;

    const r = await run(`
      INSERT INTO students (first_name,last_name,phone,email,address,age,parents_name,program,referral_source,picture_path,join_date,renewal_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `,[b.first_name,b.last_name,b.phone,b.email,b.address,(b.age===""?null:b.age),b.parents_name,b.program,b.referral_source,pic,join,renewal]);

    const created = await get(`SELECT * FROM students WHERE id=?`, [r.lastID]);
    res.status(201).json(created);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.put("/api/students/:id", upload.single("picture"), async (req,res)=>{
  try{
    const id = req.params.id;
    const existing = await get(`SELECT * FROM students WHERE id=?`, [id]);
    if(!existing) return res.status(404).json({error:"Not found"});

    const b = req.body;
    let newPic = existing.picture_path;
    if (req.file){
      if (existing.picture_path){
        const base = path.basename(existing.picture_path);
        const full = path.join(UPLOADS_DIR, base);
        fs.access(full, fs.constants.F_OK, (err)=>{ if(!err) fs.unlink(full,()=>{}); });
      }
      newPic = `/uploads/${path.basename(req.file.path)}`;
    } else if (b.remove_picture === "1"){
      if (existing.picture_path){
        const base = path.basename(existing.picture_path);
        const full = path.join(UPLOADS_DIR, base);
        fs.access(full, fs.constants.F_OK, (err)=>{ if(!err) fs.unlink(full,()=>{}); });
      }
      newPic = null;
    }

    const join = b.join_date?.trim() || existing.join_date || todayISO();
    const renewal = b.renewal_date?.trim() || existing.renewal_date || plusDaysISO(join, 28);

    await run(`
      UPDATE students SET
        first_name=COALESCE(?, first_name),
        last_name =COALESCE(?, last_name),
        phone =COALESCE(?, phone),
        email =COALESCE(?, email),
        address =COALESCE(?, address),
        age =COALESCE(?, age),
        parents_name=COALESCE(?, parents_name),
        program=COALESCE(?, program),
        referral_source=COALESCE(?, referral_source),
        picture_path=?,
        join_date=?,
        renewal_date=?
      WHERE id=?
    `,[b.first_name,b.last_name,b.phone,b.email,b.address,(b.age===""?null:b.age),b.parents_name,b.program,b.referral_source,newPic,join,renewal,id]);

    const updated = await get(`SELECT * FROM students WHERE id=?`, [id]);
    res.json(updated);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.delete("/api/students/:id", async (req,res)=>{
  try{
    const s = await get(`SELECT * FROM students WHERE id=?`, [req.params.id]);
    if(!s) return res.status(404).json({error:"Not found"});
    if (s.picture_path){
      const base = path.basename(s.picture_path);
      const full = path.join(UPLOADS_DIR, base);
      fs.access(full, fs.constants.F_OK, (err)=>{ if(!err) fs.unlink(full,()=>{}); });
    }
    await run(`DELETE FROM students WHERE id=?`, [req.params.id]);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message});}
});

// Per-student payments
app.get("/api/students/:id/payments", async (req,res)=>{
  try{ res.json(await all(`SELECT * FROM payments WHERE student_id=? ORDER BY date DESC`, [req.params.id])); }
  catch(e){ res.status(500).json({error:e.message});}
});
app.post("/api/students/:id/payments", async (req,res)=>{
  try{
    const sid = +req.params.id;
    const { amount, date, method, note, taxable } = req.body;
    if(!amount) return res.status(400).json({error:"amount required"});
    const d = (date && date.trim()) ? date : todayISO();
    const tx = (typeof taxable === "undefined") ? 1 : (Number(taxable)?1:0);
    const r = await run(`INSERT INTO payments (student_id,date,amount,method,note,taxable) VALUES (?,?,?,?,?,?)`,
      [sid, d, Number(amount), method||null, note||null, tx]);
    const created = await get(`SELECT * FROM payments WHERE id=?`, [r.lastID]);
    res.status(201).json(created);
  }catch(e){ res.status(500).json({error:e.message});}
});

// PAYMENTS (global)
app.get("/api/payments", async (req,res)=>{
  try{
    const { start, end } = req.query;
    let sql = `SELECT p.*, s.first_name || ' ' || s.last_name AS student_name
               FROM payments p LEFT JOIN students s ON s.id = p.student_id`;
    const cond=[]; const args=[];
    if (start){ cond.push("p.date >= ?"); args.push(start); }
    if (end){ cond.push("p.date <= ?"); args.push(end); }
    if (cond.length) sql += " WHERE " + cond.join(" AND ");
    sql += " ORDER BY p.date DESC, p.id DESC";
    res.json(await all(sql, args));
  }catch(e){ res.status(500).json({error:e.message});}
});
app.post("/api/payments", async (req,res)=>{
  try{
    const { student_id, amount, date, method, note, taxable } = req.body;
    if(!student_id || !amount) return res.status(400).json({error:"student_id and amount required"});
    const d = (date && date.trim()) ? date : todayISO();
    const tx = (typeof taxable === "undefined") ? 1 : (Number(taxable)?1:0);
    const r = await run(`INSERT INTO payments (student_id,date,amount,method,note,taxable) VALUES (?,?,?,?,?,?)`,
      [Number(student_id), d, Number(amount), method||null, note||null, tx]);
    const created = await get(`SELECT * FROM payments WHERE id=?`, [r.lastID]);
    res.status(201).json(created);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.delete("/api/payments/:id", async (req,res)=>{
  try{ await run(`DELETE FROM payments WHERE id=?`, [req.params.id]); res.json({ok:true}); }
  catch(e){ res.status(500).json({error:e.message});}
});

// EXPENSES
app.get("/api/expenses", async (req,res)=>{
  try{
    const { start, end } = req.query;
    let sql = `SELECT * FROM expenses`;
    const cond=[]; const args=[];
    if (start){ cond.push("date >= ?"); args.push(start); }
    if (end){ cond.push("date <= ?"); args.push(end); }
    if (cond.length) sql += " WHERE " + cond.join(" AND ");
    sql += " ORDER BY date DESC, id DESC";
    res.json(await all(sql, args));
  }catch(e){ res.status(500).json({error:e.message});}
});
app.post("/api/expenses", async (req,res)=>{
  try{
    const { date, vendor, category, amount, taxable, note } = req.body;
    if(!amount) return res.status(400).json({error:"amount required"});
    const d = (date && date.trim()) ? date : todayISO();
    const tx = (typeof taxable === "undefined") ? 0 : (Number(taxable)?1:0);
    const r = await run(`INSERT INTO expenses (date,vendor,category,amount,taxable,note) VALUES (?,?,?,?,?,?)`,
      [d, vendor||null, category||null, Number(amount), tx, note||null]);
    const created = await get(`SELECT * FROM expenses WHERE id=?`, [r.lastID]);
    res.status(201).json(created);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.put("/api/expenses/:id", async (req,res)=>{
  try{
    const { date, vendor, category, amount, taxable, note } = req.body;
    await run(`
      UPDATE expenses SET
        date=COALESCE(?, date),
        vendor=COALESCE(?, vendor),
        category=COALESCE(?, category),
        amount=COALESCE(?, amount),
        taxable=COALESCE(?, taxable),
        note=COALESCE(?, note)
      WHERE id=?
    `,[date||null, vendor||null, category||null, (amount===""?null:Number(amount)), (typeof taxable==="undefined"?null:(Number(taxable)?1:0)), note||null, req.params.id]);
    res.json(await get(`SELECT * FROM expenses WHERE id=?`, [req.params.id]));
  }catch(e){ res.status(500).json({error:e.message});}
});
app.delete("/api/expenses/:id", async (req,res)=>{
  try{ await run(`DELETE FROM expenses WHERE id=?`, [req.params.id]); res.json({ok:true});}
  catch(e){ res.status(500).json({error:e.message});}
});

// ATTENDANCE
app.get("/api/attendance", async (req,res)=>{
  try{
    const { date } = req.query;
    if (date){
      const rows = await all(`
        SELECT a.*, s.first_name || ' ' || s.last_name AS student_name
        FROM attendance a JOIN students s ON s.id=a.student_id
        WHERE a.date=?
        ORDER BY s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE
      `,[date]);
      return res.json(rows);
    }
    const rows = await all(`
      SELECT a.*, s.first_name || ' ' || s.last_name AS student_name
      FROM attendance a JOIN students s ON s.id=a.student_id
      ORDER BY a.date DESC, a.id DESC LIMIT 200
    `);
    res.json(rows);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.post("/api/attendance", async (req,res)=>{
  try{
    const { date, marks } = req.body; // [{student_id, present}]
    const d = (date && date.trim()) ? date : todayISO();
    if (!Array.isArray(marks)) return res.status(400).json({error:"marks array required"});
    await run(`DELETE FROM attendance WHERE date=?`, [d]);
    for (const m of marks){
      if (!m.student_id) continue;
      await run(`INSERT INTO attendance (student_id,date,present) VALUES (?,?,?)`,
        [Number(m.student_id), d, (m.present?1:0)]);
    }
    res.json({ok:true, date:d});
  }catch(e){ res.status(500).json({error:e.message});}
});

// LEADS
app.get("/api/leads", async (req,res)=>{
  try{ res.json(await all(`SELECT * FROM leads ORDER BY COALESCE(follow_up_date,'9999-12-31') ASC, id DESC`)); }
  catch(e){ res.status(500).json({error:e.message});}
});
app.post("/api/leads", async (req,res)=>{
  try{
    const { name, phone, email, interested_program, source, follow_up_date, status, notes } = req.body;
    if(!name) return res.status(400).json({error:"name required"});
    const r = await run(`INSERT INTO leads (name,phone,email,interested_program,source,follow_up_date,status,notes) VALUES (?,?,?,?,?,?,?,?)`,
      [name, phone||null, email||null, interested_program||null, source||null, follow_up_date||null, status||"new", notes||null]);
    const created = await get(`SELECT * FROM leads WHERE id=?`, [r.lastID]);
    res.status(201).json(created);
  }catch(e){ res.status(500).json({error:e.message});}
});
app.put("/api/leads/:id", async (req,res)=>{
  try{
    const { name, phone, email, interested_program, source, follow_up_date, status, notes } = req.body;
    await run(`
      UPDATE leads SET
        name=COALESCE(?, name),
        phone=COALESCE(?, phone),
        email=COALESCE(?, email),
        interested_program=COALESCE(?, interested_program),
        source=COALESCE(?, source),
        follow_up_date=COALESCE(?, follow_up_date),
        status=COALESCE(?, status),
        notes=COALESCE(?, notes)
      WHERE id=?
    `,[name||null, phone||null, email||null, interested_program||null, source||null, follow_up_date||null, status||null, notes||null, req.params.id]);
    res.json(await get(`SELECT * FROM leads WHERE id=?`, [req.params.id]));
  }catch(e){ res.status(500).json({error:e.message});}
});
app.delete("/api/leads/:id", async (req,res)=>{
  try{ await run(`DELETE FROM leads WHERE id=?`, [req.params.id]); res.json({ok:true});}
  catch(e){ res.status(500).json({error:e.message});}
});

// ACCOUNTING SUMMARY
app.get("/api/accounting/summary", async (req,res)=>{
  try{
    const { start, end } = req.query;
    const condPay=[]; const condExp=[]; const argsPay=[]; const argsExp=[];
    if (start){ condPay.push("date >= ?"); argsPay.push(start); condExp.push("date >= ?"); argsExp.push(start); }
    if (end){ condPay.push("date <= ?"); argsPay.push(end); condExp.push("date <= ?"); argsExp.push(end); }
    const payWhere = condPay.length ? ("WHERE " + condPay.join(" AND ")) : "";
    const expWhere = condExp.length ? ("WHERE " + condExp.join(" AND ")) : "";
    const totalIncome = (await get(`SELECT COALESCE(SUM(amount),0) AS t FROM payments ${payWhere}`, argsPay)).t || 0;
    const totalExpenses = (await get(`SELECT COALESCE(SUM(amount),0) AS t FROM expenses ${expWhere}`, argsExp)).t || 0;
    const taxableExpenses = (await get(`SELECT COALESCE(SUM(amount),0) AS t FROM expenses ${expWhere?expWhere+" AND ":"WHERE "} taxable=1`, argsExp)).t || 0;
    const nontaxExpenses = (await get(`SELECT COALESCE(SUM(amount),0) AS t FROM expenses ${expWhere?expWhere+" AND ":"WHERE "} taxable=0`, argsExp)).t || 0;
    res.json({ start:start||null, end:end||null, totalIncome, totalExpenses, taxableExpenses, nonTaxableExpenses:nontaxExpenses, net:(totalIncome-totalExpenses) });
  }catch(e){ res.status(500).json({error:e.message});}
});

/* === DOJO_RUN_PATCH === */
(function attachLeadsPatch(){
  try{
    function arm(){
      if (!(global.db && typeof db.run === 'function')) return false;
      const _run = db.run.bind(db);
      db.run = function(sql, params, cb){
        if (typeof params === 'function') { cb = params; params = []; }
        if (!Array.isArray(params)) params = params != null ? [params] : [];
        let s = String(sql||'');

        if (/INSERT\s+INTO\s+leads/i.test(s)) {
          s = s.replace(/(\bleads\s*\([^)]*?)(,\s*source)(\s*\))/i, '');
          s = s.replace(/(VALUES\s*\([^)]*?)(,\s*\?)(\s*\))/i, '');
          if (params.length >= 1) params = params.slice(0, params.length-1);
        }

        if (/UPDATE\s+leads\s+SET/i.test(s)) {
          s = s.replace(/,\s*source\s*=\s*\?/i, '');
          s = s.replace(/source\s*=\s*\?,\s*/i, '');
          s = s.replace(/,\s*(WHERE\s+id\s*=\s*\?)/i, ' ');
          if (params.length >= 2) params.splice(params.length-2, 1);
        }

        return _run(s, params, cb);
      };
      console.log('[dojo] db.run monkeypatch active for leads');
      return true;
    }
    if (!arm()) setTimeout(attachLeadsPatch, 200);
  }catch(e){
    console.log('[dojo] db.run patch error', e && e.message || e);
  }
})();
/* === END DOJO_RUN_PATCH === */app.listen(PORT, ()=>{
  console.log(">>> server.js started <<<");
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`[dojo] DB = ${DB_PATH}`);
  console.log(`[dojo] Uploads = ${UPLOADS_DIR}`);
  console.log("Routes: /api/students, /api/payments, /api/expenses, /api/attendance, /api/leads, /api/accounting/summary");
});









