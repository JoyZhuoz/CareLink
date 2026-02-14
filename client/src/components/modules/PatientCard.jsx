import React, { useState, useEffect } from "react";

function formatCountdown(isoDate) {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h`;
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const PatientCard = ({ patient, onSelect }) => {
  const [calling, setCalling] = useState(false);
  const [callStatus, setCallStatus] = useState(null); // "success" | "error" | null
  const [liveCountdown, setLiveCountdown] = useState("");

  const nextCallDate = patient.nextCallDate || patient.next_call_date;
  useEffect(() => {
    if (!nextCallDate) {
      setLiveCountdown("Scheduled");
      return;
    }
    const tick = () => setLiveCountdown(formatCountdown(nextCallDate));
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [nextCallDate]);

  const countdown = liveCountdown || (nextCallDate ? formatCountdown(nextCallDate) : "Scheduled");

  const handleCallNow = async (e) => {
    e.stopPropagation();
    if (!patient.patient_id || calling) return;
    setCalling(true);
    setCallStatus(null);
    try {
      const res = await fetch(`/api/twilio/call/${patient.patient_id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setCallStatus("success");
      else setCallStatus("error");
    } catch {
      setCallStatus("error");
    } finally {
      setCalling(false);
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency?.toLowerCase()) {
      case "urgent":
        return "bg-[#EB5757]";
      case "minimal":
        return "bg-green-500";
      case "monitor":
        return "bg-yellow-400 hover:bg-yellow-500";
      default:
        return "bg-gray-500 hover:bg-gray-600";
    }
  };

  const isOverdue = countdown === "Overdue";
  const isPastDue = isOverdue; // system will auto-call; show "Scheduled" not "Overdue"

  return (
    <div
      className="bg-secondary-50 shadow-md rounded-corners p-8 transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-lg"
      onClick={() => onSelect && onSelect(patient)}
    >
      {/* Patient Avatar */}
      <div className="flex justify-center mb-6">
        <img
          src={patient.avatar}
          alt={patient.name}
          className="w-32 h-32 rounded-full object-cover shadow-lg"
        />
      </div>

      {/* Patient Name + urgency dot, then date underneath */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-2xl font-bold text-gray-900">{patient.name}</h3>
          <span
            className={`inline-block w-3 h-3 rounded-full shrink-0 ${getUrgencyColor(patient.urgency)}`}
            title={patient.urgency || "Urgency"}
            aria-hidden
          />
        </div>
        {patient.dischargeDate && (
          <p className="text-gray-700 font-medium mt-1">{patient.dischargeDate}</p>
        )}
      </div>

      {/* Two-column: Operation and Recent Symptoms */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="font-bold text-gray-900 text-xl mb-1">Operation</h4>
          <p className="text-gray-800 text-xl">{patient.operation}</p>
        </div>
        <div>
          <h4 className="font-bold text-gray-900 text-xl mb-1">Recent Symptoms</h4>
          <p className="text-gray-800 text-xl">
            {Array.isArray(patient.symptoms) ? patient.symptoms.join(", ") : patient.symptoms}
          </p>
        </div>
      </div>

      {/* AI Summary (only after a call) */}
      {patient.aiSummary && (
        <div className="mb-8">
          <h4 className="font-bold text-gray-900 text-xl mb-1.5">AI Summary</h4>
          <p className="text-gray-800 text-xl leading-relaxed">{patient.aiSummary}</p>
        </div>
      )}

      {/* Action area: "Call complete!" tag OR countdown */}
      <div className="flex gap-4 justify-center items-center flex-wrap">
        {patient.hasBeenCalled ? (
          <span className="inline-flex items-center gap-1.5 font-semibold py-2 px-4 rounded-lg bg-green-100 text-green-800 border border-green-300">
            <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden />
            Call complete!
          </span>
        ) : (
          /* ── Not yet called → show countdown to scheduled call ── */
          <div
            className={`flex items-center gap-2 font-bold py-3 px-6 rounded-xl text-white ${
              isPastDue ? "bg-indigo-500" : "bg-blue-500"
            }`}
          >
            {/* Clock icon */}
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
              />
            </svg>
            <span>{countdown === "Scheduled" || countdown === "Overdue" ? "Scheduled" : `Call in ${countdown}`}</span>
          </div>
        )}
        <button
          onClick={handleCallNow}
          disabled={calling}
          className={`flex items-center gap-2 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 ${
            callStatus === "success"
              ? "bg-green-600"
              : callStatus === "error"
                ? "bg-red-500"
                : "bg-[#55454F] hover:bg-[#453840]"
          } ${calling ? "opacity-60 cursor-wait" : ""}`}
        >
          {/* Phone icon */}
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          {calling
            ? "Calling..."
            : callStatus === "success"
              ? "Call Started"
              : callStatus === "error"
                ? "Failed"
                : "Call Now"}
        </button>
      </div>
    </div>
  );
};

export default PatientCard;
