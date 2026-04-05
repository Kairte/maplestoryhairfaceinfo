import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pool } from "./db.js";
import { quizRouter } from "./routes/quiz.js";
import { awardsRouter } from "./routes/awards.js";
import { statsRouter } from "./routes/stats.js";

dotenv.config();

const app = express();
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res, next) => {
  try {
    await pool.query("select 1");
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.use("/api/quiz-events", quizRouter);
app.use("/api/awards-events", awardsRouter);
app.use("/api/stats", statsRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    ok: false,
    message: error.message || "Internal server error.",
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Stats API listening on port ${port}`);
});
