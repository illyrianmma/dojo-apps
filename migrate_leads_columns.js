const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "dojo.db");
console.log("[migrate] Using DB:", DB_PATH);
const db = new sqlite3.Database(DB_PATH);

function ensureColumn(table, column, type){
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, (err, cols)=>{
      if (err) { console.error(`[migrate] PRAGMA error:`, err.message || err); return resolve(false); }
      const has = Array.isArray(cols) && cols.some(c => String(c.name).toLowerCase() === column.toLowerCase());
      if (has) { console.log(`[migrate] ${table}.${column} exists`); return resolve(true); }
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (e)=>{
        if (e) { console.error(`[migrate] ADD ${table}.${column} failed:`, e.message || e); return resolve(false); }
        console.log(`[migrate] Added ${table}.${column} (${type})`);
        resolve(true);
      });
    });
  });
}

(async()=>{
  // make sure the table itself exists (in case)
  await new Promise(r => db.run(`CREATE TABLE IF NOT EXISTS leads(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, phone TEXT, email TEXT, interested_program TEXT
  )`, ()=>r()));

  // Add the columns we may use anywhere in the app
  await ensureColumn("leads", "source", "TEXT");
  await ensureColumn("leads", "follow_up_date", "TEXT");
  await ensureColumn("leads", "status", "TEXT");
  await ensureColumn("leads", "notes", "TEXT");

  db.close();
})();
