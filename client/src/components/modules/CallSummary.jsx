import React from "react";
import CallTranscript from "./CallTranscript";

const CallSummary = ({ patient, onBack }) => {
  const callHistory = patient.call_history || [];

  // Sort calls by date descending (most recent first)
  const sortedCalls = [...callHistory].sort((a, b) => {
    const dateA = a.fields?.call_date?.[0] || "";
    const dateB = b.fields?.call_date?.[0] || "";
    return new Date(dateB) - new Date(dateA);
  });

  return (
    <div>
      {/* Back Arrow */}
      <button
        onClick={onBack}
        className="mb-6 hover:opacity-70 transition-opacity"
        style={{ color: "var(--tertiary)" }}
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7 7m-7-7l7-7" />
        </svg>
      </button>

      {/* Patient Header */}
      <div className="flex items-center gap-4 mb-8">
        <img
          src={patient.avatar}
          alt={patient.name}
          className="w-16 h-16 rounded-full object-cover shadow-md"
        />
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold" style={{ color: "var(--tertiary)" }}>
            {patient.name}
          </h2>
          <span
            className={`text-white text-xs font-bold px-3 py-1 rounded-full ${
              patient.urgency === "Urgent"
                ? "bg-[#EB5757]"
                : patient.urgency === "Monitor"
                ? "bg-yellow-400"
                : "bg-green-500"
            }`}
          >
            {patient.urgency}
          </span>
        </div>
      </div>

      {/* Call Transcripts */}
      {sortedCalls.length > 0 ? (
        <div className="space-y-4">
          {sortedCalls.map((call, i) => (
            <CallTranscript key={call._id || i} call={call} />
          ))}
        </div>
      ) : (
        <div className="bg-secondary-50 rounded-2xl p-12 text-center">
          <p className="text-lg text-gray-500">No call history available for this patient.</p>
        </div>
      )}
    </div>
  );
};

export default CallSummary;
