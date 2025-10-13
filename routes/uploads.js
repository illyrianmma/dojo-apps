const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");

const router = express.Router();

const uploadsDir = process.env.UPLOADS_DIR
  ? process.env.UPLOADS_DIR
  : path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safeBase = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, ts + "_" + safeBase);
  }
});
function fileFilter(_req, file, cb) {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error("Only image uploads are allowed"), false);
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB

router.post("/image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const rel = "/uploads/" + req.file.filename; // served by server.js
  res.json({ url: rel });
});

module.exports = router;
