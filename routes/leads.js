const express = require('express');
const router = express.Router();

// Ensure table exists
router.use((req, _res, next) => {
  req.db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    interested_program TEXT
  )`);
  next();
});

// List
router.get('/', (req, res) => {
  req.db.all(`SELECT * FROM leads ORDER BY id DESC`, [], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows));
});

// Create
router.post('/', (req, res) => {
  const { name, phone, email, interested_program } = req.body || {};
  req.db.run(`INSERT INTO leads (name,phone,email,interested_program) VALUES (?,?,?,?)`,
    [name || null, phone || null, email || null, interested_program || null], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// UPDATE  (NEW)
router.put('/:id', (req, res) => {
  const { name, phone, email, interested_program } = req.body || {};
  req.db.run(`UPDATE leads SET name=?, phone=?, email=?, interested_program=? WHERE id=?`,
    [name || null, phone || null, email || null, interested_program || null, req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes > 0 });
    });
});

// Delete
router.delete('/:id', (req, res) => {
  req.db.run(`DELETE FROM leads WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

module.exports = router;
