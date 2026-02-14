import React, { useState } from "react";

const PatientProfile = ({ patient, onBack, onViewSummary, onContact }) => {
  const [callStatus, setCallStatus] = useState(null); // "loading" | "success" | "error"
  const [callError, setCallError] = useState("");

  const handleContact = async () => {
    if (onContact) {
      setCallStatus("loading");
      setCallError("");
      try {
        await onContact(patient);
        setCallStatus("success");
      } catch (err) {
        setCallStatus("error");
        setCallError(err.message || "Failed to initiate call");
      }
    }
  };
  const getUrgencyColor = (urgency) => {
    switch (urgency.toLowerCase()) {
      case "urgent":
        return "bg-[#EB5757]";
      case "minimal":
        return "bg-green-500";
      case "monitor":
        return "bg-yellow-400";
      default:
        return "bg-gray-500";
    }
  };

  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  return (
    <div>
      {/* Back Arrow */}
      <button
        onClick={onBack}
        className="mb-8 hover:opacity-70 transition-opacity"
        style={{ color: "var(--tertiary)" }}
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7 7m-7-7l7-7" />
        </svg>
      </button>

      {/* Profile Content */}
      <div className="max-w-3xl mx-auto">
        {/* Avatar */}
        <div className="flex justify-center mb-6">
          <img
            src={patient.avatar}
            alt={patient.name}
            className="w-40 h-40 rounded-full object-cover shadow-lg"
          />
        </div>

        {/* Name + Urgency Badge */}
        <div className="flex items-center justify-center gap-3 mb-1">
          <h2 className="text-3xl font-bold" style={{ color: "var(--tertiary)" }}>
            {patient.name}
          </h2>
          <span
            className={`${getUrgencyColor(patient.urgency)} text-white text-sm font-bold px-4 py-1 rounded-full`}
          >
            {patient.urgency}
          </span>
        </div>

        {/* Discharge Date */}
        <p className="text-center text-gray-600 mb-10">
          Discharged {patient.dischargeDate}
        </p>

        {/* Operation / Age / Sex row */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div>
            <h4 className="font-bold text-lg mb-1" style={{ color: "var(--tertiary)" }}>
              Operation
            </h4>
            <p className="text-gray-700">{patient.operation}</p>
          </div>
          <div>
            <h4 className="font-bold text-lg mb-1" style={{ color: "var(--tertiary)" }}>
              Age
            </h4>
            <p className="text-gray-700">{patient.age} years old</p>
          </div>
          <div>
            <h4 className="font-bold text-lg mb-1" style={{ color: "var(--tertiary)" }}>
              Sex
            </h4>
            <p className="text-gray-700">{patient.sex}</p>
          </div>
        </div>

        {/* Risk Factors */}
        <div className="mb-8">
          <h4 className="font-bold text-lg mb-2" style={{ color: "var(--tertiary)" }}>
            Risk Factors
          </h4>
          <div className="flex flex-wrap gap-2">
            {patient.riskFactors && patient.riskFactors.length > 0 ? (
              patient.riskFactors.map((factor, i) => (
                <span
                  key={i}
                  className="bg-tertiary text-white text-sm font-medium px-4 py-1.5 rounded-full"
                >
                  {factor}
                </span>
              ))
            ) : (
              <span className="text-gray-500 italic">None</span>
            )}
          </div>
        </div>

        {/* Recent Symptoms */}
        <div className="mb-8">
          <h4 className="font-bold text-lg mb-2" style={{ color: "var(--tertiary)" }}>
            Recent Symptoms -{" "}
            <span className="font-normal text-gray-600">as of {today}</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {patient.symptoms.map((symptom, i) => (
              <span
                key={i}
                className="text-sm font-medium px-4 py-1.5 rounded-full"
                style={{ backgroundColor: "var(--primary)", color: "white" }}
              >
                {symptom}
              </span>
            ))}
          </div>
        </div>

        {/* AI Summary */}
        {patient.aiSummary && (
          <div className="mb-10">
            <h4 className="font-bold text-lg mb-2" style={{ color: "var(--tertiary)" }}>
              AI Summary
            </h4>
            <p className="text-gray-700 leading-relaxed">{patient.aiSummary}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-center gap-6">
          <button
            onClick={() => onViewSummary && onViewSummary(patient)}
            className="text-white font-bold py-3 px-10 rounded-xl transition-all duration-200 hover:opacity-90"
            style={{ backgroundColor: "var(--primary)" }}
          >
            Summary
          </button>
          <button
            onClick={handleContact}
            disabled={callStatus === "loading"}
            className="bg-tertiary text-white font-bold py-3 px-10 rounded-xl transition-all duration-200 disabled:opacity-60"
          >
            {callStatus === "loading" ? "Calling..." : "Contact"}
          </button>
        </div>

        {callStatus === "success" && (
          <p className="text-center text-green-600 font-medium mt-4">
            Call initiated successfully!
          </p>
        )}
        {callStatus === "error" && (
          <p className="text-center text-red-500 font-medium mt-4">
            {callError}
          </p>
        )}
      </div>
    </div>
  );
};

export default PatientProfile;
