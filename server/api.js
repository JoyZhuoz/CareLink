/**
 * Legacy API router stub.
 * All real routes are now mounted in server.js directly.
 * This file exists so any legacy imports don't crash.
 */
import express from "express";
const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.all("*", (req, res) => {
  console.log(`API route not found: ${req.method} ${req.url}`);
  res.status(404).json({ msg: "API route not found" });
});

export default router;
