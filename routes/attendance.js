const express = require("express");
module.exports = (db) => {
  const router = express.Router();

  router.get("/", (req, res) => {
    db.all("SELECT * FROM attendance", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  router.post("/", (req, res) => {
    const { student_id, date, status } = req.body;
    db.run(
      "INSERT INTO attendance (student_id, date, status) VALUES (?,?,?)",
      [student_id, date, status],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });

  return router;
};
