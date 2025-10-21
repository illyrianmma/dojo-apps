const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const DB_PATH = path.join(process.cwd(), "dojo.db");
const db = new sqlite3.Database(DB_PATH);

function all(sql, p=[]){return new Promise((res,rej)=>db.all(sql,p,(e,r)=>e?rej(e):res(r)));}
function run(sql, p=[]){return new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(this)}));}

async function hasCol(table, col){
  const rows = await all(`PRAGMA table_info(${table})`);
  return rows.some(r=>String(r.name).toLowerCase()===String(col).toLowerCase());
}

async function maybeAdd(table, col, type){
  if (!(await hasCol(table,col))){
    console.log(`Adding ${table}.${col} ${type} ...`);
    await run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  } else {
    // console.log(`OK: ${table}.${col} exists`);
  }
}

(async ()=>{
  // Ensure new columns exist
  await maybeAdd("students","parents_name","TEXT");
  await maybeAdd("students","referral_source","TEXT");
  await maybeAdd("students","picture_path","TEXT");
  await maybeAdd("students","join_date","TEXT");    // YYYY-MM-DD
  await maybeAdd("students","renewal_date","TEXT"); // YYYY-MM-DD

  // Backfill from legacy columns if they exist
  const hasParentName = await hasCol("students","parent_name");
  const hasPhoto      = await hasCol("students","photo");
  const hasStartDate  = await hasCol("students","start_date");

  if (hasParentName){
    console.log("Backfilling parents_name from parent_name …");
    await run(`UPDATE students SET parents_name = COALESCE(parents_name, parent_name) WHERE parent_name IS NOT NULL AND parent_name <> ''`);
  }
  if (hasPhoto){
    console.log("Backfilling picture_path from photo …");
    await run(`UPDATE students SET picture_path = COALESCE(picture_path, photo) WHERE photo IS NOT NULL AND photo <> ''`);
  }
  if (hasStartDate){
    console.log("Backfilling join_date from start_date …");
    await run(`UPDATE students SET join_date = COALESCE(join_date, start_date) WHERE start_date IS NOT NULL AND start_date <> ''`);
  }

  // Optional: if only legacy "name" exists, try to split into first/last
  const hasName = await hasCol("students","name");
  const hasFirst = await hasCol("students","first_name");
  const hasLast  = await hasCol("students","last_name");
  if (hasName && hasFirst && hasLast){
    console.log("Attempting to split legacy name into first/last (where missing) …");
    // crude split on first space
    await run(`
      UPDATE students
      SET first_name = COALESCE(first_name, TRIM(SUBSTR(name, 1, INSTR(name||' ', ' ')-1))),
          last_name  = COALESCE(last_name,  TRIM(SUBSTR(name, INSTR(name||' ', ' ')+1)))
      WHERE (first_name IS NULL OR first_name='') OR (last_name IS NULL OR last_name='')
    `);
  }

  console.log("Migration complete.");
  db.close();
})().catch(e=>{ console.error(e); db.close(); process.exit(1); });
