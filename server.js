// ===== dojo-apps / server.js (robust archive, students scope) =====
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'dojo.db');

// ---------- middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- sqlite helpers ----------
function openDB() {
  const firstTime = !fs.existsSync(DB_FILE);
  const db = new sqlite3.Database(DB_FILE);
  if (firstTime) console.log('[dojo] creating DB at', DB_FILE);
  return db;
}
const db = openDB();

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ---------- utils ----------
function fmtDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

// ---------- migrations (students only for this patch) ----------
async function migrate() {
  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      join_date TEXT,
      start_date TEXT,
      renewal_date TEXT,
      status TEXT DEFAULT 'active',
      address TEXT,
      age INTEGER,
      program TEXT,
      parent_name TEXT,
      parent_phone TEXT,
      notes TEXT,
      photo TEXT
    )
  `);

  // backfills
  await run(`UPDATE students SET status='active' WHERE status IS NULL OR status=''`);
  await run(`UPDATE students SET join_date = COALESCE(join_date, start_date) WHERE join_date IS NULL OR join_date=''`);

  const missing = await all(`
    SELECT id, join_date FROM students
    WHERE (renewal_date IS NULL OR renewal_date='')
      AND join_date IS NOT NULL AND join_date<>''
  `);
  for (const r of missing) {
    await run(`UPDATE students SET renewal_date=? WHERE id=?`, [addDays(r.join_date, 28), r.id]);
  }

  console.log('[dojo] migrations OK');
}

// ---------- API: Students ----------
app.get('/api/students', async (req, res) => {
  try {
    const status = (req.query.status || 'active').toLowerCase();
    let rows;
    if (status === 'all') {
      rows = await all(`SELECT * FROM students ORDER BY id DESC`);
    } else {
      rows = await all(`SELECT * FROM students WHERE status=? ORDER BY id DESC`, [status]);
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { name, phone, email } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const today = fmtDate();
    const renewal = addDays(today, 28);
    const r = await run(
      `INSERT INTO students (name, phone, email, join_date, start_date, renewal_date, status)
       VALUES (?,?,?,?,?,?, 'active')`,
      [name.trim(), phone || '', email || '', today, today, renewal]
    );
    const row = await get(`SELECT * FROM students WHERE id=?`, [r.id]);
    res.json({ ok: true, student: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/students/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const allowed = ['name','phone','email','join_date','start_date','renewal_date','status',
                     'address','age','program','parent_name','parent_phone','notes','photo'];
    const fields = [];
    const values = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        fields.push(`${k}=?`);
        values.push(req.body[k]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'no fields to update' });
    values.push(id);
    const r = await run(`UPDATE students SET ${fields.join(', ')} WHERE id=?`, values);
    const row = await get(`SELECT * FROM students WHERE id=?`, [id]);
    res.json({ ok: true, updated: r.changes, student: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const r = await run(`DELETE FROM students WHERE id=?`, [id]);
    res.json({ ok: true, deleted: r.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Archive / Unarchive (ultra-forgiving) ----------
function archiveHandler(kind) {
  return async (req, res) => {
    try {
      const id = req.params.id || req.body.id || req.query.id;
      if (!id) return res.status(400).json({ error: 'missing id' });

      const to = (kind === 'archive') ? 'archived' : 'active';
      const r = await run(`UPDATE students SET status=? WHERE id=?`, [to, id]);
      const row = await get(`SELECT * FROM students WHERE id=?`, [id]);

      console.log(`[archive] ${kind} id=${id} → status=${to} changes=${r.changes}`);
      res.json({ ok: true, updated: r.changes, student: row });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

// Accept everything: POST/GET, id in path OR in JSON/body/query.
app.all('/api/students/:id/archive',    archiveHandler('archive'));
app.all('/api/students/:id/unarchive',  archiveHandler('unarchive'));
app.all('/api/students/archive/:id',    archiveHandler('archive'));
app.all('/api/students/unarchive/:id',  archiveHandler('unarchive'));
app.all('/api/students/archive',        archiveHandler('archive'));
app.all('/api/students/unarchive',      archiveHandler('unarchive'));

// quick diag
app.get('/api/ping', (_req,res)=>res.json({ok:true, ts:Date.now()}));

// ---------- root ----------
app.get('/', (_req, res) => res.redirect('/students.html'));

// ---------- start ----------
(async () => {
  console.log('[dojo] DB =', DB_FILE);
  await migrate();
  app.listen(PORT, () => {
    console.log(`[dojo] http://localhost:${PORT}`);
  });
})();
