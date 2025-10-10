/* server.js — build v2025-10-10-5 (adds lead → student conversion) */
const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req,res,next)=>{ res.setHeader('Cache-Control','no-store'); next(); });
app.use(express.static(PUBLIC_DIR));

const DB_PATH = process.env.DOJO_DB || path.join(__dirname, 'dojo.db');
console.log('[dojo] DB =', DB_PATH);
const db = new sqlite3.Database(DB_PATH);

// helpers
function run(db, sql, params = []) { return new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { if (err) return reject(err); resolve(this); });
});}
function all(db, sql, params = []) { return new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});}
function get(db, sql, params = []) { return new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});}
async function ensureColumn(table, column, type) {
  const cols = await all(db, `PRAGMA table_info(${table})`);
  if (!cols.some(c => c.name === column)) {
    await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`Auto-migrate: ${table}.${column} added`);
  } else {
    console.log(`Auto-migrate: ${table}.${column} exists`);
  }
}

async function migrate() {
  await run(db, `CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT, last_name TEXT,
    phone TEXT, email TEXT, address TEXT,
    age INTEGER, program TEXT,
    start_date TEXT, renewal_date TEXT,
    parent_name TEXT, notes TEXT,
    active INTEGER DEFAULT 1
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER, date TEXT, present INTEGER DEFAULT 1,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER, amount REAL, method TEXT, taxable INTEGER, date TEXT, notes TEXT,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT, category TEXT, amount REAL, taxable INTEGER, date TEXT, notes TEXT
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, phone TEXT, email TEXT,
    interested_program TEXT, follow_up_date TEXT,
    status TEXT DEFAULT 'new', notes TEXT
  )`);

  // defensive columns
  await ensureColumn('students','first_name','TEXT');
  await ensureColumn('students','last_name','TEXT');
  await ensureColumn('students','phone','TEXT');
  await ensureColumn('students','email','TEXT');
  await ensureColumn('students','address','TEXT');
  await ensureColumn('students','age','INTEGER');
  await ensureColumn('students','program','TEXT');
  await ensureColumn('students','start_date','TEXT');
  await ensureColumn('students','renewal_date','TEXT');
  await ensureColumn('students','parent_name','TEXT');
  await ensureColumn('students','notes','TEXT');
  await ensureColumn('students','active','INTEGER DEFAULT 1');

  console.log('>>> Migrations complete');
}

/* ---------- Students ---------- */
app.get('/api/students', async (req, res) => {
  try {
    const filter = (req.query.active ?? '1').toString().toLowerCase(); // '1'|'0'|'all'
    let sql = `SELECT * FROM students`;
    if (filter === '1') sql += ` WHERE active=1`;
    else if (filter === '0') sql += ` WHERE active=0`;
    sql += ` ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`;
    res.json(await all(db, sql));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/students', async (req, res) => {
  try {
    const { first_name,last_name,phone,email,address,age,program,start_date,renewal_date,parent_name,notes } = req.body;
    const fn = (first_name||'').trim(), ln = (last_name||'').trim();
    if (!fn && !ln) return res.status(400).json({ error: 'Please provide at least a first or last name.' });
    const r = await run(db, `INSERT INTO students
      (first_name,last_name,phone,email,address,age,program,start_date,renewal_date,parent_name,notes,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      [ fn, ln, phone||'', email||'', address||'',
        Number.isFinite(+age)?+age:null, program||'', start_date||'',
        renewal_date||'', parent_name||'', notes||'' ]);
    res.json(await get(db, `SELECT * FROM students WHERE id=?`, [r.lastID]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/students/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    const fields = ['first_name','last_name','phone','email','address','age','program','start_date','renewal_date','parent_name','notes','active'];
    const sets=[], vals=[];
    for (const f of fields) if (f in req.body) {
      sets.push(`${f}=?`);
      vals.push(f==='age'?(Number.isFinite(+req.body[f])?+req.body[f]:null):f==='active'?(+req.body[f]?1:0):req.body[f]);
    }
    if (!sets.length) return res.status(400).json({ error:'No fields to update' });
    vals.push(id);
    await run(db, `UPDATE students SET ${sets.join(', ')} WHERE id=?`, vals);
    res.json(await get(db, `SELECT * FROM students WHERE id=?`, [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/students/:id/archive', async (req, res) => {
  try { await run(db, `UPDATE students SET active=? WHERE id=?`, [(req.query.active==='1')?1:0, +req.params.id]); res.json(await get(db, `SELECT * FROM students WHERE id=?`, [+req.params.id])); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/students/:id', async (req, res) => {
  try { await run(db, `DELETE FROM students WHERE id=?`, [+req.params.id]); res.json({ok:true}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Attendance ---------- */
app.get('/api/attendance', async (req, res) => {
  try { res.json(await all(db, `SELECT a.*, s.first_name, s.last_name FROM attendance a LEFT JOIN students s ON s.id=a.student_id ORDER BY date DESC, a.id DESC`)); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.post('/api/attendance', async (req, res) => {
  try { const { student_id, date, present } = req.body; const r = await run(db, `INSERT INTO attendance (student_id,date,present) VALUES (?,?,?)`, [ +student_id||null, date||new Date().toISOString().slice(0,10), present?1:0 ]); res.json(await get(db, `SELECT * FROM attendance WHERE id=?`, [r.lastID])); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.delete('/api/attendance/:id', async (req, res) => {
  try { await run(db, `DELETE FROM attendance WHERE id=?`, [+req.params.id]); res.json({ok:true}); }
  catch (e) { res.status(500).json({ error:e.message }); }
});

/* ---------- Payments ---------- */
app.get('/api/payments', async (req, res) => {
  try { res.json(await all(db, `SELECT p.*, s.first_name, s.last_name FROM payments p LEFT JOIN students s ON s.id=p.student_id ORDER BY date DESC, p.id DESC`)); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.post('/api/payments', async (req, res) => {
  try { const { student_id, amount, method, taxable, date, notes } = req.body; const r = await run(db, `INSERT INTO payments (student_id,amount,method,taxable,date,notes) VALUES (?,?,?,?,?,?)`, [ +student_id||null, +amount||0, method||'cash', (taxable?1:0), date||new Date().toISOString().slice(0,10), notes||'' ]); res.json(await get(db, `SELECT * FROM payments WHERE id=?`, [r.lastID])); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.delete('/api/payments/:id', async (req, res) => {
  try { await run(db, `DELETE FROM payments WHERE id=?`, [+req.params.id]); res.json({ok:true}); }
  catch (e) { res.status(500).json({ error:e.message }); }
});

/* ---------- Expenses ---------- */
app.get('/api/expenses', async (req, res) => {
  try { res.json(await all(db, `SELECT * FROM expenses ORDER BY date DESC, id DESC`)); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.post('/api/expenses', async (req, res) => {
  try { const { vendor, category, amount, taxable, date, notes } = req.body; const r = await run(db, `INSERT INTO expenses (vendor,category,amount,taxable,date,notes) VALUES (?,?,?,?,?,?)`, [ vendor||'', category||'', +amount||0, (taxable?1:0), date||new Date().toISOString().slice(0,10), notes||'' ]); res.json(await get(db, `SELECT * FROM expenses WHERE id=?`, [r.lastID])); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.delete('/api/expenses/:id', async (req, res) => {
  try { await run(db, `DELETE FROM expenses WHERE id=?`, [+req.params.id]); res.json({ok:true}); }
  catch (e) { res.status(500).json({ error:e.message }); }
});

/* ---------- Leads ---------- */
app.get('/api/leads', async (req, res) => {
  try { res.json(await all(db, `SELECT * FROM leads ORDER BY COALESCE(follow_up_date,'') DESC, id DESC`)); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.post('/api/leads', async (req, res) => {
  try { const { name, phone, email, interested_program, follow_up_date, status, notes } = req.body; const r = await run(db, `INSERT INTO leads (name,phone,email,interested_program,follow_up_date,status,notes) VALUES (?,?,?,?,?,?,?)`, [ name||'', phone||'', email||'', interested_program||'', follow_up_date||'', status||'new', notes||'' ]); res.json(await get(db, `SELECT * FROM leads WHERE id=?`, [r.lastID])); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.put('/api/leads/:id', async (req, res) => {
  try { const id=+req.params.id; const fields=['name','phone','email','interested_program','follow_up_date','status','notes']; const sets=[],vals=[]; for(const f of fields) if(f in req.body){ sets.push(`${f}=?`); vals.push(req.body[f]); } if(!sets.length) return res.status(400).json({error:'No fields to update'}); vals.push(id); await run(db, `UPDATE leads SET ${sets.join(', ')} WHERE id=?`, vals); res.json(await get(db, `SELECT * FROM leads WHERE id=?`, [id])); }
  catch (e) { res.status(500).json({ error:e.message }); }
});
app.delete('/api/leads/:id', async (req, res) => {
  try { await run(db, `DELETE FROM leads WHERE id=?`, [+req.params.id]); res.json({ok:true}); }
  catch (e) { res.status(500).json({ error:e.message }); }
});

/* --- Lead → Student convert --- */
function cleanPrefix(name='') {
  const t = name.trim().replace(/\s+/g,' ');
  const parts = t.split(' ');
  const first = (parts[0]||'').replace(/^[\.\,]+|[\.\,]+$/g,'').toLowerCase();
  const prefixes = new Set(['mr','mrs','ms','miss','dr','sir','madam']);
  if (prefixes.has(first)) return parts.slice(1).join(' ') || t;
  return t;
}
function splitName(name='') {
  const s = cleanPrefix(name);
  const parts = s.split(' ');
  if (parts.length === 1) return { first_name: s, last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function plus28(iso){ const d=new Date(iso); d.setDate(d.getDate()+28); return d.toISOString().slice(0,10); }

app.post('/api/leads/:id/convert', async (req, res) => {
  try {
    const id = +req.params.id;
    const lead = await get(db, `SELECT * FROM leads WHERE id=?`, [id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { first_name, last_name } = splitName(lead.name || '');
    if (!first_name && !last_name) return res.status(400).json({ error: 'Lead has no usable name' });

    const start = todayISO();
    const renewal = plus28(start);

    // Try to find an existing student by email or phone
    let existing = null;
    if ((lead.email||'').trim()) {
      existing = await get(db, `SELECT * FROM students WHERE LOWER(email)=LOWER(?)`, [lead.email.trim()]);
    }
    if (!existing && (lead.phone||'').trim()) {
      existing = await get(db, `SELECT * FROM students WHERE REPLACE(phone,' ','')=REPLACE(?, ' ','')`, [lead.phone.trim()]);
    }

    if (existing) {
      // Update existing student with any missing info
      const sets = [];
      const vals = [];
      if (!existing.first_name && first_name) { sets.push('first_name=?'); vals.push(first_name); }
      if (!existing.last_name  && last_name)  { sets.push('last_name=?');  vals.push(last_name);  }
      if (!existing.phone      && lead.phone) { sets.push('phone=?');      vals.push(lead.phone); }
      if (!existing.email      && lead.email) { sets.push('email=?');      vals.push(lead.email); }
      if (!existing.program    && lead.interested_program) { sets.push('program=?'); vals.push(lead.interested_program); }
      if (!existing.start_date) { sets.push('start_date=?'); vals.push(start); }
      if (!existing.renewal_date) { sets.push('renewal_date=?'); vals.push(renewal); }
      sets.push('active=?'); vals.push(1);
      sets.push('notes=COALESCE(notes, "") || ?'); vals.push(` Converted from lead #${id}.`);
      if (sets.length) {
        await run(db, `UPDATE students SET ${sets.join(', ')} WHERE id=?`, [...vals, existing.id]);
      }
      await run(db, `UPDATE leads SET status='converted' WHERE id=?`, [id]);
      const student = await get(db, `SELECT * FROM students WHERE id=?`, [existing.id]);
      return res.json({ converted:true, updated_existing:true, student, lead_id:id });
    } else {
      // Create new student
      const r = await run(db, `INSERT INTO students
        (first_name,last_name,phone,email,program,start_date,renewal_date,notes,active)
        VALUES (?,?,?,?,?,?,?,?,1)`,
        [ first_name, last_name, lead.phone||'', lead.email||'', lead.interested_program||'', start, renewal, `Converted from lead #${id}.` ]);
      await run(db, `UPDATE leads SET status='converted' WHERE id=?`, [id]);
      const student = await get(db, `SELECT * FROM students WHERE id=?`, [r.lastID]);
      return res.json({ converted:true, created_new:true, student, lead_id:id });
    }
  } catch (e) {
    res.status(500).json({ error:e.message });
  }
});

/* ---------- Summary ---------- */
app.get('/api/summary', async (req, res) => {
  try {
    const income = await all(db, `SELECT SUM(amount) AS total_income, SUM(CASE WHEN taxable=1 THEN amount ELSE 0 END) AS taxable_income FROM payments`);
    const expenses = await all(db, `SELECT SUM(amount) AS total_expenses, SUM(CASE WHEN taxable=1 THEN amount ELSE 0 END) AS taxable_expenses FROM expenses`);
    const total_income = income[0]?.total_income || 0;
    const taxable_income = income[0]?.taxable_income || 0;
    const total_expenses = expenses[0]?.total_expenses || 0;
    const taxable_expenses = expenses[0]?.taxable_expenses || 0;
    const net = (total_income||0) - (total_expenses||0);
    res.json({ total_income:+(+total_income).toFixed(2), taxable_income:+(+taxable_income).toFixed(2), total_expenses:+(+total_expenses).toFixed(2), taxable_expenses:+(+taxable_expenses).toFixed(2), net:+(+net).toFixed(2) });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

(async () => {
  try { await migrate(); app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)); }
  catch (err) { console.error('Migration/start error:', err); process.exit(1); }
})();

