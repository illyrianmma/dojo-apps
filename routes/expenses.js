const express = require("express");
const router = express.Router();

/* Ensure table exists */
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

// List (latest first)
router.get("/", (req, res) => {
  req.db.all(`SELECT * FROM expenses ORDER BY date DESC, id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Create
router.post("/", (req, res) => {
  const { vendor, amount, date, taxable } = req.body || {};
  if (!date || amount === undefined || amount === null)
    return res.status(400).json({ error: "amount and date are required" });

  const amt = Number(amount);
  if (Number.isNaN(amt)) return res.status(400).json({ error: "amount must be a number" });

  req.db.run(
    `INSERT INTO expenses (vendor, amount, date, taxable) VALUES (?,?,?,?)`,
    [vendor || null, amt, date, taxable ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Update
router.put("/:id", (req, res) => {
  const { vendor, amount, date, taxable } = req.body || {};
  const amt = Number(amount || 0);
  if (!date || Number.isNaN(amt))
    return res.status(400).json({ error: "valid amount and date required" });

  req.db.run(
    `UPDATE expenses SET vendor=?, amount=?, date=?, taxable=? WHERE id=?`,
    [vendor || null, amt, date, taxable ? 1 : 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes > 0 });
    }
  );
});

// Delete
router.delete("/:id", (req, res) => {
  req.db.run(`DELETE FROM expenses WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

module.exports = router;
