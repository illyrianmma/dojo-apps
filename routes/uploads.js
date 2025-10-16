const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

// Always use the resolved, writable folder from persist.js
const { UPLOADS_DIR } = require("../persist");

// Ensure the uploads dir exists (this path is under /data or ./data)
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname) || "";
    const base = path.basename(file.originalname, ext)
                  .replace(/[^a-z0-9_\-]+/gi, "_");
    cb(null, `${Date.now()}_${base}${ext.toLowerCase()}`);
  }
});

const upload = multer({ storage });
const router = express.Router();

// Upload single file: field name = "file"
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({
    ok: true,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`
  });
});

// List uploaded files
router.get("/", (req, res) => {
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(files || []);
  });
});

// Delete by filename
router.delete("/:name", (req, res) => {
  const target = path.join(UPLOADS_DIR, req.params.name);
  fs.unlink(target, (err) => {
    if (err && err.code !== "ENOENT") {
      return res.status(500).json({ error: err.message });
    }
    res.json({ ok: true });
  });
});

module.exports = router;
