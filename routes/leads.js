const express = require("express");
module.exports = (db) => {
  const router = express.Router();

  router.get("/", (req, res) => {
    db.all("SELECT * FROM leads", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  router.post("/", (req, res) => {
    const { name, phone, email, notes, follow_up } = req.body;
    db.run(
      "INSERT INTO leads (name, phone, email, notes, follow_up) VALUES (?,?,?,?,?)",
      [name, phone, email, notes, follow_up],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });

  return router;
};
