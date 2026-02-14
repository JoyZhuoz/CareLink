#!/usr/bin/env node
/**
 * Seed multiple patients into Elasticsearch for dashboard demo.
 * Mix of:
 *   - Patients who have been called (with call_history + triage)
 *   - Patients awaiting their first call (countdown shown on dashboard)
 *   - Various surgery types, discharge dates, and risk levels
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "server", ".env") });
dotenv.config();

const { createIndex, addPatient } = await import("../services/patientService.js");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const patients = [
  // ── Already called: urgent (red) ──
  {
    patient_id: "pt-maria-garcia",
    name: "Maria Garcia",
    phone: "+15551000001",
    age: 67,
    gender: "Female",
    surgery_type: "Hip replacement",
    surgery_date: new Date(now - 6 * DAY).toISOString().slice(0, 10),
    discharge_date: new Date(now - 4 * DAY).toISOString().slice(0, 10),
    risk_factors: ["diabetes", "hypertension"],
    call_history: [
      {
        call_date: new Date(now - 2 * DAY).toISOString(),
        triage_level: "red",
        reasoning_summary:
          "Patient reports fever of 101.5°F with redness and warmth at the incision site. These symptoms are consistent with a possible surgical site infection per the expected recovery document.",
        matched_complications: ["surgical site infection", "wound dehiscence"],
        recommended_action:
          "Readmit patient to hospital for urgent evaluation of possible surgical site infection. Start empiric antibiotics pending culture results.",
        transcript: [
          { speaker: "ai", text: "How are you feeling today?", timestamp: new Date(now - 2 * DAY).toISOString() },
          { speaker: "patient", text: "I have a fever and my hip incision is red and warm.", timestamp: new Date(now - 2 * DAY).toISOString() },
        ],
      },
    ],
  },

  // ── Already called: monitor (yellow) ──
  {
    patient_id: "pt-james-wilson",
    name: "James Wilson",
    phone: "+15551000002",
    age: 45,
    gender: "Male",
    surgery_type: "ACL reconstruction",
    surgery_date: new Date(now - 5 * DAY).toISOString().slice(0, 10),
    discharge_date: new Date(now - 3 * DAY).toISOString().slice(0, 10),
    risk_factors: ["obesity"],
    call_history: [
      {
        call_date: new Date(now - 1 * DAY).toISOString(),
        triage_level: "yellow",
        reasoning_summary:
          "Patient reports moderate swelling (6/10) that has been gradually worsening over the past day. While some swelling is expected, the progression warrants clinical evaluation.",
        matched_complications: ["excessive swelling"],
        recommended_action:
          "Refer patient to outpatient follow-up within 24-48 hours for assessment of progressive knee swelling.",
        transcript: [
          { speaker: "ai", text: "How are you feeling today?", timestamp: new Date(now - 1 * DAY).toISOString() },
          { speaker: "patient", text: "My knee is pretty swollen, worse than yesterday.", timestamp: new Date(now - 1 * DAY).toISOString() },
        ],
      },
    ],
  },

  // ── Already called: minimal (green) ──
  {
    patient_id: "pt-sarah-chen",
    name: "Sarah Chen",
    phone: "+15551000003",
    age: 34,
    gender: "Female",
    surgery_type: "Laparoscopic cholecystectomy",
    surgery_date: new Date(now - 7 * DAY).toISOString().slice(0, 10),
    discharge_date: new Date(now - 6 * DAY).toISOString().slice(0, 10),
    risk_factors: [],
    call_history: [
      {
        call_date: new Date(now - 4 * DAY).toISOString(),
        triage_level: "green",
        reasoning_summary:
          "Patient reports mild soreness at incision sites and normal appetite. All symptoms fall within the expected recovery pattern for laparoscopic cholecystectomy.",
        matched_complications: [],
        recommended_action:
          "No immediate action needed. Continue routine post-operative monitoring per protocol. Schedule next follow-up call at day 14.",
        transcript: [
          { speaker: "ai", text: "How are you feeling today?", timestamp: new Date(now - 4 * DAY).toISOString() },
          { speaker: "patient", text: "Just a little sore but doing well overall.", timestamp: new Date(now - 4 * DAY).toISOString() },
        ],
      },
    ],
  },

  // ── Not yet called: discharged 1 day ago (call in ~1 day) ──
  {
    patient_id: "pt-robert-kim",
    name: "Robert Kim",
    phone: "+15551000004",
    age: 58,
    gender: "Male",
    surgery_type: "Rotator cuff repair",
    surgery_date: new Date(now - 3 * DAY).toISOString().slice(0, 10),
    discharge_date: new Date(now - 1 * DAY).toISOString().slice(0, 10),
    risk_factors: ["smoker"],
    call_history: [],
  },

  // ── Not yet called: discharged today (call in ~2 days) ──
  {
    patient_id: "pt-emily-patel",
    name: "Emily Patel",
    phone: "+15551000005",
    age: 29,
    gender: "Female",
    surgery_type: "Appendectomy",
    surgery_date: new Date(now - 1 * DAY).toISOString().slice(0, 10),
    discharge_date: new Date(now).toISOString().slice(0, 10),
    risk_factors: [],
    call_history: [],
  },

  // ── Not yet called: discharged 3 days ago (call OVERDUE) ──
  {
    patient_id: "pt-david-johnson",
    name: "David Johnson",
    phone: "+15551000006",
    age: 72,
    gender: "Male",
    surgery_type: "Knee arthroscopy",
    surgery_date: new Date(now - 5 * DAY).toISOString().slice(0, 10),
    discharge_date: new Date(now - 3 * DAY).toISOString().slice(0, 10),
    risk_factors: ["diabetes", "age > 70"],
    call_history: [],
  },
];

async function main() {
  await createIndex();

  for (const p of patients) {
    await addPatient(p);
    const status = p.call_history.length > 0
      ? `called (${p.call_history[p.call_history.length - 1].triage_level})`
      : "awaiting first call";
    console.log(`  Seeded: ${p.name} — ${p.surgery_type} — ${status}`);
  }

  console.log(`\nDone. ${patients.length} patients seeded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
