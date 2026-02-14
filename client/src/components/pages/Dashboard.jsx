import React, { useState, useEffect } from "react";
import PatientCards from "../modules/PatientCards";
import PatientProfile from "../modules/PatientProfile";
import CallSummary from "../modules/CallSummary";
import SearchBar from "../modules/SearchBar";

// FALLBACK MOCK DATA (used when ES is unavailable)
const SHARED_CALL_HISTORY = [
  {
    _index: "patients",
    _id: "seed-due-now",
    _version: 32,
    _score: 1,
    _ignored: ["call_history.transcript.text.keyword", "expected_response_text.keyword"],
    fields: {
      "transcript.speaker": ["ai", "patient", "ai", "patient", "ai", "patient", "ai", "patient", "ai"],
      recommended_action: ["No immediate action needed. Continue routine post-operative monitoring per protocol."],
      triage_level: ["green"],
      "transcript.text": [
        "Hi, this is CareLink calling for your post-surgery check-in. To confirm privacy, is this the patient? Say yes or no, or press 1 for yes and 2 for no.",
        "But yes.",
        "Thank you for confirming. How are you feeling today, and what symptoms are most bothering you right now?",
        "I'm very sleep deprived.",
        "I'm sorry to hear you're not sleeping well. Is the sleep difficulty mainly due to pain from your knee, or are there other factors keeping you awake?",
        "No, my boyfriend broke up with me.",
        "I'm sorry to hear about your breakup - that must be really difficult. Focusing on your knee recovery, are you experiencing any pain, swelling, or other symptoms from your surgery?",
        "Why is it that?",
        "I understand this is a difficult time for you. Based on your responses, your recovery looks like it is on track. Keep following your post-surgery care instructions. We will check in again at your next scheduled follow-up. Thank you for your time. Take care and have a good day. Goodbye.",
      ],
      "transcript.timestamp": ["2026-02-14T19:22:39.324Z", "2026-02-14T19:22:39.324Z", "2026-02-14T19:22:40.633Z", "2026-02-14T19:22:49.956Z", "2026-02-14T19:22:54.712Z", "2026-02-14T19:23:12.839Z", "2026-02-14T19:23:17.164Z", "2026-02-14T19:23:25.018Z", "2026-02-14T19:23:28.901Z"],
      call_date: ["2026-02-14T19:23:29.167Z"],
      flagged: [false],
      reasoning_summary: ["Patient has not reported any specific surgical symptoms. Sleep issues appear unrelated to surgery (personal relationship matter). No warning signs identified."],
    },
  },
];

const MOCK_PATIENTS = [
  { patient_id: "1001", name: "John Smith", phone: "+14155551234", age: 45, gender: "Male", surgery_type: "ACL reconstruction", surgery_date: "2026-02-11", discharge_date: "2026-02-15", risk_factors: ["diabetes", "obesity"], call_history: SHARED_CALL_HISTORY },
  { patient_id: "1002", name: "Maria Gonzalez", phone: "+14155552345", age: 62, gender: "Female", surgery_type: "Total knee replacement", surgery_date: "2026-02-09", discharge_date: "2026-02-12", risk_factors: ["hypertension"], call_history: SHARED_CALL_HISTORY },
  { patient_id: "1003", name: "David Chen", phone: "+14155553456", age: 38, gender: "Male", surgery_type: "Appendectomy", surgery_date: "2026-02-12", discharge_date: "2026-02-16", risk_factors: [], call_history: SHARED_CALL_HISTORY },
  { patient_id: "1004", name: "Aisha Patel", phone: "+14155554567", age: 55, gender: "Female", surgery_type: "Hysterectomy", surgery_date: "2026-02-08", discharge_date: "2026-02-14", risk_factors: ["anemia", "smoking"], call_history: SHARED_CALL_HISTORY },
  { patient_id: "1005", name: "Michael Brown", phone: "+14155555678", age: 70, gender: "Male", surgery_type: "Coronary artery bypass", surgery_date: "2026-02-05", discharge_date: "2026-02-10", risk_factors: ["heart disease", "diabetes", "hypertension"], call_history: SHARED_CALL_HISTORY },
  { patient_id: "1006", name: "Samantha Lee", phone: "+14155556789", age: 29, gender: "Female", surgery_type: "Gallbladder removal", surgery_date: "2026-02-13", discharge_date: "2026-02-18", risk_factors: ["obesity"], call_history: SHARED_CALL_HISTORY },
];

const PATIENT_AVATARS = {
  "1001": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
  "1002": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
  "1003": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
  "1004": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
  "1005": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
  "1006": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop",
};

const TRIAGE_TO_URGENCY = { green: "Minimal", yellow: "Monitor", red: "Urgent" };

function formatDischargeDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate.replace("T00:00:00.000Z", ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function patientToUI(raw) {
  const latestCall = raw.call_history && raw.call_history[0];
  const fields = latestCall && latestCall.fields ? latestCall.fields : {};
  const triage = (fields.triage_level && fields.triage_level[0]) || "green";
  const reasoning = (fields.reasoning_summary && fields.reasoning_summary[0]) || "";
  const recommended = (fields.recommended_action && fields.recommended_action[0]) || "";
  const aiSummary = reasoning || recommended || "No summary available.";
  const transcriptText = fields["transcript.text"] || [];
  const symptoms = transcriptText.length > 0 ? ["See call history"] : ["None reported"];

  return {
    id: raw.patient_id,
    patient_id: raw.patient_id,
    name: raw.name,
    phone: raw.phone,
    avatar: PATIENT_AVATARS[raw.patient_id],
    operation: raw.surgery_type,
    symptoms,
    dischargeDate: formatDischargeDate(raw.discharge_date),
    urgency: TRIAGE_TO_URGENCY[triage] || "Minimal",
    age: raw.age,
    sex: raw.gender,
    riskFactors: (raw.risk_factors || []).map((f) => f.charAt(0).toUpperCase() + f.slice(1)),
    aiSummary,
    call_history: raw.call_history,
  };
}

const Dashboard = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [viewCallSummary, setViewCallSummary] = useState(false);
  const [patientsData, setPatientsData] = useState(MOCK_PATIENTS);

  useEffect(() => {
    async function fetchPatients() {
      try {
        const res = await fetch("/api/patients/all");
        if (res.ok) {
          const data = await res.json();
          if (data.patients && data.patients.length > 0) {
            setPatientsData(data.patients);
          }
        }
      } catch {
        // ES unavailable — keep mock data
      }
    }
    fetchPatients();
  }, []);

  const handleContact = async (patient) => {
    const res = await fetch(`/api/twilio/call/${patient.patient_id}`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Call failed");
    }
    return data;
  };

  const filteredPatients = patientsData
    .filter((raw) => {
      const query = searchQuery.toLowerCase();
      if (!query) return true;
      return (
        raw.name.toLowerCase().includes(query) ||
        raw.surgery_type.toLowerCase().includes(query) ||
        (raw.risk_factors || []).some((f) => f.toLowerCase().includes(query))
      );
    })
    .map(patientToUI);

  return (
    <div className="mt-12 py-10 px-10">
      {selectedPatient && viewCallSummary ? (
        <CallSummary
          patient={selectedPatient}
          onBack={() => setViewCallSummary(false)}
        />
      ) : selectedPatient ? (
        <PatientProfile
          patient={selectedPatient}
          onBack={() => {
            setSelectedPatient(null);
            setViewCallSummary(false);
          }}
          onViewSummary={() => setViewCallSummary(true)}
          onContact={handleContact}
        />
      ) : (
        <>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />

          <h2 className="text-2xl font-bold mb-6" style={{ color: "var(--tertiary)" }}>
            Your Patients
          </h2>

          <PatientCards patients={filteredPatients} onSelect={(p) => {
            setSelectedPatient(p);
            setViewCallSummary(false);
          }} />
        </>
      )}
    </div>
  );
};

export default Dashboard;
