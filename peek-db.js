// peek-db.js - quick counts + sample rows
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const file = process.argv[2] || process.env.DB_FILE;
if (!file) { console.error('Usage: node peek-db.js "C:\\path\\to\\db.sqlite"'); process.exit(1); }
if (!fs.existsSync(file)) { console.error('DB not found:', file); process.exit(1); }

const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error(err.message); process.exit(1); }
});

function listTables() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (e, rows) => {
      if (e) reject(e); else resolve(rows.map(r => r.name));
    });
  });
}
function count(table) {
  return new Promise((resolve) => {
    db.get(`SELECT COUNT(*) AS n FROM ${table}`, [], (err, row) => {
      resolve({ table, n: err ? 'err' : row.n });
    });
  });
}
(async () => {
  console.log('=== Inspecting DB ===');
  console.log('Path:', file, '\n');
  const tables = await listTables();
  const wanted = ['students','payments','leads','old_students','memberships'];
  const present = wanted.filter(t => tables.includes(t));
  if (!present.length) {
    console.log('No known tables found. Existing tables:', tables.join(', ') || '(none)');
    db.close(); return;
  }
  const counts = await Promise.all(present.map(count));
  counts.forEach(c => console.log(`${c.table.padEnd(12)} : ${c.n}`));

  if (tables.includes('students')) {
    db.all(`SELECT id,name,status,join_date,start_date,renewal_date 
            FROM students ORDER BY id DESC LIMIT 5`, [], (e, rows) => {
      console.log('\nSample students (up to 5):');
      if (e || !rows || !rows.length) console.log('(none)'); else rows.forEach(r => console.log(r));
      db.close();
    });
  } else {
    db.close();
  }
})().catch(e => { console.error(e); db.close(); });
