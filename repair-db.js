// repair-db.js - make old data visible again
// - Adds columns if missing
// - Sets status='active' where NULL/empty
// - Copies start_date -> join_date if join_date is NULL
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const file = process.env.DB_FILE;
if (!file) { console.error('Set DB_FILE env var to your DB path.'); process.exit(1); }
if (!fs.existsSync(file)) { console.error('DB not found:', file); process.exit(1); }

const db = new sqlite3.Database(file, sqlite3.OPEN_READWRITE, (err) => {
  if (err) { console.error(err.message); process.exit(1); }
  db.serialize(run);
});

function tableHasColumn(table, col) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, [], (e, rows) => {
      if (e) return resolve(false);
      resolve(rows.some(r => r.name === col));
    });
  });
}

async function ensureColumn(table, spec /* e.g. "status TEXT" */) {
  const col = spec.split(/\s+/)[0];
  const has = await tableHasColumn(table, col);
  if (!has) {
    await runSQL(`ALTER TABLE ${table} ADD COLUMN ${spec}`);
    console.log(`[repair] added column ${table}.${col}`);
  }
}

function runSQL(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}
function get(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function all(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function run() {
  try {
    console.log('=== Repair DB ===');
    console.log('Path:', file);

    // Ensure table exists
    const tables = await all(`SELECT name FROM sqlite_master WHERE type='table'`);
    if (!tables.some(t => t.name === 'students')) {
      console.log('[repair] No "students" table found. Nothing to do.');
      return finish();
    }

    // 1) Ensure columns exist
    await ensureColumn('students', 'status TEXT');
    await ensureColumn('students', 'join_date TEXT');
    await ensureColumn('students', 'renewal_date TEXT');

    // 2) Backfill join_date from start_date if needed
    const hasStart = await tableHasColumn('students', 'start_date');
    if (hasStart) {
      await runSQL(`
        UPDATE students
        SET join_date = COALESCE(join_date, start_date)
        WHERE join_date IS NULL OR join_date = ''
      `);
      console.log('[repair] join_date backfilled from start_date where empty');
    }

    // 3) Backfill status
    await runSQL(`
      UPDATE students
      SET status = 'active'
      WHERE status IS NULL OR status = ''
    `);
    console.log('[repair] status backfilled to "active" where NULL/empty');

    // 4) Quick stats
    const c1 = await get(`SELECT COUNT(*) AS n FROM students`);
    const c2 = await get(`SELECT COUNT(*) AS n FROM students WHERE status='active'`);
    console.log(`[repair] students total: ${c1.n}, active: ${c2.n}`);

    // 5) Show a few rows to confirm
    const sample = await all(`
      SELECT id,name,status,join_date,renewal_date
      FROM students ORDER BY id DESC LIMIT 5
    `);
    console.log('[repair] sample:', sample);

  } catch (e) {
    console.error(e);
  } finally {
    finish();
  }
}

function finish() { db.close(() => console.log('Done.')); }
