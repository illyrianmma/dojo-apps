// server.js — Dojo Apps API + static
// Safe, idempotent migrations + backfill for join/renewal/status

const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Pick an existing DB if present; otherwise use ./dojo.db
const DB_CANDIDATES = [
  path.join(__dirname, 'dojo.db'),
  path.join(__dirname, 'data', 'dojo.db'),
  '/data/dojo.db', // Render's persistent disk
];
let DB_PATH = DB_CANDIDATES.find(p => fs.existsSync(p)) || DB_CANDIDATES[0];
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

console.log('[dojo] DB =', DB_PATH);
const db = new sqlite3.Database(DB_PATH);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- tiny promisified helpers ---
const all = (sql, args=[]) => new Promise((res, rej)=>db.all(sql, args, (e,r)=>e?rej(e):res(r)));
const get = (sql, args=[]) => new Promise((res, rej)=>db.get(sql, args, (e,r)=>e?rej(e):res(r)));
const run = (sql, args=[]) => new Promise((res, rej)=>db.run(sql, args, function(e){e?rej(e):res({changes:this.changes,lastID:this.lastID})}));

// --- date helpers (ISO yyyy-mm-dd) ---
const todayISO = () => new Date().toISOString().slice(0,10);

// --- schema + migrations + backfill ---
async function ensureSchema() {
  await run('PRAGMA foreign_keys=ON');

  // Leads
  await run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at TEXT,
      status TEXT DEFAULT 'open'
    )
  `);
  await maybeAddColumn('leads', 'status',       "status TEXT DEFAULT 'open'");
  await maybeAddColumn('leads', 'created_at',   "created_at TEXT");
  await run(`UPDATE leads SET status='open' WHERE status IS NULL OR status=''`);
  await run(`UPDATE leads SET created_at = DATE('now') WHERE created_at IS NULL OR created_at=''`);

  // Students
  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      email TEXT,
      join_date TEXT,
      renewal_date TEXT,
      status TEXT DEFAULT 'active'
    )
  `);
  await maybeAddColumn('students', 'status',       "status TEXT DEFAULT 'active'");
  await maybeAddColumn('students', 'join_date',    "join_date TEXT");
  await maybeAddColumn('students', 'renewal_date', "renewal_date TEXT");
  await run(`UPDATE students SET status='active' WHERE status IS NULL OR status=''`);

  // Backfill dates
  // 1) If renewal exists but join is missing -> join = renewal - 28 days
  await run(`
    UPDATE students
    SET join_date = DATE(renewal_date, '-28 days')
    WHERE (join_date IS NULL OR join_date='')
      AND (renewal_date IS NOT NULL AND renewal_date!='')
  `);
  // 2) If both join and renewal missing -> set both (today & +28)
  await run(`
    UPDATE students
    SET join_date = DATE('now'),
        renewal_date = DATE('now','+28 days')
    WHERE (join_date IS NULL OR join_date='')
      AND (renewal_date IS NULL OR renewal_date='')
  `);

  // Payments
  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      student_id INTEGER,
      amount REAL,
      method TEXT,
      taxable INTEGER DEFAULT 1,
      note TEXT
    )
  `);
  await maybeAddColumn('payments', 'taxable', "taxable INTEGER DEFAULT 1");

  // Expenses (optional; used by accounting)
  await run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      amount REAL,
      taxable INTEGER DEFAULT 1,
      note TEXT
    )
  `);
  await maybeAddColumn('expenses', 'taxable', "taxable INTEGER DEFAULT 1");
}

async function maybeAddColumn(table, col, ddl) {
  const cols = await all(`PRAGMA table_info(${table})`);
  const exists = cols.some(c => c.name.toLowerCase() === col.toLowerCase());
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`[migrate] ${table}.${col} added`);
  }
}

// --- API: Leads ---
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await all(`SELECT id,name,phone,email,notes,created_at,status FROM leads ORDER BY id DESC`);
    res.json({ ok: true, leads });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

app.post('/api/leads', async (req, res) => {
  try {
    const { name='', phone='', email='', notes='' } = req.body || {};
    await run(
      `INSERT INTO leads (name,phone,email,notes,created_at,status) VALUES (?,?,?,?,DATE('now'),'open')`,
      [name,phone,email,notes]
    );
    res.json({ ok: true });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

app.post('/api/leads/:id/convert', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const lead = await get(`SELECT * FROM leads WHERE id=?`, [id]);
    if (!lead) return res.json({ ok:false, error:'Lead not found' });

    const r = await run(
      `INSERT INTO students (name,phone,email,join_date,renewal_date,status)
       VALUES (?,?,?,DATE('now'),DATE('now','+28 days'),'active')`,
      [lead.name||'', lead.phone||'', lead.email||'']
    );
    await run(`UPDATE leads SET status='converted' WHERE id=?`, [id]);
    res.json({ ok:true, student_id: r.lastID });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

// --- API: Students ---
app.get('/api/students', async (req, res) => {
  try {
    const students = await all(`
      SELECT id,name,phone,email,join_date,renewal_date,status
      FROM students
      ORDER BY id DESC
    `);
    res.json({ ok:true, students });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

app.post('/api/students', async (req, res) => {
  try {
    const { name='', phone='', email='' } = req.body || {};
    await run(
      `INSERT INTO students (name,phone,email,join_date,renewal_date,status)
       VALUES (?,?,?,DATE('now'),DATE('now','+28 days'),'active')`,
      [name,phone,email]
    );
    res.json({ ok:true });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

app.post('/api/students/:id/archive', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const exists = await get(`SELECT id FROM students WHERE id=?`, [id]);
    if (!exists) return res.json({ ok:false, error:'Student not found' });
    await run(`UPDATE students SET status='archived' WHERE id=?`, [id]);
    res.json({ ok:true });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

// --- API: Payments ---
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await all(`SELECT id,date,student_id,amount,method,taxable,note FROM payments ORDER BY id DESC`);
    res.json({ ok:true, payments });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

app.post('/api/payments', async (req, res) => {
  try {
    const { date, student_id, amount, method='', taxable=1, note='' } = req.body || {};
    await run(
      `INSERT INTO payments (date,student_id,amount,method,taxable,note)
       VALUES (COALESCE(?,DATE('now')) , ?, ?, ?, ?, ?)`,
      [date||null, student_id||null, Number(amount||0), method, taxable?1:0, note]
    );
    res.json({ ok:true });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

// --- API: Accounting ---
app.get('/api/accounting', async (req, res) => {
  try {
    const pTax  = await get(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE taxable=1`);
    const pNon  = await get(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE taxable=0`);
    const eTax  = await get(`SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE taxable=1`);
    const eNon  = await get(`SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE taxable=0`);
    const payments = { taxable:+pTax.v, nonTaxable:+pNon.v, total:+pTax.v + +pNon.v };
    const expenses = { taxable:+eTax.v, nonTaxable:+eNon.v, total:+eTax.v + +eNon.v };
    const net = {
      taxable: payments.taxable - expenses.taxable,
      nonTaxable: payments.nonTaxable - expenses.nonTaxable,
      total: payments.total - expenses.total
    };
    res.json({ ok:true, payments, expenses, net });
  } catch (e) { res.json({ ok:false, error:String(e.message||e) }); }
});

// --- static site ---
app.use(express.static(path.join(__dirname, 'public')));

// --- boot ---
ensureSchema()
  .then(() => app.listen(PORT, () => console.log(`[dojo] http://localhost:${PORT}`)))
  .catch(err => { console.error('[migrate failed]', err); process.exit(1); });
// ===== Admin backup/export (safe) =====
const path = require('path');
const fs = require('fs');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

// Try to reuse your existing DATA_DIR if present; otherwise default.
const __ADMIN_DATA_DIR =
  (typeof DATA_DIR !== 'undefined' && DATA_DIR) ||
  process.env.DATA_DIR ||
  path.join(__dirname, 'data');

const __ADMIN_DB_FILE =
  (typeof DB_FILE !== 'undefined' && DB_FILE) ||
  path.join(__ADMIN_DATA_DIR, 'dojo.db');

function adminGuard(req, res) {
  if (ADMIN_TOKEN) {
    const tok = (req.query.token || req.headers['x-admin-token'] || '').toString();
    if (tok !== ADMIN_TOKEN) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    return true;
  }
  // No token set: only allow from localhost
  const ip = (req.ip || '').toString();
  const isLocal = ip === '::1' || ip.endsWith('127.0.0.1') || ip === '::ffff:127.0.0.1';
  if (!isLocal) return res.status(403).json({ ok: false, error: 'forbidden' });
  return true;
}

// Stream the raw SQLite file (download)
app.get('/api/admin/backup-db', (req, res) => {
  if (!adminGuard(req, res)) return;
  if (!fs.existsSync(__ADMIN_DB_FILE)) {
    return res.status(404).json({ ok: false, error: 'db_not_found', path: __ADMIN_DB_FILE });
  }
  const fname = `dojo-${new Date().toISOString().slice(0,10)}.db`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.sendFile(__ADMIN_DB_FILE, (err) => {
    if (err) {
      console.error('backup-db sendFile error:', err);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'send_error' });
    }
  });
});

// Export all tables as JSON (fallback if file download is blocked)
function dbAll(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}
app.get('/api/admin/export-json', async (req, res) => {
  if (!adminGuard(req, res)) return;
  try {
    const students  = await dbAll('SELECT * FROM students');
    const leads     = await dbAll('SELECT * FROM leads');
    const payments  = await dbAll('SELECT * FROM payments');
    const expenses  = await dbAll('SELECT * FROM expenses');
    res.json({ ok: true, snapshotAt: new Date().toISOString(), students, leads, payments, expenses });
  } catch (e) {
    console.error('export-json error:', e);
    res.status(500).json({ ok: false, error: 'query_failed' });
  }
});
