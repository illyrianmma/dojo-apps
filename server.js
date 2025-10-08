// server.js — dojo-apps (full, safe)
// -----------------------------------------------------------
// Features:
// - SQLite DB with auto-migrations (adds missing columns if needed)
// - Students: list/add/update/delete, archive (status='archived')
// - Leads: list/add/update/delete, convert to student
// - Payments: list/add/update/delete, printable receipt
// - Expenses: list/add/update/delete
// - Accounting summary: taxable/non-taxable income and expenses
// - Admin: backup DB (download) and export JSON (token-guarded)
// - Static files from ./public
// -----------------------------------------------------------

const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// ---------- Config ----------
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'dojo.db');

console.log(`[dojo] DB = ${DB_FILE}`);

// ---------- DB helpers ----------
const db = new sqlite3.Database(DB_FILE);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

async function columnExists(table, column) {
  const info = await dbAll(`PRAGMA table_info(${table});`);
  return info.some((c) => c.name === column);
}

async function ensureTableAndColumns() {
  // Create tables if not exist (minimal columns)
  await dbRun(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    join_date TEXT,
    renewal_date TEXT,
    status TEXT DEFAULT 'active'
  );`);

  await dbRun(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    created_at TEXT,
    contacted_at TEXT
  );`);

  await dbRun(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    student_id INTEGER,
    amount REAL,
    taxable INTEGER DEFAULT 1,
    method TEXT,
    note TEXT
  );`);

  await dbRun(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    description TEXT,
    amount REAL,
    taxable INTEGER DEFAULT 0,
    vendor TEXT
  );`);

  // Add missing columns gently (idempotent)
  // students.status
  if (!(await columnExists('students', 'status'))) {
    await dbRun(`ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'active';`);
  }
  if (!(await columnExists('students', 'join_date'))) {
    await dbRun(`ALTER TABLE students ADD COLUMN join_date TEXT;`);
  }
  if (!(await columnExists('students', 'renewal_date'))) {
    await dbRun(`ALTER TABLE students ADD COLUMN renewal_date TEXT;`);
  }

  // leads.created_at / contacted_at
  if (!(await columnExists('leads', 'created_at'))) {
    await dbRun(`ALTER TABLE leads ADD COLUMN created_at TEXT;`);
  }
  if (!(await columnExists('leads', 'contacted_at'))) {
    await dbRun(`ALTER TABLE leads ADD COLUMN contacted_at TEXT;`);
  }

  // payments.taxable
  if (!(await columnExists('payments', 'taxable'))) {
    await dbRun(`ALTER TABLE payments ADD COLUMN taxable INTEGER DEFAULT 1;`);
  }

  // expenses.taxable
  if (!(await columnExists('expenses', 'taxable'))) {
    await dbRun(`ALTER TABLE expenses ADD COLUMN taxable INTEGER DEFAULT 0;`);
  }
}

function ymd(d = new Date()) {
  // YYYY-MM-DD in local time
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function plusDaysStr(dateStr, days) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return ymd(dt);
}

// ---------- App ----------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Init ----------
ensureTableAndColumns()
  .then(() => console.log('[dojo] migrations OK'))
  .catch((e) => console.error('[dojo] migration error', e));

// ---------- Leads ----------
app.get('/api/leads', async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM leads ORDER BY id DESC;`);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const created_at = ymd();
    const r = await dbRun(
      `INSERT INTO leads(name, phone, email, created_at) VALUES (?,?,?,?)`,
      [name || '', phone || '', email || '', created_at]
    );
    const row = await dbGet(`SELECT * FROM leads WHERE id = ?`, [r.lastID]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, phone, email, contacted_at } = req.body;
    await dbRun(
      `UPDATE leads SET
         name = COALESCE(?, name),
         phone = COALESCE(?, phone),
         email = COALESCE(?, email),
         contacted_at = COALESCE(?, contacted_at)
       WHERE id = ?`,
      [name, phone, email, contacted_at, id]
    );
    const row = await dbGet(`SELECT * FROM leads WHERE id = ?`, [id]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await dbRun(`DELETE FROM leads WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Convert lead → student
app.post('/api/leads/:id/convert', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const lead = await dbGet(`SELECT * FROM leads WHERE id = ?`, [id]);
    if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });

    const join_date = ymd();
    const renewal_date = plusDaysStr(join_date, 28);

    const r = await dbRun(
      `INSERT INTO students(name, phone, email, join_date, renewal_date, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [lead.name || '', lead.phone || '', lead.email || '', join_date, renewal_date]
    );

    // Optionally we can delete lead after convert
    await dbRun(`DELETE FROM leads WHERE id = ?`, [id]);

    const student = await dbGet(`SELECT * FROM students WHERE id = ?`, [r.lastID]);
    res.json({ ok: true, student });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Students ----------
app.get('/api/students', async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM students ORDER BY id DESC;`);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { name, phone, email, join_date: jd, renewal_date: rd } = req.body;
    const join_date = jd && jd.length ? jd : ymd();
    const renewal_date = rd && rd.length ? rd : plusDaysStr(join_date, 28);

    const r = await dbRun(
      `INSERT INTO students(name, phone, email, join_date, renewal_date, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [name || '', phone || '', email || '', join_date, renewal_date]
    );
    const row = await dbGet(`SELECT * FROM students WHERE id = ?`, [r.lastID]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/students/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, phone, email, join_date, renewal_date, status } = req.body;
    await dbRun(
      `UPDATE students SET
         name = COALESCE(?, name),
         phone = COALESCE(?, phone),
         email = COALESCE(?, email),
         join_date = COALESCE(?, join_date),
         renewal_date = COALESCE(?, renewal_date),
         status = COALESCE(?, status)
       WHERE id = ?`,
      [name, phone, email, join_date, renewal_date, status, id]
    );
    const row = await dbGet(`SELECT * FROM students WHERE id = ?`, [id]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Archive student (set status='archived')
app.post('/api/students/:id/archive', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await dbRun(`UPDATE students SET status='archived' WHERE id = ?`, [id]);
    const row = await dbGet(`SELECT * FROM students WHERE id = ?`, [id]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await dbRun(`DELETE FROM students WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Payments ----------
app.get('/api/payments', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT p.*, s.name AS student_name
       FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       ORDER BY p.id DESC;`
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const { date, student_id, amount, taxable, method, note } = req.body;
    const dt = date && date.length ? date : ymd();
    const tax = typeof taxable === 'undefined' ? 1 : (taxable ? 1 : 0);

    const r = await dbRun(
      `INSERT INTO payments(date, student_id, amount, taxable, method, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dt, student_id || null, parseFloat(amount || 0), tax, method || '', note || '']
    );
    const row = await dbGet(`SELECT * FROM payments WHERE id = ?`, [r.lastID]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/payments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { date, student_id, amount, taxable, method, note } = req.body;
    await dbRun(
      `UPDATE payments SET
         date = COALESCE(?, date),
         student_id = COALESCE(?, student_id),
         amount = COALESCE(?, amount),
         taxable = COALESCE(?, taxable),
         method = COALESCE(?, method),
         note = COALESCE(?, note)
       WHERE id = ?`,
      [
        date, student_id,
        (typeof amount === 'undefined' ? null : parseFloat(amount)),
        (typeof taxable === 'undefined' ? null : (taxable ? 1 : 0)),
        method, note, id
      ]
    );
    const row = await dbGet(`SELECT * FROM payments WHERE id = ?`, [id]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/payments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await dbRun(`DELETE FROM payments WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Printable receipt (simple HTML)
app.get('/api/payments/:id/receipt', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = await dbGet(
      `SELECT p.*, s.name AS student_name, s.email AS student_email, s.phone AS student_phone
       FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       WHERE p.id = ?`, [id]
    );
    if (!p) return res.status(404).send('Payment not found');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt #${p.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; }
    .box { border: 1px solid #ccc; padding: 16px; width: 480px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 0; }
    .total { font-weight: bold; font-size: 16px; }
    .muted { color: #666; font-size: 12px; }
    .btn { display: inline-block; margin: 12px 0; padding: 8px 12px; border: 1px solid #333; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Payment Receipt</h1>
    <table>
      <tr><td>Receipt #</td><td>#${p.id}</td></tr>
      <tr><td>Date</td><td>${p.date || ''}</td></tr>
      <tr><td>Student</td><td>${p.student_name || ''}</td></tr>
      <tr><td>Contact</td><td>${p.student_email || ''} ${p.student_phone ? ' / ' + p.student_phone : ''}</td></tr>
      <tr><td>Method</td><td>${p.method || ''}</td></tr>
      <tr><td>Taxable</td><td>${p.taxable ? 'Yes' : 'No'}</td></tr>
      <tr><td>Note</td><td>${p.note || ''}</td></tr>
      <tr><td class="total">Amount</td><td class="total">$${Number(p.amount || 0).toFixed(2)}</td></tr>
    </table>
    <p class="muted">Thank you for your payment.</p>
    <a class="btn" href="javascript:window.print()">Print</a>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send('Error generating receipt');
  }
});

// ---------- Expenses ----------
app.get('/api/expenses', async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM expenses ORDER BY id DESC;`);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { date, description, amount, taxable, vendor } = req.body;
    const dt = date && date.length ? date : ymd();
    const tax = typeof taxable === 'undefined' ? 0 : (taxable ? 1 : 0);

    const r = await dbRun(
      `INSERT INTO expenses(date, description, amount, taxable, vendor)
       VALUES (?, ?, ?, ?, ?)`,
      [dt, description || '', parseFloat(amount || 0), tax, vendor || '']
    );
    const row = await dbGet(`SELECT * FROM expenses WHERE id = ?`, [r.lastID]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { date, description, amount, taxable, vendor } = req.body;
    await dbRun(
      `UPDATE expenses SET
         date = COALESCE(?, date),
         description = COALESCE(?, description),
         amount = COALESCE(?, amount),
         taxable = COALESCE(?, taxable),
         vendor = COALESCE(?, vendor)
       WHERE id = ?`,
      [
        date, description,
        (typeof amount === 'undefined' ? null : parseFloat(amount)),
        (typeof taxable === 'undefined' ? null : (taxable ? 1 : 0)),
        vendor, id
      ]
    );
    const row = await dbGet(`SELECT * FROM expenses WHERE id = ?`, [id]);
    res.json({ ok: true, row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await dbRun(`DELETE FROM expenses WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Accounting ----------
app.get('/api/accounting', async (req, res) => {
  try {
    const income = await dbAll(`SELECT * FROM payments;`);
    const expenses = await dbAll(`SELECT * FROM expenses;`);

    const sum = (arr, key) => arr.reduce((a, r) => a + Number(r[key] || 0), 0);
    const income_total = sum(income, 'amount');
    const income_taxable = sum(income.filter(r => r.taxable), 'amount');
    const income_nontax = sum(income.filter(r => !r.taxable), 'amount');

    const expense_total = sum(expenses, 'amount');
    const expense_taxable = sum(expenses.filter(r => r.taxable), 'amount');
    const expense_nontax = sum(expenses.filter(r => !r.taxable), 'amount');

    res.json({
      ok: true,
      income: { total: income_total, taxable: income_taxable, nonTaxable: income_nontax },
      expenses: { total: expense_total, taxable: expense_taxable, nonTaxable: expense_nontax },
      net: (income_total - expense_total)
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Admin backup/export (no name collisions) ----------
const _path = require('path'); // safe alias to avoid duplicate-id errors
const _fs = require('fs');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

const ADMIN_DATA_DIR = process.env.DATA_DIR || _path.join(__dirname, 'data');
const ADMIN_DB_FILE =
  process.env.DB_FILE
  || (_fs.existsSync(_path.join(__dirname, 'dojo.db')) ? _path.join(__dirname, 'dojo.db')
     : _path.join(ADMIN_DATA_DIR, 'dojo.db'));

function adminGuard(req, res) {
  if (ADMIN_TOKEN) {
    const tok = (req.query.token || req.headers['x-admin-token'] || '').toString();
    if (tok !== ADMIN_TOKEN) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    return true;
  }
  const ip = (req.ip || '').toString();
  const isLocal = ip === '::1' || ip.endsWith('127.0.0.1') || ip === '::ffff:127.0.0.1';
  if (!isLocal) return res.status(403).json({ ok: false, error: 'forbidden' });
  return true;
}

app.get('/api/admin/backup-db', (req, res) => {
  if (!adminGuard(req, res)) return;
  if (!_fs.existsSync(ADMIN_DB_FILE)) {
    return res.status(404).json({ ok: false, error: 'db_not_found', path: ADMIN_DB_FILE });
  }
  const fname = `dojo-${new Date().toISOString().slice(0, 10)}.db`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.sendFile(ADMIN_DB_FILE, (err) => {
    if (err) {
      console.error('backup-db sendFile error:', err);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'send_error' });
    }
  });
});

app.get('/api/admin/export-json', async (req, res) => {
  if (!adminGuard(req, res)) return;
  try {
    const tables = ['students', 'leads', 'payments', 'expenses'];
    const payload = {};
    for (const t of tables) {
      try {
        payload[t] = await dbAll(`SELECT * FROM ${t};`);
      } catch {
        payload[t] = [];
      }
    }
    res.json({ ok: true, snapshotAt: new Date().toISOString(), ...payload });
  } catch (e) {
    console.error('export-json error:', e);
    res.status(500).json({ ok: false, error: 'query_failed' });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`[dojo] http://localhost:${PORT}`);
});
// ===== Admin export helpers (append at very bottom of server.js) =====
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dojo';

// Quick JSON export of all tables
app.get('/api/admin/export-json', (req, res) => {
  try {
    if ((req.query.token || '') !== ADMIN_TOKEN) return res.status(401).send('Unauthorized');
    const dump = {};
    db.serialize(() => {
      db.all("SELECT * FROM students", (e1, r1 = []) => {
        dump.students = r1;
        db.all("SELECT * FROM leads", (e2, r2 = []) => {
          dump.leads = r2;
          db.all("SELECT * FROM payments", (e3, r3 = []) => {
            dump.payments = r3;
            db.all("SELECT * FROM expenses", (e4, r4 = []) => {
              dump.expenses = r4;
              res.json(dump);
            });
          });
        });
      });
    });
  } catch (err) {
    console.error('[admin/export-json]', err);
    res.status(500).send('Server error');
  }
});

// Raw DB download (SQLite file)
app.get('/api/admin/backup-db', (req, res) => {
  try {
    if ((req.query.token || '') !== ADMIN_TOKEN) return res.status(401).send('Unauthorized');
    res.download(DB_FILE, 'dojo.db');
  } catch (err) {
    console.error('[admin/backup-db]', err);
    res.status(500).send('Server error');
  }
});
