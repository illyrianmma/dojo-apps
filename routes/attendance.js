const express = require('express');
const router = express.Router();

// List attendance (optionally filter by student_id)
router.get('/', (req, res) => {
  const { student_id } = req.query;
  let sql = `SELECT * FROM attendance ORDER BY date DESC, id DESC`;
  let params = [];
  if (student_id) {
    sql = `SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC, id DESC`;
    params = [student_id];
  }
  req.db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create attendance record
router.post('/', (req, res) => {
  const { student_id, date, present } = req.body;
  if (!student_id || !date) return res.status(400).json({ error: 'student_id and date are required' });
  const sql = `INSERT INTO attendance (student_id, date, present) VALUES (?, ?, ?)`;
  req.db.run(sql, [student_id, date, present ? 1 : 0], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Delete attendance record
router.delete('/:id', (req, res) => {
  req.db.run(`DELETE FROM attendance WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

module.exports = router;
