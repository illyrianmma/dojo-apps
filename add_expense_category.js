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
  const exists = await hasColumn(db, "expenses", "category");
  if (exists) {
    console.log("[OK] expenses.category already exists");
  } else {
    await new Promise((resolve,reject)=>
      db.run(`ALTER TABLE expenses ADD COLUMN category TEXT`, (e)=> e?reject(e):resolve())
    );
    console.log("[ADD] expenses.category added");
  }
  db.close();
})();
