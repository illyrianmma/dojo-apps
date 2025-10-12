const express = require("express");
const router = express.Router();

// Very simple token guard. Set ADMIN_TOKEN env var on Render.
const TOKEN = process.env.ADMIN_TOKEN || "changeme123";
function assertAuth(req, res) {
  const t = req.query.token || req.headers["x-admin-token"];
  if (!t || t !== TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// GET /api/admin/export?token=...
router.get("/export", (req, res) => {
  if (!assertAuth(req, res)) return;

  const out = { schema: "v1", students: [], payments: [], attendance: [], expenses: [] };
  req.db.serialize(() => {
    req.db.all("SELECT * FROM students", [], (e, rows) => {
      if (e) return res.status(500).json({ error: e.message });
      out.students = rows || [];
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
});

// POST /api/admin/import?token=...
// Body: {students:[], payments:[], attendance:[], expenses:[]}
// Only inserts when table is currently empty to avoid duplicates.
router.post("/import", (req, res) => {
  if (!assertAuth(req, res)) return;

  const data = req.body || {};
  const { students = [], payments = [], attendance = [], expenses = [] } = data;

  req.db.serialize(() => {
    const checks = {};
    const checkEmpty = (table) => new Promise((resolve, reject) => {
      req.db.get(`SELECT COUNT(*) AS c FROM ${table}`, [], (e, r) => e ? reject(e) : resolve(r.c === 0));
    });

    Promise.all([
      checkEmpty("students").then(v => (checks.students = v)),
      checkEmpty("payments").then(v => (checks.payments = v)),
      checkEmpty("attendance").then(v => (checks.attendance = v)),
      checkEmpty("expenses").then(v => (checks.expenses = v)),
    ])
    .then(() => {
      req.db.run("BEGIN");
      const tasks = [];

      if (checks.students && students.length) {
        const stmt = req.db.prepare(`INSERT INTO students
          (id, first_name, last_name, phone, program, start_date, renewal_date, email, address, age, photo)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        students.forEach(s => {
          stmt.run([
            s.id ?? null, s.first_name, s.last_name, s.phone, s.program, s.start_date, s.renewal_date,
            s.email, s.address, s.age, s.photo
          ]);
        });
        tasks.push(new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve())));
      }

      if (checks.payments && payments.length) {
        const stmt = req.db.prepare(`INSERT INTO payments
          (id, student_id, amount, date, taxable, method)
          VALUES (?,?,?,?,?,?)`);
        payments.forEach(p => {
          stmt.run([p.id ?? null, p.student_id, p.amount, p.date, p.taxable, p.method]);
        });
        tasks.push(new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve())));
      }

      if (checks.attendance && attendance.length) {
        const stmt = req.db.prepare(`INSERT INTO attendance
          (id, student_id, date, present)
          VALUES (?,?,?,?)`);
        attendance.forEach(a => {
          stmt.run([a.id ?? null, a.student_id, a.date, a.present]);
        });
        tasks.push(new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve())));
      }

      if (checks.expenses && expenses.length) {
        const stmt = req.db.prepare(`INSERT INTO expenses
          (id, vendor, amount, date, taxable)
          VALUES (?,?,?,?,?)`);
        expenses.forEach(x => {
          stmt.run([x.id ?? null, x.vendor, x.amount, x.date, x.taxable]);
        });
        tasks.push(new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve())));
      }

      Promise.all(tasks)
        .then(() => {
          req.db.run("COMMIT");
          res.json({ ok: true, inserted: { students: checks.students ? students.length : 0, payments: checks.payments ? payments.length : 0, attendance: checks.attendance ? attendance.length : 0, expenses: checks.expenses ? expenses.length : 0 } });
        })
        .catch(err => {
          req.db.run("ROLLBACK");
          res.status(500).json({ error: err.message });
        });
    })
    .catch(err => res.status(500).json({ error: err.message }));
  });
});

module.exports = router;
