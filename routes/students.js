const express = require("express");
module.exports = (db) => {
  const router = express.Router();
  router.get("/", (req, res) => {
    db.all("SELECT * FROM students", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
  router.post("/", (req, res) => {
    const { first_name, last_name, phone, email, program, start_date, renewal_date, age, address, parent_name, parent_phone } = req.body;
    db.run(
      "INSERT INTO students (first_name,last_name,phone,email,program,start_date,renewal_date,age,address,parent_name,parent_phone) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [first_name, last_name, phone, email, program, start_date, renewal_date, age, address, parent_name, parent_phone],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
  return router;
};

