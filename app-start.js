const fs = require("fs");
const path = require("path");

// show which build deployed
const verPath = path.join(__dirname,"public","VERSION.txt");
let ver = "NO_VERSION_FILE";
try{ ver = fs.readFileSync(verPath,"utf8").trim(); }catch{}
console.log("[dojo] VERSION:", ver);

// run the migration, then start the server
const { spawn } = require("child_process");
const nodeBin = process.execPath;
const mig = spawn(nodeBin, [path.join(__dirname,"migrate_expenses_cols.js")], { stdio:"inherit" });

mig.on("exit", (code)=>{
  if(code!==0) console.error("[dojo] migrate_expenses_cols exited with", code);
  console.log(">>> starting server.js <<<");
  require("./server.js");
});
