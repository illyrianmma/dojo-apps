const express = require("express");
module.exports = (db) => {
  const router = express.Router();

  router.get("/", (req, res) => {
    const summary = {};
    db.get("SELECT SUM(amount) AS total_income FROM payments", [], (err, inc) => {
      if (err) return res.status(500).json({ error: err.message });
      summary.total_income = (inc && inc.total_income) ? inc.total_income : 0;

      db.get("SELECT SUM(amount) AS total_expenses FROM expenses", [], (err, exp) => {
        if (err) return res.status(500).json({ error: err.message });
        summary.total_expenses = (exp && exp.total_expenses) ? exp.total_expenses : 0;

        summary.net_balance = summary.total_income - summary.total_expenses;
        res.json(summary);
      });
    });
  });

  return router;
};
