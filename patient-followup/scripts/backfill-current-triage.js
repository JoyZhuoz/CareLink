#!/usr/bin/env node
/**
 * Backfill current_triage for all patients from their latest call.
 * Run from repo root: node patient-followup/scripts/backfill-current-triage.js
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "server", ".env") });
dotenv.config();

const { backfillCurrentTriage } = await import("../services/patientService.js");

const result = await backfillCurrentTriage();
console.log("Backfill complete:", result);
