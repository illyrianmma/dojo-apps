const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_PATH = process.env.DOJO_DB || path.join(DATA_DIR, "dojo.db");

console.log("[migrate-expenses] DB:", DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err)=>{
  if(err){ console.error("[migrate-expenses] open error:", err); process.exit(1); }
});

function ensureCol(table, name, def, done){
  db.all(`PRAGMA table_info(${table})`, (err, rows)=>{
    if(err){ console.error("[migrate-expenses] pragma error:", err); return done(err); }
    const has = (rows||[]).some(r => (r.name||"").toLowerCase() === name.toLowerCase());
    if(has){ console.log(`[migrate-expenses] ${table}.${name} exists`); return done(); }
    db.run(`ALTER TABLE ${table} ADD COLUMN ${def}`, (e)=>{
      if(e) console.error(`[migrate-expenses] add ${table}.${name} error:`, e);
      else  console.log(`[migrate-expenses] added ${table}.${name}`);
      done(e);
    });
  });
}

db.serialize(()=>{
  // make sure table exists (minimal shape – won’t override existing)
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY,
    vendor TEXT,
    amount REAL,
    date TEXT,
    taxable INTEGER DEFAULT 0
  )`);

  // add the columns your app uses if missing
  ensureCol("expenses","category","category TEXT", ()=> {
    ensureCol("expenses","notes","notes TEXT", ()=> {
      db.close(()=> process.exit(0));
    });
  });
});
