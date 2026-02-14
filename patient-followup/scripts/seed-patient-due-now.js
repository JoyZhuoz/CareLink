#!/usr/bin/env node
/**
 * Seed one patient who is due for a follow-up call right now.
 * Due = discharge_date <= now-2d and no call_history.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "server", ".env") });
dotenv.config();

const { createIndex, addPatient, getPatientsForFollowup } =
  await import("../services/patientService.js");

const dischargeDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const surgeryDate = new Date(dischargeDate.getTime() - 1 * 24 * 60 * 60 * 1000);

const patient = {
  patient_id: "seed-due-now",
  name: "Test Patient Due Now",
  phone: process.env.TWILIO_TEST_TO || "+16692250939",
  age: 50,
  gender: "Other",
  surgery_type: "Knee arthroscopy",
  surgery_date: surgeryDate.toISOString().slice(0, 10),
  discharge_date: dischargeDate.toISOString().slice(0, 10),
  risk_factors: [],
  call_history: [],
};

async function main() {
  await createIndex();
  await addPatient(patient);
  console.log(
    "Seeded patient:",
    patient.patient_id,
    patient.name,
    "discharge_date:",
    patient.discharge_date
  );

  const due = await getPatientsForFollowup();
  const inList = due.some((p) => p.patient_id === patient.patient_id);
  console.log("Due for follow-up count:", due.length);
  console.log("Seeded patient in due list:", inList ? "yes" : "no");
  if (due.length > 0) console.log("Due patient_ids:", due.map((p) => p.patient_id).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
