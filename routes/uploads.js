const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");

const router = express.Router();

// Ensure uploads dir exists (in case)
const uploadsDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    const ts = Date.now();
    const safeBase = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, ts + "_" + safeBase);
  }
});

// Accept only images
function fileFilter(_req, file, cb) {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error("Only image uploads are allowed"), false);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB

// POST /api/uploads/image  (field name: "image")
router.post("/image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  // Build public URL (served by express.static)
  const rel = "/uploads/" + req.file.filename;
  res.json({ url: rel });
});

module.exports = router;
