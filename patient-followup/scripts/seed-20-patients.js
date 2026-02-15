#!/usr/bin/env node
/**
 * Seed 20 patients with full call_history: synthetic transcripts, triage, symptoms, condition_change, etc.
 * Run: node patient-followup/scripts/seed-20-patients.js
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

function iso(daysAgo) {
  return new Date(now - daysAgo * DAY).toISOString();
}
function dateStr(daysAgo) {
  return iso(daysAgo).slice(0, 10);
}

/** Build a full call record with multi-turn transcript and all fields. */
function makeCall(opts) {
  const {
    daysAgo,
    triage_level,
    reasoning_summary,
    matched_complications,
    recommended_action,
    symptoms_mentioned,
    condition_change = "first_call",
    transcriptTurns = [],
  } = opts;
  const t = iso(daysAgo);
  const baseTranscript = [
    { speaker: "ai", text: "Hi, this is CareLink calling for your post-surgery check-in. To confirm, is this the patient?", timestamp: t },
    { speaker: "patient", text: "Yes, this is me.", timestamp: t },
    { speaker: "ai", text: "Thank you. How are you feeling today, and what symptoms are most bothering you?", timestamp: t },
    ...transcriptTurns,
  ];
  return {
    call_date: t,
    triage_level,
    reasoning_summary,
    matched_complications: matched_complications || [],
    recommended_action,
    symptoms_mentioned: symptoms_mentioned || [],
    condition_change,
    transcript: baseTranscript.map((turn, i) => ({
      ...turn,
      timestamp: new Date(new Date(t).getTime() + i * 60000).toISOString(),
    })),
    similarity_score: null,
    flagged: false,
  };
}

const SURGERIES = [
  "Total knee replacement",
  "Hip replacement",
  "ACL reconstruction",
  "Laparoscopic cholecystectomy",
  "Appendectomy",
  "Rotator cuff repair",
  "Cataract surgery",
  "Spinal fusion",
  "Coronary artery bypass",
  "Hysterectomy",
  "Knee arthroscopy",
  "Gallbladder removal",
  "Colon resection",
  "C-section",
  "Thyroidectomy",
];

const NAMES = [
  "Elena Vasquez", "Marcus Webb", "Priya Sharma", "Oliver Nielsen", "Yuki Tanaka",
  "Fatima Hassan", "Liam O'Brien", "Zara Okonkwo", "Noah Bergstrom", "Sofia Petrov",
  "Aiden Kim", "Isabella Romano", "Ethan Walsh", "Mia Johansson", "Lucas Dubois",
  "Ava Kowalski", "Mason Singh", "Chloe Nakamura", "Alexander Costa", "Harper Chen",
];

const patients = [];
for (let i = 0; i < 20; i++) {
  const name = NAMES[i];
  const surgeryType = SURGERIES[i % SURGERIES.length];
  const dischargeDaysAgo = 2 + (i % 8);
  const surgeryDaysAgo = dischargeDaysAgo + 2;
  const patientId = `pt-seed-${i + 1}-${name.toLowerCase().replace(/\s+/g, "-")}`;
  const phone = `+1555${String(100000 + i).slice(0, 7)}`;

  const numCalls = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;
  const call_history = [];

  if (numCalls >= 1) {
    const level1 = i % 5 === 0 ? "red" : i % 5 === 1 ? "yellow" : "green";
    const symptoms1 = level1 === "red"
      ? ["fever", "redness at incision", "worsening pain"]
      : level1 === "yellow"
        ? ["moderate swelling", "stiffness"]
        : ["mild soreness", "doing well"];
    const reasoning1 = level1 === "red"
      ? "Patient reports fever and incision redness consistent with possible surgical site infection. Urgent evaluation recommended."
      : level1 === "yellow"
        ? "Patient reports swelling and stiffness outside typical recovery. Outpatient follow-up within 24-48 hours recommended."
        : "Symptoms within expected recovery range. No immediate action needed.";
    const action1 = level1 === "red"
      ? "Readmit patient for urgent evaluation of possible surgical site infection."
      : level1 === "yellow"
        ? "Refer to outpatient follow-up within 24-48 hours for assessment."
        : "No immediate action. Continue routine monitoring.";
    call_history.push(
      makeCall({
        daysAgo: dischargeDaysAgo + 1,
        triage_level: level1,
        reasoning_summary: reasoning1,
        matched_complications: level1 === "red" ? ["surgical site infection"] : level1 === "yellow" ? ["excessive swelling"] : [],
        recommended_action: action1,
        symptoms_mentioned: symptoms1,
        condition_change: "first_call",
        transcriptTurns: [
          { speaker: "patient", text: level1 === "red" ? "I have a fever and my incision is really red and warm." : level1 === "yellow" ? "My knee is pretty swollen and stiff, worse than yesterday." : "Just a little sore but I'm doing well overall.", timestamp: iso(dischargeDaysAgo + 1) },
          { speaker: "ai", text: "Thanks for sharing. Can you tell me when that started and if it's getting better or worse?", timestamp: iso(dischargeDaysAgo + 1) },
          { speaker: "patient", text: level1 === "red" ? "It started two days ago and it's getting worse." : "Started after I got home. About the same.", timestamp: iso(dischargeDaysAgo + 1) },
        ],
      })
    );
  }

  if (numCalls >= 2) {
    const level2 = i % 7 === 0 ? "red" : "green";
    const symptoms2 = ["pain improving", "no fever", "incision healing"];
    call_history.push(
      makeCall({
        daysAgo: dischargeDaysAgo,
        triage_level: level2,
        reasoning_summary: "Follow-up call shows improvement. Symptoms within expected range.",
        matched_complications: [],
        recommended_action: "No immediate action. Continue routine post-operative monitoring.",
        symptoms_mentioned: symptoms2,
        condition_change: level2 === "green" && call_history[0].triage_level !== "green" ? "recovery" : "stable",
        transcriptTurns: [
          { speaker: "patient", text: "Much better than last time. The swelling went down and no more fever.", timestamp: iso(dischargeDaysAgo) },
          { speaker: "ai", text: "Good to hear. Is the pain manageable?", timestamp: iso(dischargeDaysAgo) },
          { speaker: "patient", text: "Yes, just taking Tylenol as needed.", timestamp: iso(dischargeDaysAgo) },
        ],
      })
    );
  }

  patients.push({
    patient_id: patientId,
    name,
    phone,
    age: 35 + (i % 45),
    gender: i % 2 === 0 ? "Female" : "Male",
    surgery_type: surgeryType,
    surgery_date: dateStr(surgeryDaysAgo),
    discharge_date: dateStr(dischargeDaysAgo),
    risk_factors: i % 4 === 0 ? ["hypertension"] : i % 4 === 1 ? ["diabetes"] : [],
    call_history,
  });
}

async function main() {
  await createIndex();
  for (const p of patients) {
    await addPatient(p);
    const callInfo = p.call_history.length
      ? ` ${p.call_history.length} call(s), latest: ${p.call_history[p.call_history.length - 1].triage_level}`
      : " no calls";
    console.log("Seeded:", p.patient_id, "—", p.name, "—", p.surgery_type + callInfo);
  }
  console.log("\nDone. 20 patients seeded.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
