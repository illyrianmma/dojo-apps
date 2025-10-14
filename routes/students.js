/* routes/students.js — robust add/update that adapts to your current DB schema */
const express = require("express");
const router = express.Router();

/** Normalize incoming payload. Accepts either {first_name,last_name} or {name}. */
function normalizePayload(raw) {
  const s = raw || {};
  const out = {};

  // Split historical "name" if first/last missing
  if ((!s.first_name || !s.last_name) && s.name) {
    const parts = String(s.name).trim().split(/\s+/);
    out.first_name = out.first_name ?? parts.shift() ?? null;
    out.last_name  = out.last_name  ?? (parts.length ? parts.join(" ") : null);
  }

  // Prefer explicit fields if provided
  out.first_name   = s.first_name ?? out.first_name ?? null;
  out.last_name    = s.last_name  ?? out.last_name  ?? null;

  out.phone        = s.phone ?? null;
  out.email        = s.email ?? null;
  out.address      = s.address ?? null;
  out.age          = (s.age === "" || s.age === null || s.age === undefined) ? null : Number(s.age);
  out.program      = s.program ?? null;

  out.start_date   = s.start_date   || null;
  out.renewal_date = s.renewal_date || null;

  out.photo        = s.photo ?? null;

  // legacy/is_legacy variations (whichever your DB has)
  const legacy = (typeof s.is_legacy === "boolean") ? (s.is_legacy ? 1 : 0)
               : (typeof s.legacy    === "number")  ? (s.legacy ? 1 : 0)
               : 0;
  out.is_legacy    = legacy;
  out.legacy       = legacy;

  // Historical optional fields (only used if your DB actually has the columns)
  out.parent_name  = s.parent_name  ?? null;
  out.parent_phone = s.parent_phone ?? null;
  out.notes        = s.notes        ?? null;
  out.status       = s.status       ?? null;
  out.join_date    = s.join_date    ?? null;

  return out;
}

/** INSERT that writes only columns that exist in the DB. Also auto-fills dates if blank. */
function dynamicInsert(db, table, data, cb) {
  db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
    if (err) return cb(err);
    const available = new Set((cols || []).map(c => c.name));

    // Auto-fill today and +28 days if not provided
    const today = new Date();
    const toISO = d => d.toISOString().slice(0,10);
    if (!data.start_date)   data.start_date = toISO(today);
    if (!data.renewal_date) { const r = new Date(today); r.setDate(r.getDate() + 28); data.renewal_date = toISO(r); }

    // Keep only keys that your DB actually has
    const candidate = {
      first_name:null, last_name:null, name:null,
      phone:null, email:null, address:null, age:null, program:null,
      start_date:null, renewal_date:null, photo:null,
      is_legacy:null, legacy:null,
      parent_name:null, parent_phone:null, notes:null, status:null, join_date:null
    };
    for (const k of Object.keys(candidate)) {
      if (available.has(k) && data[k] !== undefined) candidate[k] = data[k];
      else delete candidate[k];
    }

    // If DB only has "name" (no first/last), synthesize it from first/last
    if (!available.has("first_name") && !available.has("last_name") && available.has("name")) {
      const full = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
      if (full) candidate.name = full;
    }

    const colsUsed = Object.keys(candidate);
    if (!colsUsed.length) return cb(new Error("No matching columns to insert"));

    const placeholders = colsUsed.map(() => "?");
    const values = colsUsed.map(k => candidate[k]);

    const sql = `INSERT INTO ${table} (${colsUsed.join(",")}) VALUES (${placeholders.join(",")})`;
    db.run(sql, values, function(err2){
      if (err2) return cb(err2);
      cb(null, this.lastID);
    });
  });
}

/** UPDATE that only touches existing columns. */
function dynamicUpdate(db, table, id, data, cb) {
  db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
    if (err) return cb(err);
    const available = new Set((cols || []).map(c => c.name));

    const candidate = {
      first_name:null, last_name:null, name:null,
      phone:null, email:null, address:null, age:null, program:null,
      start_date:null, renewal_date:null, photo:null,
      is_legacy:null, legacy:null,
      parent_name:null, parent_phone:null, notes:null, status:null, join_date:null
    };
    const updates = [];
    const values  = [];
    for (const k of Object.keys(candidate)) {
      if (data[k] !== undefined && available.has(k)) {
        updates.push(`${k}=?`);
        values.push(data[k]);
      }
    }
    if (!updates.length) return cb(null, 0);

    const sql = `UPDATE ${table} SET ${updates.join(", ")} WHERE id=?`;
    values.push(id);
    db.run(sql, values, function(err2){
      if (err2) return cb(err2);
      cb(null, this.changes);
    });
  });
}

/* ------------------------ ROUTES ------------------------ */

// List (?legacy=true|false only if column exists; else returns all)
router.get("/", (req, res) => {
  const { legacy } = req.query;
  const base  = "SELECT * FROM students";
  const order = " ORDER BY last_name ASC, first_name ASC, id ASC";

  if (legacy === undefined) {
    return req.db.all(base + order, [], (e, rows) => e ? res.status(500).json({error:e.message}) : res.json(rows||[]));
  }
  req.db.all("PRAGMA table_info(students)", [], (e, cols) => {
    const hasLegacy = !e && Array.isArray(cols) && cols.some(c => (c.name||"")==="is_legacy" || (c.name||"")==="legacy");
    if (!hasLegacy) return req.db.all(base + order, [], (e2, rows) => e2 ? res.status(500).json({error:e2.message}) : res.json(rows||[]));
    const legacyCol = cols.find(c => c.name === "is_legacy") ? "is_legacy" : "legacy";
    const want = String(legacy).toLowerCase()==="true" ? 1 : 0;
    req.db.all(`${base} WHERE IFNULL(${legacyCol},0)=? ${order}`, [want], (e3, rows) =>
      e3 ? res.status(500).json({error:e3.message}) : res.json(rows||[]));
  });
});

// Get one
router.get("/:id", (req, res) => {
  req.db.get("SELECT * FROM students WHERE id=?", [req.params.id], (e, row) => {
    if (e) return res.status(500).json({ error: e.message });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });
});

// Create
router.post("/", (req, res) => {
  const n = normalizePayload(req.body);
  if ((!n.first_name || !n.last_name) && !n.name) {
    return res.status(400).json({ error: "Provide first_name & last_name (or name)" });
  }
  dynamicInsert(req.db, "students", n, (err, id) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id });
  });
});

// Update
router.put("/:id", (req, res) => {
  const n = normalizePayload(req.body);
  dynamicUpdate(req.db, "students", req.params.id, n, (err, changes) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: changes > 0 });
  });
});

// Delete
router.delete("/:id", (req, res) => {
  req.db.run("DELETE FROM students WHERE id=?", [req.params.id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

// Toggle legacy (works if DB has either is_legacy or legacy)
router.put("/:id/legacy", (req, res) => {
  const { is_legacy } = req.body || {};
  const val = (typeof is_legacy === "boolean") ? (is_legacy ? 1 : 0) : 0;
  req.db.all("PRAGMA table_info(students)", [], (e, cols) => {
    const hasIs = !e && Array.isArray(cols) && cols.some(c => (c.name||"")==="is_legacy");
    const hasLg = !e && Array.isArray(cols) && cols.some(c => (c.name||"")==="legacy");
    if (!hasIs && !hasLg) return res.status(400).json({ error: "legacy column not present" });
    const col = hasIs ? "is_legacy" : "legacy";
    req.db.run(`UPDATE students SET ${col}=? WHERE id=?`, [val, req.params.id], function(err2){
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ updated: this.changes > 0 });
    });
  });
});

module.exports = router;
