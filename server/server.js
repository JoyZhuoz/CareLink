/**
 * ============================================================================
 * CareLink – Unified Server
 * ============================================================================
 *
 * Single Express server that:
 *   1. Serves the React frontend (client/dist)
 *   2. Mounts patient-followup API routes (patients, twilio, scheduler)
 *   3. Provides a Socket.IO layer for real-time dashboard updates
 *   4. Starts the daily follow-up scheduler
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import http from "http";
import express from "express";
import { Server as SocketIOServer } from "socket.io";

// ── Load .env ────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config(); // also check root

// ── Patient-followup imports (ESM) ───────────────────────────────────────────
import patientRoutes from "../patient-followup/routes/patients.js";
import twilioRoutes from "../patient-followup/routes/twilio.js";
import { startScheduler, runFollowUpNow } from "../patient-followup/services/schedulerService.js";

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Request logger (helpful for debugging webhooks)
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// ── API routes ───────────────────────────────────────────────────────────────
app.use("/api/patients", patientRoutes);
app.use("/api/twilio", twilioRoutes);

// Manual follow-up trigger
app.post("/api/run-followup", async (_req, res) => {
  try {
    const results = await runFollowUpNow();
    res.json({ message: "Follow-up completed", results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Static React frontend ────────────────────────────────────────────────────
const reactPath = path.resolve(__dirname, "..", "client", "dist");
app.use(express.static(reactPath));

// SPA fallback – let React Router handle all other GET routes
app.get("*", (req, res) => {
  res.sendFile(path.join(reactPath, "index.html"), (err) => {
    if (err) {
      res.status(err.status || 500).send("Frontend not built yet – run `npm run build` first.");
    }
  });
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({ error: err.message });
});

// ── Start server + Socket.IO ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("Dashboard connected:", socket.id);
  socket.on("disconnect", () => console.log("Dashboard disconnected:", socket.id));
});

// Export io so services can emit events (e.g. new triage result)
export { io };

server.listen(PORT, () => {
  console.log(`CareLink server running on port ${PORT}`);
  startScheduler();
});
