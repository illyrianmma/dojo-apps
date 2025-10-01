const express = require("express");
module.exports = (db) => {
  const router = express.Router();

  router.get("/", (req, res) => {
    db.all("SELECT * FROM expenses", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  router.post("/", (req, res) => {
    const { description, amount, date, taxable, method } = req.body;
    db.run(
      "INSERT INTO expenses (description, amount, date, taxable, method) VALUES (?,?,?,?,?)",
      [description, amount, date, taxable, method],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });

  return router;
};
