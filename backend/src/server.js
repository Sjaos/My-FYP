import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import savedRoutes from "./routes/saved.js";
import interactionRoutes from "./routes/interactions.js";
import recommendationRoutes from "./routes/recommendations.js";
import orderRoutes from "./routes/orders.js";

const app = express(),
  here = path.dirname(fileURLToPath(import.meta.url));
const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    process.env.APP_BASE_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS"));
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(path.join(here, "../uploads")));

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "selbuy-backend" }),
);

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/saved-items", savedRoutes);
app.use("/api/interactions", interactionRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/orders", orderRoutes);

app.use((err, req, res, next) =>
  res
    .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
    .json({ message: err.message || "Request failed" }),
);
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.listen(process.env.PORT || 5000, () =>
  console.log(
    `Selbuy API running on http://localhost:${process.env.PORT || 5000}`,
  ),
);