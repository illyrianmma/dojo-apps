const express = require('express');
const router = express.Router();

// List (optionally by student_id)
router.get('/', (req, res) => {
  const { student_id } = req.query;
  let sql = `SELECT * FROM payments ORDER BY date DESC, id DESC`;
  let params = [];
  if (student_id) { sql = `SELECT * FROM payments WHERE student_id = ? ORDER BY date DESC, id DESC`; params = [student_id]; }
  req.db.all(sql, params, (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows));
});

// Create
router.post('/', (req, res) => {
  const { student_id, amount, date, taxable, method } = req.body;
  const sql = `INSERT INTO payments (student_id, amount, date, taxable, method) VALUES (?,?,?,?,?)`;
  req.db.run(sql, [student_id || null, amount || 0, date, taxable ? 1 : 0, method || null], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// UPDATE  (NEW)
router.put('/:id', (req, res) => {
  const { student_id, amount, date, taxable, method } = req.body || {};
  const sql = `UPDATE payments SET student_id=?, amount=?, date=?, taxable=?, method=? WHERE id=?`;
  req.db.run(sql, [student_id || null, amount || 0, date || null, taxable ? 1 : 0, method || null, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes > 0 });
  });
});

// Delete
router.delete('/:id', (req, res) => {
  req.db.run(`DELETE FROM payments WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

// Total income between dates (inclusive)
router.get('/total', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });
  const sql = `SELECT IFNULL(SUM(amount), 0) AS total FROM payments WHERE date(date) >= date(?) AND date(date) <= date(?)`;
  req.db.get(sql, [start, end], (err, row) => err ? res.status(500).json({ error: err.message }) : res.json({ total: row?.total || 0 }));
});

// Monthly totals for a single student
router.get('/by-student/:id/monthly', (req, res) => {
  const studentId = req.params.id;
  const { year } = req.query; // optional
  let params = [studentId];
  let yearFilter = '';
  if (year) { yearFilter = ` AND strftime('%Y', date) = ? `; params.push(String(year)); }
  const sql = `
    SELECT strftime('%Y', date) AS y, strftime('%m', date) AS m, IFNULL(SUM(amount),0) AS total
    FROM payments
    WHERE student_id = ? ${yearFilter}
    GROUP BY y, m
    ORDER BY y, m
  `;
  req.db.all(sql, params, (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json({ rows }));
});

module.exports = router;
