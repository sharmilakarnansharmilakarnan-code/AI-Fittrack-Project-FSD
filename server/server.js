const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const validateEnv = require("./config/validateEnv");
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { requireDatabase } = require("./middleware/dbConnectionMiddleware");
const { isGeminiConfigured } = require("./services/geminiService");
const { sendSuccess } = require("./utils/response");

const authRoutes = require("./routes/authRoutes");
const workoutRoutes = require("./routes/workoutRoutes");
const goalRoutes = require("./routes/goalRoutes");
const progressRoutes = require("./routes/progressRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const aiRoutes = require("./routes/aiRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
app.disable("x-powered-by");

// --- Core middleware ---
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Health check (never touches the database and needs no login) ---
// 200 when the server AND the database are available, 503 when MongoDB is not connected.
const DB_STATES = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const data = {
    server: "running",
    database: DB_STATES[dbState] || "unknown",
    gemini: isGeminiConfigured() ? "configured" : "not_configured",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  if (dbState !== 1) {
    return res.status(503).json({ success: false, message: "The server is running but the database is not available.", data });
  }
  return sendSuccess(res, 200, "AI FitTrack API is running.", data);
});

// --- Feature routes (all need the database, so they answer 503 if it is down) ---
app.use("/api/auth", requireDatabase, authRoutes);
app.use("/api/workouts", requireDatabase, workoutRoutes);
app.use("/api/goals", requireDatabase, goalRoutes);
app.use("/api/progress", requireDatabase, progressRoutes);
app.use("/api/attendance", requireDatabase, attendanceRoutes);
app.use("/api/ai", requireDatabase, aiRoutes);
app.use("/api/admin", requireDatabase, adminRoutes);

// --- 404 + centralized error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  validateEnv();
  await connectDB(); // exits the process with a clear message if MongoDB is unreachable

  const server = app.listen(PORT, () => {
    console.log(`AI FitTrack API listening on port ${PORT}`);
  });

  server.on("error", (err) => {
    console.error(
      err.code === "EADDRINUSE"
        ? `Port ${PORT} is already in use. Stop the other process or change PORT in .env.`
        : `Server error: ${err.message}`
    );
    process.exit(1);
  });
};

// Only start listening when run directly (`node server.js`), so the app can
// also be required by test tools without opening a port.
if (require.main === module) {
  startServer().catch((err) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });
}

// Prevent silent crashes on unexpected promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", err);
});

module.exports = app;
