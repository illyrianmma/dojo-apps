const fs = require("fs");
const path = require("path");

// Print the version marker loudly before starting the server
const p = path.join(__dirname, "public", "VERSION.txt");
let v = "(missing)";
try { v = fs.readFileSync(p, "utf8"); } catch {}
console.log("[dojo] VERSION:", v.trim());

// start your real app
require("./server.js");
