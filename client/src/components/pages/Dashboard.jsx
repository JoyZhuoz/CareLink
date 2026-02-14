import React, { useState, useRef, useEffect } from "react";
import PatientCards from "../modules/PatientCards";
import PatientProfile from "../modules/PatientProfile";
import Sidebar from "../modules/Sidebar";
import SearchBar from "../modules/SearchBar";

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 350;


//mock data for ui
const patientsData = [
  {
    id: 1,
    name: "John Smith",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
    operation: "ACL reconstruction",
    symptoms: ["Fever", "Swelling"],
    dischargeDate: "Jan 05, 2026",
    urgency: "Urgent",
    age: 45,
    sex: "Male",
    riskFactors: ["Diabetes", "Obesity"],
    aiSummary:
      "Patient reports worsening pain over the past week, which could be indicative of infection. Recommend immediate medical action via hospital visit.",
  },
  {
    id: 2,
    name: "Maria Gonzalez",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
    operation: "Total knee replacement",
    symptoms: ["Mild pain"],
    dischargeDate: "Jan 08, 2026",
    urgency: "Minimal",
    age: 62,
    sex: "Female",
    riskFactors: ["Hypertension"],
    aiSummary:
      "Recovery progressing well with minimal pain reported. No follow-up concerns at this time.",
  },
  {
    id: 3,
    name: "David Chen",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
    operation: "Appendectomy",
    symptoms: ["Fever", "Swelling"],
    dischargeDate: "Jan 10, 2026",
    urgency: "Monitor",
    age: 38,
    sex: "Male",
    riskFactors: [],
    aiSummary:
      "Mild fever and swelling noted. Recommend monitoring over next 48 hours and follow up if symptoms persist.",
  },
  {
    id: 4,
    name: "Aisha Patel",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
    operation: "Hysterectomy",
    symptoms: ["Nausea", "Fatigue"],
    dischargeDate: "Jan 12, 2026",
    urgency: "Urgent",
    age: 55,
    sex: "Female",
    riskFactors: ["Anemia", "Smoking"],
    aiSummary:
      "Patient experiencing persistent nausea and extreme fatigue. Blood work recommended to rule out post-surgical complications.",
  },
  {
    id: 5,
    name: "Michael Brown",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
    operation: "Coronary artery bypass",
    symptoms: ["Chest tightness"],
    dischargeDate: "Jan 03, 2026",
    urgency: "Monitor",
    age: 70,
    sex: "Male",
    riskFactors: ["Heart Disease", "Diabetes", "Hypertension"],
    aiSummary:
      "Reports occasional chest tightness. Schedule cardiology follow-up to assess recovery progress.",
  },
  {
    id: 6,
    name: "Samantha Lee",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop",
    operation: "Gallbladder removal",
    symptoms: ["None reported"],
    dischargeDate: "Jan 14, 2026",
    urgency: "Minimal",
    age: 29,
    sex: "Female",
    riskFactors: ["Obesity"],
    aiSummary:
      "No symptoms reported. Patient is recovering as expected with no concerns.",
  },
];

const Dashboard = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef(null);

  const handleResizeStart = (e) => {
    e.preventDefault();
    resizeStartRef.current = { x: e.clientX, width: sidebarWidth };
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const delta = e.clientX - start.x;
      setSidebarWidth((w) =>
        Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, start.width + delta))
      );
    };
    const onUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const filteredPatients = patientsData.filter((patient) => {
    const query = searchQuery.toLowerCase();
    if (!query) return true;
    return (
      patient.name.toLowerCase().includes(query) ||
      (Array.isArray(patient.symptoms)
        ? patient.symptoms.some((s) => s.toLowerCase().includes(query))
        : patient.symptoms.toLowerCase().includes(query)) ||
      patient.operation.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex min-h-screen bg-white">
      <div
        className="fixed top-0 left-0 h-screen z-10 flex shrink-0 flex-col"
        style={{
          width: isSidebarCollapsed ? 0 : sidebarWidth,
          transition: isResizing ? "none" : "width 0.2s ease",
          overflow: isSidebarCollapsed ? "hidden" : "visible",
        }}
      >
        <div className="h-screen" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <Sidebar activePage="dashboard" />
        </div>
        {!isSidebarCollapsed && (
          <div
            role="separator"
            aria-label="Resize sidebar"
            onMouseDown={handleResizeStart}
            className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/20 z-20"
            style={{ right: 0 }}
          />
        )}
        {!isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            aria-label="Hide sidebar"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center z-30 bg-secondary hover:bg-secondary/90 transition-colors"
            style={{ color: "var(--tertiary)" }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {isSidebarCollapsed && (
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed(false)}
          aria-label="Show sidebar"
          className="fixed left-0 top-1/2 -translate-y-1/2 w-6 h-12 rounded-r-lg flex items-center justify-center z-40 shadow-md bg-secondary hover:bg-secondary/90 transition-colors"
          style={{ color: "var(--tertiary)" }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Main content area */}
      <main
        className={`flex-1 min-h-screen mt-12 py-10 transition-all duration-200 px-10`}
        style={{ marginLeft: isSidebarCollapsed ? 0 : sidebarWidth }}
      >
        {selectedPatient ? (
          <PatientProfile
            patient={selectedPatient}
            onBack={() => setSelectedPatient(null)}
          />
        ) : (
          <>
            <SearchBar value={searchQuery} onChange={setSearchQuery} />

            <h2 className="text-2xl font-bold mb-6" style={{ color: "var(--tertiary)" }}>
              Your Patients
            </h2>

            <PatientCards patients={filteredPatients} onSelect={setSelectedPatient} />
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
