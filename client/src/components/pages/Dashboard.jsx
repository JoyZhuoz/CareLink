import React, { useState, useEffect } from "react";
import PatientCards from "../modules/PatientCards";
import PatientProfile from "../modules/PatientProfile";
import CallSummary from "../modules/CallSummary";
import SearchBar from "../modules/SearchBar";
import { patientToUI } from "../utils/patientUtils";

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

  const URGENCY_ORDER = { Urgent: 0, Monitor: 1, Minimal: 2 };

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
    .map(patientToUI)
    .sort((a, b) => {
      const orderA = URGENCY_ORDER[a.urgency] ?? 3;
      const orderB = URGENCY_ORDER[b.urgency] ?? 3;
      return orderA - orderB;
    });

  return (
    <div className="mt-20 py-10 px-10">
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

          <div className="mt-12 animate-hero-enter">
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
          </div>


        </>
      )}
    </div>
  );
};

export default Dashboard;
