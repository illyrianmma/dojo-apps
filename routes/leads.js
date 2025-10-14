const express = require("express");
const router = express.Router();

/* Table might not exist in some DBs. Create if missing. */
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
router.get("/", (req, res) => {
  req.db.all(`SELECT * FROM leads ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get one
router.get("/:id", (req, res) => {
  req.db.get(`SELECT * FROM leads WHERE id=?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });
});

// Create
router.post("/", (req, res) => {
  const { name, phone, email, interested_program } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  req.db.run(
    `INSERT INTO leads (name, phone, email, interested_program) VALUES (?,?,?,?)`,
    [name, phone || null, email || null, interested_program || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Update
router.put("/:id", (req, res) => {
  const { name, phone, email, interested_program } = req.body || {};
  req.db.run(
    `UPDATE leads SET name=?, phone=?, email=?, interested_program=? WHERE id=?`,
    [name || null, phone || null, email || null, interested_program || null, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes > 0 });
    }
  );
});

// Delete
router.delete("/:id", (req, res) => {
  req.db.run(`DELETE FROM leads WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

module.exports = router;
