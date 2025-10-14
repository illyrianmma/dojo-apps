const express = require("express");
const router = express.Router();

// POST /api/legacy/students/:id/set  { is_legacy: true|false }
router.post("/students/:id/set", (req, res) => {
  const id = req.params.id;
  const val = req.body && (req.body.is_legacy === true || req.body.is_legacy === 1) ? 1 : 0;
  req.db.run(`UPDATE students SET is_legacy = ? WHERE id = ?`, [val, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes > 0, id: Number(id), is_legacy: val });
  });
});

module.exports = router;
