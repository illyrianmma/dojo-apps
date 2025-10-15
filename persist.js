const fs = require("fs");
const path = require("path");

// Detect Render persistent disk mount (prefer /var/data, fallback to /data)
const PERSIST_ROOT = process.env.DATA_DIR
  || (fs.existsSync("/var/data") ? "/var/data"
  : fs.existsSync("/data") ? "/data"
  : "/opt/render/project/src"); // local fallback

// Allow explicit env overrides; otherwise use PERSIST_ROOT
const DATA_DIR    = process.env.DATA_DIR    || PERSIST_ROOT;
const DB_PATH     = process.env.DOJO_DB     || path.join(DATA_DIR, "dojo.db");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, "uploads");

// Make sure folders exist (no-op if already there)
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// If a repo-level dojo.db exists (first deploy) and disk db doesn't, seed it once
const repoDb = path.join(process.cwd(), "dojo.db");
try {
  if (fs.existsSync(repoDb) && !fs.existsSync(DB_PATH)) {
    fs.copyFileSync(repoDb, DB_PATH);
  }
} catch (_) { /* ignore on read-only builds */ }

module.exports = { DATA_DIR, DB_PATH, UPLOADS_DIR };
