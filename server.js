/* server.js */
const fs = require('fs');
const express = require('express');
const path = require('path');
const { DATA_DIR, DB_PATH, UPLOADS_DIR } = require('./persist');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// DB path (can be redirected in production with DOJO_DB)
/* e.g. DOJO_DB=/var/data/dojo.db on Render when using a Persistent Disk */
const DB_PATH = process.env.DOJO_DB || path.join(__dirname, 'dojo.db');
console.log('[dojo] DB =', DB_PATH);
const db = new sqlite3.Database(DB_PATH);

// JSON body
app.use(express.json());

// attach db on req
app.use((req, _res, next) => { req.db = db; next(); });

// Uploads dir (can be redirected with UPLOADS_DIR)
/* e.g. UPLOADS_DIR=/var/data/uploads on Render */
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
console.log('[dojo] UPLOADS_DIR =', UPLOADS_DIR);
console.log('[dojo] ADMIN_TOKEN length =', (process.env.ADMIN_TOKEN || '').length);

// serve uploads at /uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// ----- Schema -----
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    phone TEXT, program TEXT,
    start_date TEXT, renewal_date TEXT,
    email TEXT, address TEXT, age INTEGER,
    photo TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    present INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    taxable INTEGER NOT NULL DEFAULT 0,
    method TEXT,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT,
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    taxable INTEGER NOT NULL DEFAULT 0
  )`);
});

// auto-migrate helper
function ensureColumn(table, name, type) {
  db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
    if (err) return console.error(err);
    const exists = cols.some(c => c.name === name);
    if (!exists) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`, [], e => {
        if (e) console.error(`Error adding ${table}.${name}:`, e.message);
        else console.log(`Auto-migrate: ${table}.${name} added`);
      });
    } else {
      console.log(`Auto-migrate: ${table}.${name} exists`);
    }
  });
}
db.serialize(() => {
  ['students','attendance','payments','expenses'].forEach(()=>{});
  ensureColumn('students','phone','TEXT');
  ensureColumn('attendance','student_id','INTEGER');
  ensureColumn('payments','student_id','INTEGER');
  ensureColumn('expenses','vendor','TEXT');
  ensureColumn('leads','name','TEXT');
  ensureColumn('students','email','TEXT');
  ensureColumn('payments','amount','REAL');
  ensureColumn('attendance','date','TEXT');
  ensureColumn('leads','phone','TEXT');
  ensureColumn('expenses','amount','REAL');
  ensureColumn('students','address','TEXT');
  ensureColumn('payments','method','TEXT');
  ensureColumn('attendance','present','INTEGER');
  ensureColumn('leads','email','TEXT');
  ensureColumn('expenses','taxable','INTEGER');
  ensureColumn('students','age','INTEGER');
  ensureColumn('payments','taxable','INTEGER');
  ensureColumn('leads','interested_program','TEXT');
  ensureColumn('expenses','date','TEXT');
  ensureColumn('students','photo','TEXT');
});

// ---- Routes ----
const studentsRoutes   = require('./routes/students');
const attendanceRoutes = require('./routes/attendance');
const paymentsRoutes   = require('./routes/payments');
const expensesRoutes   = require('./routes/expenses');
const uploadsRoutes = require('./routes/uploads');
const leadsRoutes = require('./routes/leads');
const adminRoutes = require('./routes/admin');
const legacyRoutes = require('./routes/legacy');
// << mounted below

app.use('/api/students', studentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/legacy', legacyRoutes);
// << here

// static files
app.use(express.static(path.join(__dirname, 'public')));

// start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});







