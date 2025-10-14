const express = require('express');
const router = express.Router();

// Ensure table exists
router.use((req, _res, next) => {
  req.db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT,
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    taxable INTEGER NOT NULL DEFAULT 0
  )`);
  next();
});

// List
router.get('/', (req, res) => {
  req.db.all(`SELECT * FROM expenses ORDER BY date DESC, id DESC`, [], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows));
});

// Create
router.post('/', (req, res) => {
  const { vendor, amount, date, taxable } = req.body || {};
  req.db.run(`INSERT INTO expenses (vendor,amount,date,taxable) VALUES (?,?,?,?)`,
    [vendor || null, amount || 0, date, taxable ? 1 : 0], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// UPDATE  (NEW)
router.put('/:id', (req, res) => {
  const { vendor, amount, date, taxable } = req.body || {};
  req.db.run(`UPDATE expenses SET vendor=?, amount=?, date=?, taxable=? WHERE id=?`,
    [vendor || null, amount || 0, date || null, taxable ? 1 : 0, req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes > 0 });
    });
});

// Delete
router.delete('/:id', (req, res) => {
  req.db.run(`DELETE FROM expenses WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

module.exports = router;
