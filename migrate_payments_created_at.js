const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_PATH  = process.env.DOJO_DB  || path.join(DATA_DIR, "dojo.db");
console.log("[migrate-payments-created_at] DB:", DB_PATH);
const db = new sqlite3.Database(DB_PATH);

db.serialize(()=>{
  db.all(`PRAGMA table_info(payments)`, (err, cols)=>{
    if (err) { console.error(err); process.exit(1); }
    const hasCreated = (cols||[]).some(c => (c.name||"").toLowerCase()==="created_at");
    const addAndFill = ()=>{
      db.run(`UPDATE payments SET created_at = COALESCE(created_at, datetime('now'))`, (e)=>{
        if (e) console.error("backfill error:", e); else console.log("backfilled payments.created_at");
        db.close(()=>process.exit(0));
      });
    };
    if (!hasCreated) {
      db.run(`ALTER TABLE payments ADD COLUMN created_at TEXT`, (e)=>{
        if (e) console.error("add column error:", e); else console.log("added payments.created_at");
        addAndFill();
      });
    } else {
      console.log("payments.created_at exists");
      addAndFill();
    }
  });
});
