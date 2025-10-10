/**
 * import-json.js — Upsert students/payments/leads from JSON dumps into dojo.db
 * Usage:
 *   node import-json.js --db C:\path\dojo.db --students C:\...\render-students.json --payments C:\...\render-payments.json --leads C:\...\render-leads.json
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function readJson(p) {
  if (!p) return null;
  if (!fs.existsSync(p)) {
    console.warn('Missing file:', p);
    return null;
  }
  const txt = fs.readFileSync(p, 'utf8');
  try { return JSON.parse(txt); }
  catch (e) { console.error('Bad JSON in', p, e.message); return null; }
}

function openDB(dbFile) { return new sqlite3.Database(dbFile); }
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function ensureTables(db) {
  await run(db, `
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      join_date TEXT,
      start_date TEXT,
      renewal_date TEXT,
      status TEXT DEFAULT 'active',
      address TEXT,
      age INTEGER,
      program TEXT,
      parent_name TEXT,
      parent_phone TEXT,
      notes TEXT,
      photo TEXT
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY,
      student_id INTEGER,
      date TEXT,
      amount REAL,
      method TEXT,
      taxable INTEGER DEFAULT 0,
      note TEXT,
      receipt_no TEXT
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      created_at TEXT,
      followup_date TEXT,
      status TEXT,
      notes TEXT
    )
  `);
}

function v(x, fallback = null) {
  return (x === undefined || x === null) ? fallback : x;
}

async function importStudents(db, rows = []) {
  let n = 0;
  for (const r of rows) {
    await run(db, `
      INSERT INTO students (id, name, phone, email, join_date, start_date, renewal_date, status,
                            address, age, program, parent_name, parent_phone, notes, photo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        phone=excluded.phone,
        email=excluded.email,
        join_date=COALESCE(excluded.join_date, join_date),
        start_date=COALESCE(excluded.start_date, start_date),
        renewal_date=COALESCE(excluded.renewal_date, renewal_date),
        status=COALESCE(excluded.status, status),
        address=COALESCE(excluded.address, address),
        age=COALESCE(excluded.age, age),
        program=COALESCE(excluded.program, program),
        parent_name=COALESCE(excluded.parent_name, parent_name),
        parent_phone=COALESCE(excluded.parent_phone, parent_phone),
        notes=COALESCE(excluded.notes, notes),
        photo=COALESCE(excluded.photo, photo)
    `, [
      v(r.id), v(r.name,''), v(r.phone,''), v(r.email,''),
      v(r.join_date, r.start_date || null),
      v(r.start_date, r.join_date || null),
      v(r.renewal_date, null),
      v(r.status, 'active'),
      v(r.address, ''), v(r.age, null), v(r.program, ''),
      v(r.parent_name, ''), v(r.parent_phone, ''), v(r.notes, ''), v(r.photo, '')
    ]);
    n++;
  }
  return n;
}

async function importPayments(db, rows = []) {
  let n = 0;
  for (const r of rows) {
    await run(db, `
      INSERT INTO payments (id, student_id, date, amount, method, taxable, note, receipt_no)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        student_id=excluded.student_id,
        date=excluded.date,
        amount=excluded.amount,
        method=excluded.method,
        taxable=excluded.taxable,
        note=excluded.note,
        receipt_no=excluded.receipt_no
    `, [
      v(r.id), v(r.student_id), v(r.date), v(r.amount, 0),
      v(r.method, ''), v(r.taxable, 0), v(r.note, ''), v(r.receipt_no, '')
    ]);
    n++;
  }
  return n;
}

async function importLeads(db, rows = []) {
  let n = 0;
  for (const r of rows) {
    await run(db, `
      INSERT INTO leads (id, name, phone, email, created_at, followup_date, status, notes)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        phone=excluded.phone,
        email=excluded.email,
        created_at=COALESCE(excluded.created_at, created_at),
        followup_date=COALESCE(excluded.followup_date, followup_date),
        status=COALESCE(excluded.status, status),
        notes=COALESCE(excluded.notes, notes)
    `, [
      v(r.id), v(r.name,''), v(r.phone,''), v(r.email,''),
      v(r.created_at, null), v(r.followup_date, null), v(r.status, ''), v(r.notes, '')
    ]);
    n++;
  }
  return n;
}

(async () => {
  const args = process.argv.slice(2);
  const arg = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return (i >= 0 && args[i+1]) ? args[i+1] : def;
  };

  const dbFile    = arg('db', path.join(__dirname, 'dojo.db'));
  const pStudents = arg('students', path.join(process.env.USERPROFILE || '.', 'Downloads', 'render-students.json'));
  const pPayments = arg('payments', path.join(process.env.USERPROFILE || '.', 'Downloads', 'render-payments.json'));
  const pLeads    = arg('leads',    path.join(process.env.USERPROFILE || '.', 'Downloads', 'render-leads.json'));

  console.log('=== Import JSON into DB ===');
  console.log('DB:', dbFile);
  console.log('students.json:', pStudents);
  console.log('payments.json:', pPayments);
  console.log('leads.json   :', pLeads);

  const students = readJson(pStudents) || [];
  const payments = readJson(pPayments) || [];
  const leads    = readJson(pLeads)    || [];

  const db = openDB(dbFile);
  await ensureTables(db);

  const ns = await importStudents(db, students);
  const np = await importPayments(db, payments);
  const nl = await importLeads(db, leads);

  const sCnt = await all(db, 'SELECT COUNT(*) as c FROM students');
  const pCnt = await all(db, 'SELECT COUNT(*) as c FROM payments');
  const lCnt = await all(db, 'SELECT COUNT(*) as c FROM leads');

  console.log(`Imported: students=${ns}, payments=${np}, leads=${nl}`);
  console.log(`Now in DB: students=${sCnt[0].c}, payments=${pCnt[0].c}, leads=${lCnt[0].c}`);
  db.close();
})().catch(e => { console.error(e); process.exit(1); });