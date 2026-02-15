#!/usr/bin/env node
/**
 * Seed one patient: Steven Paul Jobs, phone +12015648390.
 * Run from repo root: node patient-followup/scripts/seed-patient-steven-jobs.js
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "server", ".env") });
dotenv.config();

const { createIndex, addPatient } = await import("../services/patientService.js");

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const dischargeDate = new Date(now - 2 * DAY);
const surgeryDate = new Date(dischargeDate.getTime() - 1 * DAY);

const patient = {
  patient_id: "pt-steven-jobs",
  name: "Steven Paul Jobs",
  phone: "+12015648390",
  age: 56,
  gender: "Male",
  surgery_type: "Pancreatic surgery",
  surgery_date: surgeryDate.toISOString().slice(0, 10),
  discharge_date: dischargeDate.toISOString().slice(0, 10),
  risk_factors: [],
  call_history: [],
};

async function main() {
  await createIndex();
  await addPatient(patient);
  console.log("Seeded patient:", patient.patient_id, "—", patient.name, "—", patient.phone);
  console.log("  surgery:", patient.surgery_type, "| discharge:", patient.discharge_date);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
