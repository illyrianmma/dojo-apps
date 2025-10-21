const fs   = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const verPath = path.join(__dirname,"public","VERSION.txt");
let ver = "NO_VERSION_FILE";
try { ver = fs.readFileSync(verPath,"utf8").trim(); } catch {}
console.log("[dojo] VERSION:", ver);

const nodeBin = process.execPath;
const run = (file)=> new Promise((resolve)=> {
  console.log("[dojo] run", file);
  const p = spawn(nodeBin, [path.join(__dirname, file)], { stdio:"inherit" });
  p.on("exit", code => {
    if (code!==0) console.error(`[dojo] ${file} exited with`, code);
    resolve();
  });
});

(async ()=>{
  await run("migrate_core_cols.js");
  await run("migrate_expenses_cols.js");   // the one you added earlier
  console.log(">>> starting server.js <<<");
  require("./server.js");
})();
