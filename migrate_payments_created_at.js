const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH  = process.env.DOJO_DB  || path.join(DATA_DIR, "dojo.db");
console.log("[migrate-payments-created_at] DB:", DB_PATH);
const db = new sqlite3.Database(DB_PATH);

db.serialize(()=>{
  // ensure table exists (no-op if it does)
  db.run(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY)`);

  db.all(`PRAGMA table_info(payments)`, (err, cols)=>{
    if (err) { console.error(err); process.exit(1); }
    const has = (cols||[]).some(c => (c.name||"").toLowerCase()==="created_at");
    const backfill = ()=>{
      db.run(`UPDATE payments
              SET created_at = COALESCE(created_at, datetime('now'))`,
        (e)=>{
          if (e) console.error("[migrate] backfill error:", e);
          else console.log("[migrate] backfilled payments.created_at");
          db.close(()=>process.exit(0));
        });
    };
    if (!has) {
      db.run(`ALTER TABLE payments ADD COLUMN created_at TEXT`, (e)=>{
        if (e) console.error("[migrate] add column error:", e);
        else    console.log("[migrate] added payments.created_at");
        backfill();
      });
    } else {
      console.log("[migrate] payments.created_at exists");
      backfill();
    }
  });
});
