const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const DB = path.join(__dirname, "dojo.db");

function hasColumn(db, table, col) {
  return new Promise((resolve)=> {
    db.all(`PRAGMA table_info(${table})`, (err, rows)=>{
      if (err) return resolve(false);
      resolve((rows||[]).some(r => String(r.name).toLowerCase() === String(col).toLowerCase()));
    });
  });
}

(async ()=>{
  const db = new sqlite3.Database(DB);
  const need = !(await hasColumn(db, "expenses", "note"));
  if (need) {
    await new Promise((res,rej)=> db.run(`ALTER TABLE expenses ADD COLUMN note TEXT`, e=> e?rej(e):res()));
    console.log("[ADD] expenses.note");
  } else {
    console.log("[OK] expenses.note already exists");
  }
  db.close();
})();
