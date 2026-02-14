import React, { useState, useEffect } from "react";
import PatientCard from "../modules/PatientCard";
import TabSwitcher from "../modules/TabSwitcher";
import NavBar from "../modules/NavBar";

/** Map triage_level from ES → display label for PatientCard */
function triageToUrgency(level) {
  switch (level) {
    case "red":
      return "Urgent";
    case "yellow":
      return "Monitor";
    case "green":
      return "Minimal";
    default:
      return "Minimal";
  }
}

/** Format ISO date string → readable "Feb 11, 2026" */
function fmtDate(iso) {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Compute when the next automated call is scheduled.
 * Schedule: 48 hours, 5 days, 14 days post-discharge.
 */
const CALL_OFFSETS_MS = [
  2 * 24 * 60 * 60 * 1000,  // 48 hours
  5 * 24 * 60 * 60 * 1000,  // 5 days
  14 * 24 * 60 * 60 * 1000, // 14 days
];

function getNextScheduledCall(dischargeDate, callCount) {
  if (!dischargeDate) return null;
  const discharge = new Date(dischargeDate).getTime();
  const idx = Math.min(callCount, CALL_OFFSETS_MS.length - 1);
  // If all calls are done, no next call
  if (callCount >= CALL_OFFSETS_MS.length) return null;
  return new Date(discharge + CALL_OFFSETS_MS[idx]);
}

function formatCountdown(nextCallDate) {
  const now = Date.now();
  const diff = nextCallDate.getTime() - now;
  if (diff <= 0) return "Overdue";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h`;
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Map an Elasticsearch patient document → shape expected by PatientCard */
function toCardData(p) {
  const latestCall =
    Array.isArray(p.call_history) && p.call_history.length > 0
      ? p.call_history[p.call_history.length - 1]
      : null;

  const hasBeenCalled = Boolean(latestCall);
  const callCount = Array.isArray(p.call_history) ? p.call_history.length : 0;
  const nextCallDate = getNextScheduledCall(p.discharge_date, callCount);

  const symptoms = latestCall?.matched_complications?.length
    ? latestCall.matched_complications.join(", ")
    : latestCall
      ? "Assessed – see summary"
      : "No call yet";

  const urgency = latestCall
    ? triageToUrgency(latestCall.triage_level)
    : "Minimal";

  const aiSummary = latestCall
    ? [latestCall.reasoning_summary, latestCall.recommended_action]
        .filter(Boolean)
        .join(" — ")
    : null;

  return {
    id: p.patient_id,
    name: p.name || p.patient_id,
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.name || p.patient_id)}&backgroundColor=c0aede`,
    operation: p.surgery_type || "N/A",
    symptoms,
    dischargeDate: fmtDate(p.discharge_date),
    urgency,
    aiSummary,
    hasBeenCalled,
    nextCallDate: nextCallDate ? nextCallDate.toISOString() : null,
  };
}

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("patients");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchPatients() {
      try {
        setLoading(true);
        const res = await fetch("/api/patients");
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        setPatients(data.map(toCardData));
      } catch (err) {
        console.error("Failed to fetch patients:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPatients();
  }, []);

  return (
    <div className="min-h-screen bg-primary p-4 sm:p-6 md:p-10">
      <div className="mx-10 mx-auto">
        <NavBar />

        <div className="mt-10">
          <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "patients" ? (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 drop-shadow">
                Your Patients
              </h2>

              {loading && (
                <p className="text-gray-600 text-lg">Loading patients...</p>
              )}

              {error && (
                <p className="text-red-600 text-lg">
                  Error loading patients: {error}
                </p>
              )}

              {!loading && !error && patients.length === 0 && (
                <p className="text-gray-600 text-lg">
                  No patients found. Seed some patients to get started.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8 lg:gap-12">
                {patients.map((patient) => (
                  <PatientCard key={patient.id} patient={patient} />
                ))}
              </div>
            </>
          ) : (
            <div className="bg-secondary rounded-3xl p-12 md:p-16 shadow-2xl text-center">
              <svg
                className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                Analytics Coming Soon
              </h3>
              <p className="text-gray-700 text-lg">
                This feature is not yet implemented.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
