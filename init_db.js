const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "dojo.db");
console.log("[init] Creating DB at:", DB_PATH);
const db = new sqlite3.Database(DB_PATH);

function run(sql){ return new Promise((res,rej)=>db.run(sql, e=>e?rej(e):res())); }

(async()=>{
  try {
    await run(`CREATE TABLE IF NOT EXISTS students(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT, last_name TEXT, phone TEXT, email TEXT, address TEXT,
      age INTEGER, program TEXT,
      join_date TEXT, renewal_date TEXT,
      parents_name TEXT, referral_source TEXT,
      picture_path TEXT,
      active INTEGER DEFAULT 1
    )`);

    await run(`CREATE TABLE IF NOT EXISTS payments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      amount REAL, date TEXT, method TEXT, note TEXT,
      taxable INTEGER DEFAULT 1
    )`);

    await run(`CREATE TABLE IF NOT EXISTS expenses(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT, amount REAL, date TEXT, taxable INTEGER
    )`);

    /* IMPORTANT: source included */
    await run(`CREATE TABLE IF NOT EXISTS leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, phone TEXT, email TEXT, interested_program TEXT, source TEXT
    )`);

    console.log("[init] Schema ready.");
  } catch(e){
    console.error("[init] Error:", e);
    process.exit(1);
  } finally {
    db.close();
  }
})();
