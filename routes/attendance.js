const express = require('express');
const router = express.Router();

// Ensure table exists
router.use((req, _res, next) => {
  req.db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    present INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  )`);
  next();
});

// List
router.get('/', (req, res) => {
  req.db.all(`SELECT * FROM attendance ORDER BY date DESC, id DESC`, [], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows));
});

// Create
router.post('/', (req, res) => {
  const { student_id, date, present } = req.body || {};
  req.db.run(`INSERT INTO attendance (student_id,date,present) VALUES (?,?,?)`,
    [student_id, date, present ? 1 : 0], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// UPDATE  (NEW)
router.put('/:id', (req, res) => {
  const { student_id, date, present } = req.body || {};
  req.db.run(`UPDATE attendance SET student_id=?, date=?, present=? WHERE id=?`,
    [student_id, date, present ? 1 : 0, req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes > 0 });
    });
});

// Delete
router.delete('/:id', (req, res) => {
  req.db.run(`DELETE FROM attendance WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

module.exports = router;
