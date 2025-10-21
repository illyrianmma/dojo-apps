const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_PATH  = process.env.DOJO_DB  || path.join(DATA_DIR, "dojo.db");

console.log("[migrate-core] DB:", DB_PATH);
const db = new sqlite3.Database(DB_PATH, (err)=>{
  if (err) { console.error("[migrate-core] open error:", err); process.exit(1); }
});

function ensureCol(table, name, def, done){
  db.all(`PRAGMA table_info(${table})`, (err, rows)=>{
    if (err) { console.error(`[migrate-core] pragma ${table} error:`, err); return done(err); }
    const has = (rows||[]).some(r => (r.name||"").toLowerCase() === name.toLowerCase());
    if (has) { console.log(`[migrate-core] ${table}.${name} exists`); return done(); }
    db.run(`ALTER TABLE ${table} ADD COLUMN ${def}`, (e)=>{
      if (e) console.error(`[migrate-core] add ${table}.${name} error:`, e);
      else    console.log(`[migrate-core] added ${table}.${name}`);
      done(e);
    });
  });
}

function runSeries(tasks, i=0, cb=()=>{}){
  if (i>=tasks.length) return cb();
  tasks[i](()=> runSeries(tasks, i+1, cb));
}

db.serialize(()=>{
  // Ensure tables exist (id only — safe)
  db.run(`CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY)`);
  db.run(`CREATE TABLE IF NOT EXISTS leads    (id INTEGER PRIMARY KEY)`);

  const studentCols = [
    ["first_name",      "first_name TEXT"],
    ["last_name",       "last_name TEXT"],
    ["phone",           "phone TEXT"],
    ["email",           "email TEXT"],
    ["address",         "address TEXT"],
    ["age",             "age INTEGER"],
    ["parents_name",    "parents_name TEXT"],
    ["program",         "program TEXT"],
    ["referral_source", "referral_source TEXT"],
    ["join_date",       "join_date TEXT"],
    ["renewal_date",    "renewal_date TEXT"],
    ["photo",           "photo TEXT"],
    ["picture_path",    "picture_path TEXT"]  // <- NEW: fix your error
  ];

  const leadCols = [
    ["name",              "name TEXT"],
    ["phone",             "phone TEXT"],
    ["email",             "email TEXT"],
    ["interested_program","interested_program TEXT"],
    ["source",            "source TEXT"],
    ["follow_up_date",    "follow_up_date TEXT"],
    ["status",            "status TEXT"],
    ["notes",             "notes TEXT"]
  ];

  const tasks = [];
  studentCols.forEach(([n,def])=> tasks.push((next)=> ensureCol("students", n, def, next)));
  leadCols.forEach(([n,def])   => tasks.push((next)=> ensureCol("leads",    n, def, next)));

  runSeries(tasks, 0, ()=> db.close(()=> process.exit(0)));
});
