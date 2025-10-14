const express = require("express");
const router = express.Router();

// Simple token guard. Set ADMIN_TOKEN in Environment (Render and local).
const TOKEN = process.env.ADMIN_TOKEN || "MySuperSecureToken_09384";
function assertAuth(req, res) {
  const t = req.query.token || req.headers["x-admin-token"];
  if (!t || t !== TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// GET /api/admin/export
router.get("/export", (req, res) => {
  if (!assertAuth(req, res)) return;
  const out = { schema: "v1", students: [], payments: [], attendance: [], expenses: [] };
  req.db.all("SELECT * FROM students", [], (e, s) => {
    if (e) return res.status(500).json({ error: e.message });
    out.students = s || [];
    req.db.all("SELECT * FROM payments", [], (e2, p) => {
      if (e2) return res.status(500).json({ error: e2.message });
      out.payments = p || [];
      req.db.all("SELECT * FROM attendance", [], (e3, a) => {
        if (e3) return res.status(500).json({ error: e3.message });
        out.attendance = a || [];
        req.db.all("SELECT * FROM expenses", [], (e4, ex) => {
          if (e4) return res.status(500).json({ error: e4.message });
          out.expenses = ex || [];
          res.json(out);
        });
      });
    });
  });
});

// POST /api/admin/import   (only inserts if the table is empty to avoid dupes)
router.post("/import", (req, res) => {
  if (!assertAuth(req, res)) return;
  const data = req.body || {};
  const { students = [], payments = [], attendance = [], expenses = [] } = data;

  const checkEmpty = (table) => new Promise((resolve, reject) => {
    req.db.get(`SELECT COUNT(*) AS c FROM ${table}`, [], (e, r) => e ? reject(e) : resolve(r.c === 0));
  });

  Promise.all([checkEmpty("students"), checkEmpty("payments"), checkEmpty("attendance"), checkEmpty("expenses")])
    .then(([S,P,A,E]) => {
      req.db.run("BEGIN");
      const tasks = [];

      if (S && students.length) {
        const stmt = req.db.prepare(`INSERT INTO students
          (id, first_name, last_name, phone, program, start_date, renewal_date, email, address, age, photo)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        students.forEach(s => stmt.run([
          s.id ?? null, s.first_name, s.last_name, s.phone, s.program, s.start_date, s.renewal_date,
          s.email, s.address, s.age, s.photo
        ]));
        tasks.push(new Promise((res2, rej2) => stmt.finalize(err => err ? rej2(err) : res2())));
      }

      if (P && payments.length) {
        const stmt = req.db.prepare(`INSERT INTO payments
          (id, student_id, amount, date, taxable, method)
          VALUES (?,?,?,?,?,?)`);
        payments.forEach(p => stmt.run([p.id ?? null, p.student_id, p.amount, p.date, p.taxable, p.method]));
        tasks.push(new Promise((res2, rej2) => stmt.finalize(err => err ? rej2(err) : res2())));
      }

      if (A && attendance.length) {
        const stmt = req.db.prepare(`INSERT INTO attendance
          (id, student_id, date, present)
          VALUES (?,?,?,?)`);
        attendance.forEach(a => stmt.run([a.id ?? null, a.student_id, a.date, a.present]));
        tasks.push(new Promise((res2, rej2) => stmt.finalize(err => err ? rej2(err) : res2())));
      }

      if (E && expenses.length) {
        const stmt = req.db.prepare(`INSERT INTO expenses
          (id, vendor, amount, date, taxable)
          VALUES (?,?,?,?,?)`);
        expenses.forEach(x => stmt.run([x.id ?? null, x.vendor, x.amount, x.date, x.taxable]));
        tasks.push(new Promise((res2, rej2) => stmt.finalize(err => err ? rej2(err) : res2())));
      }

      Promise.all(tasks)
        .then(() => { req.db.run("COMMIT"); res.json({ ok: true }); })
        .catch(err => { req.db.run("ROLLBACK"); res.status(500).json({ error: err.message }); });
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

module.exports = router;
