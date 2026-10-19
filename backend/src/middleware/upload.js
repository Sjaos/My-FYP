import multer from "multer";
import path from "path";
import fs from "fs";
fs.mkdirSync("uploads", { recursive: true });
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
export const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads",
    filename: (req, file, cb) =>
      cb(
        null,
        `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(file.originalname).toLowerCase()}`,
      ),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    allowed.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only JPG, PNG and WEBP images are allowed")),
});
