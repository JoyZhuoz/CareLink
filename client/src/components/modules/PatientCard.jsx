import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

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

const PatientCard = ({ patient, onSelect, index = 0 }) => {
  // const [calling, setCalling] = useState(false);
  // const [callStatus, setCallStatus] = useState(null); // "success" | "error" | null
  const [liveCountdown, setLiveCountdown] = useState("");
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSendError, setEmailSendError] = useState(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

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

  const formatDate = (date) => {
    // format date from Feb, 14, 2026 to 2/14/2026
    return new Date(date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  };

  const countdown = liveCountdown || (nextCallDate ? formatCountdown(nextCallDate) : "Scheduled");

  const handleOpenEmail = (e) => {
    e.stopPropagation();
    setEmailSubject("");
    setEmailBody("");
    setEmailSendError(null);
    setShowEmailPopup(true);
  };

  const handleCloseEmailPopup = (e) => {
    if (e) e.stopPropagation();
    setShowEmailPopup(false);
    setEmailSendError(null);
  };

  const handleSendEmail = async (e) => {
    e.stopPropagation();
    setEmailSendError(null);
    setEmailSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "margo.joe708@gmail.com",
          subject: emailSubject,
          text: emailBody,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShowEmailPopup(false);
      } else {
        setEmailSendError(data.error || `Failed to send (${res.status})`);
      }
    } catch (err) {
      setEmailSendError(err.message || "Network error");
    } finally {
      setEmailSending(false);
    }
  };

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
      className="bg-secondary-50 rounded-2xl shadow-md transition-all duration-300 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 flex flex-col h-full min-h-0 overflow-hidden animate-card-enter"
      style={{ animationDelay: `${index * 70}ms` }}
      onClick={() => onSelect && onSelect(patient)}
    >
      <div className="flex-1 min-h-0 flex flex-col p-6">
        {/* avatar + name, urgency, date — stock photo with initials fallback on load error */}
        <div className="flex items-start gap-4 mb-5">
          <img
            src={avatarFailed && patient.avatarFallback ? patient.avatarFallback : patient.avatar}
            alt=""
            className="w-14 h-14 rounded-xl object-cover shadow shrink-0"
            onError={() => setAvatarFailed(true)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold truncate" style={{ color: "var(--tertiary)" }}>
                {patient.name}
              </h3>
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${getUrgencyColor(patient.urgency)}`}
                title={patient.urgency || "Urgency"}
                aria-hidden
              />
            </div>
            {patient.dischargeDate && (
              <p className="text-sm mt-0.5 opacity-80" style={{ color: "var(--tertiary)" }}>
                Discharged {formatDate(patient.dischargeDate)}
              </p>
            )}
            {patient.hasBeenCalled && patient.conditionChange && patient.conditionChange !== "first_call" && (
              <span
                className={`inline-block text-xs font-medium mt-1.5 px-2 py-0.5 rounded-md ${
                  patient.conditionChange === "escalation"
                    ? "bg-red-100 text-red-700"
                    : patient.conditionChange === "recovery"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                }`}
              >
                {patient.conditionChange === "escalation" ? "↑ Escalation" : patient.conditionChange === "recovery" ? "↓ Recovery" : "→ Stable"}
              </span>
            )}
          </div>
        </div>

        {/* Operation, symptoms, contact — same section pattern */}
        <div className="space-y-3 mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-0.5" style={{ color: "var(--tertiary)" }}>
              Operation
            </p>
            <p className="text-sm font-medium" style={{ color: "var(--tertiary)" }}>
              {patient.operation}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-0.5" style={{ color: "var(--tertiary)" }}>
              Recent symptoms
            </p>
            <p className="text-sm" style={{ color: "var(--tertiary)" }}>
              {Array.isArray(patient.symptoms) ? patient.symptoms.join(", ") : patient.symptoms}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-0.5" style={{ color: "var(--tertiary)" }}>
              Contact
            </p>
            <div className="flex flex-col gap-1.5">
              {patient.phone && (
                <a
                  href={`tel:${patient.phone.replace(/\D/g, "")}`}
                  className="inline-flex items-center gap-2 text-sm font-medium underline decoration-[var(--primary)] decoration-2 underline-offset-2 transition-colors hover:opacity-80"
                  style={{ color: "var(--primary)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-4 h-4 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {patient.phone}
                </a>
              )}
              {patient.email && (
                <a
                  href={`mailto:${patient.email}`}
                  className="inline-flex items-center gap-2 text-sm font-medium underline decoration-[var(--primary)] decoration-2 underline-offset-2 transition-colors hover:opacity-80"
                  style={{ color: "var(--primary)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-4 h-4 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {patient.email}
                </a>
              )}
              {!patient.phone && !patient.email && (
                <span className="text-sm opacity-70" style={{ color: "var(--tertiary)" }}>
                  No contact info
                </span>
              )}
            </div>
          </div>
        </div>

        {patient.aiSummary && (
          <div className="mt-auto pt-4 border-t border-[color:color-mix(in_srgb,var(--tertiary)_15%,transparent)]">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1" style={{ color: "var(--tertiary)" }}>
              AI summary
            </p>
            <p className="text-sm leading-snug line-clamp-3 opacity-90" style={{ color: "var(--tertiary)" }}>
              {patient.aiSummary}
            </p>
          </div>
        )}
      </div>

      {/* status + buttons */}
      <div className="flex gap-2 justify-center items-center flex-wrap p-4 pt-3 bg-[color:color-mix(in_srgb,var(--tertiary)_06%,transparent)]">
        {patient.hasBeenCalled ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold py-2 px-3 rounded-lg bg-green-100 text-green-800">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden />
            Call complete
          </span>
        ) : (
          <div
            className={`flex items-center gap-1.5 text-sm font-semibold py-2 px-4 rounded-lg text-white ${
              isPastDue ? "bg-indigo-500" : "bg-blue-500"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            <span>{countdown === "Scheduled" || countdown === "Overdue" ? "Scheduled" : `Call in ${countdown}`}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleOpenEmail}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-white transition-all duration-200 hover:opacity-90"
          style={{ backgroundColor: "var(--tertiary)" }}
          aria-label="Send email"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>

        {/* <button
          type="button"
          onClick={handleCallNow}
          disabled={calling}
          className={`flex items-center justify-center gap-1.5 min-w-[2.5rem] h-10 px-3 rounded-lg text-white text-sm font-semibold transition-all duration-200 ${
            callStatus === "success"
              ? "bg-green-600"
              : callStatus === "error"
                ? "bg-red-500"
                : "bg-tertiary hover:opacity-90"
          } ${calling ? "opacity-60 cursor-wait" : ""}`}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {calling ? "Calling..." : callStatus === "success" ? "Call Started" : callStatus === "error" ? "Failed" : ""}
        </button> */}
      </div>

      {/* Email popup — portaled to body so it covers the whole dashboard */}
      {showEmailPopup &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
            onClick={handleCloseEmailPopup}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-popup-title"
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="email-popup-title" className="text-xl font-bold text-gray-900">
                Email {patient.name}
              </h2>
              <div>
                <label htmlFor="email-subject" className="block text-sm font-medium text-gray-700 mb-1">
                  Subject
                </label>
                <input
                  id="email-subject"
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label htmlFor="email-body" className="block text-sm font-medium text-gray-700 mb-1">
                  Body
                </label>
                <textarea
                  id="email-body"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Email body"
                  rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {emailSendError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {emailSendError}
                </p>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={handleCloseEmailPopup}
                  disabled={emailSending}
                  className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={emailSending}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                >
                  {emailSending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default PatientCard;
