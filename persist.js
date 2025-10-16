const fs = require("fs");
const path = require("path");

function isWritable(dir) {
  try { fs.accessSync(dir, fs.constants.W_OK); return true; }
  catch { return false; }
}

let DATA_DIR = null;

// Prefer env DATA_DIR if it exists and is writable
if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR) && isWritable(process.env.DATA_DIR)) {
  DATA_DIR = process.env.DATA_DIR;
}
// Else use /data if it exists and is writable (Render default mount)
else if (fs.existsSync("/data") && isWritable("/data")) {
  DATA_DIR = "/data";
}
// Else fall back to a local folder we can always create (ephemeral on Render)
else {
  DATA_DIR = path.join(process.cwd(), "data");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.warn("[dojo] Using fallback DATA_DIR (ephemeral):", DATA_DIR);
}

console.log("[dojo] DATA_DIR =", DATA_DIR);

// DB path: use env if parent is writable, otherwise under DATA_DIR
let DB_PATH = process.env.DOJO_DB || path.join(DATA_DIR, "dojo.db");
try {
  const parent = path.dirname(DB_PATH);
  if (!(fs.existsSync(parent) && isWritable(parent))) throw new Error("db parent not writable");
} catch {
  DB_PATH = path.join(DATA_DIR, "dojo.db");
}
console.log("[dojo] DB_PATH  =", DB_PATH);

// Uploads path: env only if parent is writable; otherwise under DATA_DIR
let UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, "uploads");
try {
  const upParent = path.dirname(UPLOADS_DIR);
  if (!(fs.existsSync(upParent) && isWritable(upParent))) {
    UPLOADS_DIR = path.join(DATA_DIR, "uploads");
  }
} catch {
  UPLOADS_DIR = path.join(DATA_DIR, "uploads");
}
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
console.log("[dojo] UPLOADS_DIR =", UPLOADS_DIR);

module.exports = { DATA_DIR, DB_PATH, UPLOADS_DIR };
