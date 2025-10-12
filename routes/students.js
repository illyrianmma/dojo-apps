const express = require('express');
const router = express.Router();

// Utility: format YYYY-MM-DD (local)
function yyyymmdd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// List students
router.get('/', (req, res) => {
  const sql = `SELECT * FROM students ORDER BY last_name, first_name, id`;
  req.db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get one student
router.get('/:id', (req, res) => {
  req.db.get(`SELECT * FROM students WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
});

// Create student (PHOTO INCLUDED + DEFAULT DATES)
router.post('/', (req, res) => {
  let {
    first_name, last_name, phone, program, start_date, renewal_date,
    email, address, age, photo
  } = req.body;

  // Defaults: if no start_date provided, use today; if no renewal_date, +28 days
  if (!start_date) {
    start_date = yyyymmdd(new Date());
  }
  if (!renewal_date) {
    const sd = new Date(start_date);
    sd.setDate(sd.getDate() + 28);
    renewal_date = yyyymmdd(sd);
  }

  const sql = `
    INSERT INTO students
    (first_name, last_name, phone, program, start_date, renewal_date, email, address, age, photo)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `;
  const vals = [
    first_name, last_name, phone || null, program || null, start_date || null, renewal_date || null,
    email || null, address || null, age || null, photo || null
  ];
  req.db.run(sql, vals, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Update student (PHOTO INCLUDED + DEFAULT DATES if missing)
router.put('/:id', (req, res) => {
  let {
    first_name, last_name, phone, program, start_date, renewal_date,
    email, address, age, photo
  } = req.body;

  // If caller clears dates or leaves them empty, set defaults like create
  if (!start_date) {
    start_date = yyyymmdd(new Date());
  }
  if (!renewal_date) {
    const sd = new Date(start_date);
    sd.setDate(sd.getDate() + 28);
    renewal_date = yyyymmdd(sd);
  }

  const sql = `
    UPDATE students
    SET first_name=?, last_name=?, phone=?, program=?, start_date=?, renewal_date=?,
        email=?, address=?, age=?, photo=?
    WHERE id=?
  `;
  const vals = [
    first_name, last_name, phone || null, program || null, start_date || null, renewal_date || null,
    email || null, address || null, age || null, photo || null, req.params.id
  ];
  req.db.run(sql, vals, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes > 0 });
  });
});

// Delete student
router.delete('/:id', (req, res) => {
  req.db.run(`DELETE FROM students WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

module.exports = router;
