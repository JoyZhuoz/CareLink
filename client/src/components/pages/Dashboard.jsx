import React, { useState } from "react";
import PatientCard from "../modules/PatientCard";
import TabSwitcher from "../modules/TabSwitcher";
import NavBar from "../modules/NavBar";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('patients');

  // Sample patient data - matching the design from the image
  const patientsData = [
    {
      id: 1,
      name: "Jane Doe",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
      operation: "Appendectomy",
      symptoms: "Fever, Swelling",
      dischargeDate: "Jan 05, 2026",
      urgency: "Urgent",
      aiSummary: "Patient reports worsening pain over the past week, which could be indicative of infection. Recommend immediate medical action via hospital visit.",
    },
    {
      id: 2,
      name: "Jane Doe",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
      operation: "Appendectomy",
      symptoms: "Fever, Swelling",
      dischargeDate: "Jan 05, 2026",
      urgency: "Urgent",
      aiSummary: "Patient reports worsening pain over the past week, which could be indicative of infection. Recommend immediate medical action via hospital visit.",
    },
    {
      id: 3,
      name: "Jane Doe",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
      operation: "Appendectomy",
      symptoms: "Fever, Swelling",
      dischargeDate: "Jan 05, 2026",
      urgency: "Urgent",
      aiSummary: "Patient reports worsening pain over the past week, which could be indicative of infection. Recommend immediate medical action via hospital visit.",
    },
  ];

  return (
    <div className="min-h-screen bg-primary p-4 sm:p-6 md:p-10">
      <div className="mx-10 mx-auto">
        <NavBar />

        <div className="mt-10">
          <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'patients' ? (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 drop-shadow">
                Your Patients
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8 lg:gap-12">
                {patientsData.map((patient) => (
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
              <p className="text-gray-700 text-lg">This feature is not yet implemented.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
