const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to SQLite
const db = new sqlite3.Database('./dojo.db', (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// ---------- Students ----------
db.run(`CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  program TEXT,
  start_date TEXT,
  renewal_date TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/api/students', (req, res) => {
  db.all('SELECT * FROM students', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/students', (req, res) => {
  const { first_name, last_name, phone, email, program, start_date, renewal_date } = req.body;
  db.run(
    `INSERT INTO students (first_name, last_name, phone, email, program, start_date, renewal_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [first_name, last_name, phone, email, program, start_date, renewal_date],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

// ---------- Payments ----------
db.run(`CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT,
  amount REAL,
  date TEXT,
  taxable INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/api/payments', (req, res) => {
  db.all('SELECT * FROM payments', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/payments', (req, res) => {
  const { student_name, amount, date, taxable } = req.body;
  db.run(
    `INSERT INTO payments (student_name, amount, date, taxable)
     VALUES (?, ?, ?, ?)`,
    [student_name, amount, date, taxable ? 1 : 0],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

// ---------- Leads ----------
db.run(`CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  follow_up_date TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/api/leads', (req, res) => {
  db.all('SELECT * FROM leads', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/leads', (req, res) => {
  const { name, phone, email, notes, follow_up_date } = req.body;
  db.run(
    `INSERT INTO leads (name, phone, email, notes, follow_up_date)
     VALUES (?, ?, ?, ?, ?)`,
    [name, phone, email, notes, follow_up_date],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

// ---------- Expenses ----------
db.run(`CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT,
  amount REAL,
  date TEXT,
  taxable INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/api/expenses', (req, res) => {
  db.all('SELECT * FROM expenses', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/expenses', (req, res) => {
  const { description, amount, date, taxable } = req.body;
  db.run(
    `INSERT INTO expenses (description, amount, date, taxable)
     VALUES (?, ?, ?, ?)`,
    [description, amount, date, taxable ? 1 : 0],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/expenses/:id', (req, res) => {
  db.run(
    `DELETE FROM expenses WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ deletedID: req.params.id });
    }
  );
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
