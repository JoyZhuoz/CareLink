import React, { useState, useEffect } from "react";
import PatientCards from "../modules/PatientCards";
import PatientProfile from "../modules/PatientProfile";
import CallSummary from "../modules/CallSummary";
import SearchBar from "../modules/SearchBar";

const TRIAGE_TO_URGENCY = { green: "Minimal", yellow: "Monitor", red: "Urgent" };

function formatDischargeDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate.replace("T00:00:00.000Z", ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTriageFromCall(latestCall) {
  if (!latestCall) return "green";
  const fields = latestCall.fields;
  if (fields && fields.triage_level && fields.triage_level[0]) return fields.triage_level[0];
  return latestCall.triage_level || "green";
}
function getSummaryFromCall(latestCall) {
  if (!latestCall) return "No summary available.";
  const fields = latestCall.fields;
  if (fields) {
    const r = fields.reasoning_summary && fields.reasoning_summary[0];
    const a = fields.recommended_action && fields.recommended_action[0];
    return r || a || "No summary available.";
  }
  return latestCall.reasoning_summary || latestCall.recommended_action || "No summary available.";
}

function patientToUI(raw) {
  const latestCall = raw.call_history && raw.call_history[0];
  const triage = getTriageFromCall(latestCall);
  const aiSummary = getSummaryFromCall(latestCall);
  const hasTranscript =
    latestCall &&
    ((latestCall.transcript && latestCall.transcript.length > 0) ||
      (latestCall.fields && (latestCall.fields["transcript.text"] || []).length > 0));
  const symptoms = hasTranscript ? ["See call history"] : ["None reported"];

  const hasBeenCalled = !!(raw.call_history && raw.call_history.length > 0);
  // Next scheduled call: 2 days after discharge if not yet called (matches scheduler logic)
  let nextCallDate = null;
  if (!hasBeenCalled && raw.discharge_date) {
    const d = new Date(raw.discharge_date);
    d.setDate(d.getDate() + 2);
    nextCallDate = d.toISOString();
  }

  const name = raw.name || "Unknown";
  const avatar =
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=128&background=random`;

  return {
    id: raw.patient_id,
    patient_id: raw.patient_id,
    name,
    phone: raw.phone,
    avatar,
    operation: raw.surgery_type,
    symptoms,
    dischargeDate: formatDischargeDate(raw.discharge_date),
    urgency: TRIAGE_TO_URGENCY[triage] || "Minimal",
    age: raw.age,
    sex: raw.gender,
    riskFactors: (raw.risk_factors || []).map((f) => (f && f.charAt(0).toUpperCase() + f.slice(1)) || "").filter(Boolean),
    aiSummary,
    call_history: raw.call_history,
    hasBeenCalled,
    nextCallDate,
  };
}

const Dashboard = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [viewCallSummary, setViewCallSummary] = useState(false);
  const [patientsData, setPatientsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    async function fetchPatients() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/patients/all");
        const data = await res.json();
        if (res.ok) {
          setPatientsData(data.patients || []);
        } else {
          setLoadError(data.error || "Failed to load patients");
          setPatientsData([]);
        }
      } catch (err) {
        setLoadError(err.message || "Failed to load patients");
        setPatientsData([]);
      } finally {
        setLoading(false);
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

          {loading ? (
            <p className="text-gray-600">Loading patients from database…</p>
          ) : loadError ? (
            <p className="text-red-600">{loadError}</p>
          ) : filteredPatients.length === 0 ? (
            <p className="text-gray-600">No patients found.</p>
          ) : (
            <PatientCards
              patients={filteredPatients}
              onSelect={(p) => {
                setSelectedPatient(p);
                setViewCallSummary(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
