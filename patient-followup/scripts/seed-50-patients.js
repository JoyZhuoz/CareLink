#!/usr/bin/env node
/**
 * Seed 50 patients with 3–5 calls each. Surgeries from app list; full call_history.
 * Run: node patient-followup/scripts/seed-50-patients.js
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
    { speaker: "ai", text: "Hi, this is CareLink calling for your post-surgery check-in. Is this the patient?", timestamp: t },
    { speaker: "patient", text: "Yes.", timestamp: t },
    { speaker: "ai", text: "Thank you. How are you feeling and what symptoms are bothering you most?", timestamp: t },
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
  "ACL reconstruction",
  "Appendectomy",
  "C-section",
  "Cataract surgery",
  "Colon resection",
  "Coronary artery bypass",
  "Gallbladder removal",
  "Hip replacement",
  "Hysterectomy",
  "Knee arthroscopy",
  "Knee replacement",
  "Laparoscopic cholecystectomy",
  "Pancreatic surgery",
  "Rotator cuff repair",
  "Spinal fusion",
  "Thyroidectomy",
  "Total knee replacement",
  "Wisdom tooth extraction",
];

const NAMES = [
  "Rebecca Torres", "Daniel Park", "Nina Patel", "James Liu", "Claire Morrison",
  "Vikram Reddy", "Emma Foster", "David Kim", "Laura Bennett", "Ryan Hayes",
  "Elena Vasquez", "Marcus Webb", "Priya Sharma", "Oliver Nielsen", "Yuki Tanaka",
  "Fatima Hassan", "Liam O'Brien", "Zara Okonkwo", "Noah Bergstrom", "Sofia Petrov",
  "Aiden Kim", "Isabella Romano", "Ethan Walsh", "Mia Johansson", "Lucas Dubois",
  "Ava Kowalski", "Mason Singh", "Chloe Nakamura", "Alexander Costa", "Harper Chen",
  "Grace Wu", "Owen Fletcher", "Lily Zhang", "Jack Thompson", "Zoe Martinez",
  "Henry Brooks", "Charlotte Lee", "Sebastian Rivera", "Amelia Davis", "Leo Anderson",
  "Stella White", "Theo Harris", "Hazel Clark", "Felix Young", "Violet King",
  "Max Turner", "Ruby Scott", "Arlo Green", "Ivy Baker", "Jasper Adams",
];

const TRIAGE_CONFIGS = [
  { level: "green", reasoning: "Symptoms within expected recovery. No action needed.", action: "No immediate action. Continue routine monitoring.", symptoms: ["mild soreness", "doing well"], complications: [] },
  { level: "yellow", reasoning: "Moderate symptoms outside typical range. Follow-up recommended.", action: "Refer to outpatient follow-up within 24-48 hours.", symptoms: ["swelling", "stiffness"], complications: ["excessive swelling"] },
  { level: "red", reasoning: "Possible infection or complication. Urgent evaluation recommended.", action: "Readmit for urgent evaluation of possible surgical site infection.", symptoms: ["fever", "redness at incision", "worsening pain"], complications: ["surgical site infection"] },
];

const PATIENT_RESPONSES = {
  green: ["Just a little sore but doing well.", "Pain is manageable with Tylenol.", "Incision looks good, no drainage."],
  yellow: ["My knee is pretty swollen, worse than yesterday.", "Some stiffness and warmth at the site.", "It's been about the same, not really improving."],
  red: ["I have a fever and the incision is red and warm.", "It started two days ago and is getting worse.", "I'm worried it might be infected."],
};

function pickConditionChange(prevLevel, currLevel) {
  if (!prevLevel) return "first_call";
  const order = { green: 0, yellow: 1, red: 2 };
  const p = order[prevLevel] ?? 0;
  const c = order[currLevel] ?? 0;
  if (c > p) return "escalation";
  if (c < p) return "recovery";
  return "stable";
}

const patients = [];
for (let i = 0; i < 50; i++) {
  const name = NAMES[i];
  const surgeryType = SURGERIES[i % SURGERIES.length];
  const dischargeDaysAgo = 5 + (i % 25);
  const surgeryDaysAgo = dischargeDaysAgo + 2 + (i % 4);
  const patientId = `pt-bulk-${i + 1}-${name.toLowerCase().replace(/\s+/g, "-").replace(/'/g, "")}`;
  const phone = `+1555${String(3000000 + i).padStart(7, "0").slice(-7)}`;

  const numCalls = 3 + (i % 3);
  const call_history = [];
  let prevLevel = null;

  for (let c = 0; c < numCalls; c++) {
    const daysAgo = dischargeDaysAgo + 2 + c * 3;
    const configIndex = (i + c) % 3;
    const config = TRIAGE_CONFIGS[configIndex];
    const condition_change = pickConditionChange(prevLevel, config.level);
    prevLevel = config.level;

    const patientResp = PATIENT_RESPONSES[config.level][c % PATIENT_RESPONSES[config.level].length];
    call_history.push(
      makeCall({
        daysAgo,
        triage_level: config.level,
        reasoning_summary: config.reasoning,
        matched_complications: config.complications,
        recommended_action: config.action,
        symptoms_mentioned: config.symptoms,
        condition_change,
        transcriptTurns: [
          { speaker: "patient", text: patientResp, timestamp: iso(daysAgo) },
          { speaker: "ai", text: "When did that start, and is it getting better, worse, or the same?", timestamp: iso(daysAgo) },
          { speaker: "patient", text: c === 0 ? "Started a few days after I got home." : "A bit better than last week.", timestamp: iso(daysAgo) },
        ],
      })
    );
  }

  patients.push({
    patient_id: patientId,
    name,
    phone,
    age: 28 + (i % 52),
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
    const latest = p.call_history[p.call_history.length - 1];
    console.log("Seeded:", p.patient_id, "—", p.name, "—", p.surgery_type, "—", p.call_history.length, "calls, latest:", latest?.triage_level);
  }
  console.log("\nDone. 50 patients with 3–5 calls each.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
