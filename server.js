/* server.js */
const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// ---- DB setup ----
const DB_PATH = process.env.DOJO_DB || path.join(__dirname, 'dojo.db');
console.log('[dojo] DB =', DB_PATH);
const db = new sqlite3.Database(DB_PATH);

// Middleware
app.use(express.json());

// Attach db to req (so routes can use req.db consistently)
app.use((req, _res, next) => {
  req.db = db;
  next();
});

// Ensure public/uploads exists
const uploadsAbs = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsAbs)) {
  fs.mkdirSync(uploadsAbs, { recursive: true });
}

// ---- Schema (create tables if not exist) ----
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name  TEXT NOT NULL,
      phone      TEXT,
      program    TEXT,
      start_date TEXT,
      renewal_date TEXT,
      email      TEXT,
      address    TEXT,
      age        INTEGER,
      photo      TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      present INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      taxable INTEGER NOT NULL DEFAULT 0,
      method TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      taxable INTEGER NOT NULL DEFAULT 0
    )
  `);
});

// ---- Auto-migrate helper ----
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
  // Keep parity with previous logs
  ensureColumn('students', 'phone', 'TEXT');
  ensureColumn('attendance', 'student_id', 'INTEGER');
  ensureColumn('payments', 'student_id', 'INTEGER');
  ensureColumn('expenses', 'vendor', 'TEXT');
  ensureColumn('leads', 'name', 'TEXT');           // harmless if no leads table
  ensureColumn('students', 'email', 'TEXT');
  ensureColumn('payments', 'amount', 'REAL');
  ensureColumn('attendance', 'date', 'TEXT');
  ensureColumn('leads', 'phone', 'TEXT');          // harmless if no leads table
  ensureColumn('expenses', 'amount', 'REAL');
  ensureColumn('students', 'address', 'TEXT');
  ensureColumn('payments', 'method', 'TEXT');
  ensureColumn('attendance', 'present', 'INTEGER');
  ensureColumn('leads', 'email', 'TEXT');          // harmless if no leads table
  ensureColumn('expenses', 'taxable', 'INTEGER');
  ensureColumn('students', 'age', 'INTEGER');
  ensureColumn('payments', 'taxable', 'INTEGER');
  ensureColumn('leads', 'interested_program', 'TEXT'); // harmless if no leads table
  ensureColumn('expenses', 'date', 'TEXT');

  // Ensure photos
  ensureColumn('students', 'photo', 'TEXT');
});

// ---- Routes ----
const studentsRoutes = require('./routes/students');
const attendanceRoutes = require('./routes/attendance');
const paymentsRoutes = require('./routes/payments');
const expensesRoutes = require('./routes/expenses');
const uploadsRoutes = require('./routes/uploads');\nconst adminRoutes = require('./routes/admin'); // NEW

app.use('/api/students', studentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/uploads', uploadsRoutes);\napp.use('/api/admin', adminRoutes); // NEW

// ---- Static ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
