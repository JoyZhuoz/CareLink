import React, { useState } from "react";

const CallTranscript = ({ call, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const fields = call.fields || {};
  const hasDirectTranscript = Array.isArray(call.transcript) && call.transcript.length > 0;
  const speakers = hasDirectTranscript
    ? call.transcript.map((m) => m.speaker)
    : (fields["transcript.speaker"] || []);
  const texts = hasDirectTranscript
    ? call.transcript.map((m) => m.text)
    : (fields["transcript.text"] || []);
  const timestamps = hasDirectTranscript
    ? call.transcript.map((m) => m.timestamp)
    : (fields["transcript.timestamp"] || []);
  const callDateRaw = call.call_date || (fields.call_date && fields.call_date[0]);
  const reasoningSummary = call.reasoning_summary || (fields.reasoning_summary && fields.reasoning_summary[0]);
  const recommendedAction = call.recommended_action || (fields.recommended_action && fields.recommended_action[0]);
  const triageLevel = call.triage_level || (fields.triage_level && fields.triage_level[0]);

  const callDate = callDateRaw
    ? new Date(callDateRaw).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
    : "Unknown date";

  const callTime = callDateRaw
    ? new Date(callDateRaw).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  const triageColor = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
  }[triageLevel] || "bg-gray-100 text-gray-700";

  const triageLabel = {
    green: "Minimal",
    yellow: "Monitor",
    red: "Urgent",
  }[triageLevel] || "Unknown";

  // Build message pairs from parallel arrays
  const messages = speakers.map((speaker, i) => ({
    speaker,
    text: texts[i] || "",
    timestamp: timestamps[i] || "",
  }));

  const formatMsgTime = (ts) => {
    if (!ts) return null;
    try {
      return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch {
      return null;
    }
  };

  return (
    <div className="bg-secondary-50 rounded-2xl overflow-hidden transition-all duration-200">
      {/* Header: date, time, triage — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-secondary/40 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold" style={{ color: "var(--tertiary)" }}>
            Call — {callDate}
          </h3>
          {callTime && <span className="text-sm text-gray-500">{callTime}</span>}
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${triageColor}`}>
            {triageLabel}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6">
          <div className="border-t border-gray-200 pt-5 mb-5">
            <h4 className="text-sm font-bold text-gray-600 mb-4">Call transcript</h4>
            <div className="space-y-4">
              {messages.length === 0 ? (
                <p className="text-gray-500 text-sm">No transcript for this call.</p>
              ) : (
                messages.map((msg, i) => {
                  const isAI = msg.speaker === "ai";
                  const label = isAI ? "CareLink" : "Patient";
                  const timeStr = formatMsgTime(msg.timestamp);
                  return (
                    <div
                      key={i}
                      className={`flex ${isAI ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                          isAI ? "rounded-tl-sm bg-white" : "rounded-tr-sm text-white"
                        }`}
                        style={
                          isAI
                            ? { color: "var(--tertiary)" }
                            : { backgroundColor: "var(--tertiary)", color: "white" }
                        }
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          {isAI && (
                            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: "var(--primary)" }}>
                              <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                            </svg>
                          )}
                          <span className={`text-xs font-semibold ${isAI ? "" : "text-white/90"}`} style={isAI ? { color: "var(--primary)" } : {}}>
                            {label}
                          </span>
                          {timeStr && <span className="text-xs text-gray-400">{timeStr}</span>}
                        </div>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {(reasoningSummary || recommendedAction) && (
            <div className="bg-white rounded-xl p-4 space-y-3 mt-4">
              {reasoningSummary && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Summary</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{reasoningSummary}</p>
                </div>
              )}
              {recommendedAction && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Recommended Action</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{recommendedAction}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallTranscript;
