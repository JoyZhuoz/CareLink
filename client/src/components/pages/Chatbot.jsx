import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { patientToUI } from "../utils/patientUtils";
import "./Home.css";

/* ── Escape string for use in RegExp ── */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ── Preprocess markdown: auto-bold patient names (with optional pt- prefix) ── */

function highlightPatientNames(text, nameLookup) {
  if (!text || nameLookup.size === 0) return text;

  // Collect full names only
  const fullNames = [];
  for (const [, patient] of nameLookup.entries()) {
    if (patient.name) fullNames.push(patient.name);
  }
  const unique = [...new Set(fullNames)];
  unique.sort((a, b) => b.length - a.length);

  let result = text;
  for (const name of unique) {
    // Match "pt-first-last" hyphenated ID form (e.g. pt-steven-jobs)
    const hyphenated = name.toLowerCase().replace(/\s+/g, "-");
    const ptPattern = new RegExp(
      `(?<!\\*\\*)\\b(pt-${escapeRegex(hyphenated)})\\b(?!\\*\\*)`,
      "gi"
    );
    result = result.replace(ptPattern, "**$1**");

    // Match plain full name, not already bolded
    const namePattern = new RegExp(
      `(?<!\\*\\*)(\\b${escapeRegex(name)}\\b)(?!\\*\\*)`,
      "gi"
    );
    result = result.replace(namePattern, "**$1**");
  }
  return result;
}

/* ── Action detection ── */

function detectActions(text, patientsMap) {
  if (!text || !patientsMap || patientsMap.size === 0) return [];

  const lower = text.toLowerCase();
  const seen = new Set(); // deduplicate by patient_id
  const results = [];

  for (const [key, patient] of patientsMap.entries()) {
    if (seen.has(patient.patient_id)) continue;
    // Only match on full names (2+ words) to avoid false positives on last-name-only keys
    const isFullName = key.includes(" ");
    if (!isFullName) continue;
    if (!lower.includes(key)) continue;

    seen.add(patient.patient_id);
    results.push({ patient, actions: ["schedule_followup", "monitor_closely"] });
  }
  return results;
}

/* ── Patient hover card ── */

function PatientHoverCard({ patient, position }) {
  if (!patient) return null;
  const urgencyClass = (patient.urgency || "Minimal").toLowerCase();

  return (
    <div
      className="patient-hover-card"
      style={{ top: position.top, left: position.left }}
    >
      <div className="phc-header">
        <img className="phc-avatar" src={patient.avatar} alt={patient.name} />
        <div className="phc-header-info">
          <div className="phc-name">{patient.name}</div>
          <span className={`phc-urgency phc-urgency--${urgencyClass}`}>
            {patient.urgency}
          </span>
        </div>
      </div>
      <div className="phc-details">
        {patient.operation && (
          <div className="phc-row">
            <span className="phc-label">Surgery</span>
            <span className="phc-value">{patient.operation}</span>
          </div>
        )}
        {(patient.age || patient.sex) && (
          <div className="phc-row">
            <span className="phc-label">Age / Sex</span>
            <span className="phc-value">
              {patient.age ? `${patient.age}y` : ""}
              {patient.age && patient.sex ? " / " : ""}
              {patient.sex || ""}
            </span>
          </div>
        )}
        {patient.dischargeDate && (
          <div className="phc-row">
            <span className="phc-label">Discharged</span>
            <span className="phc-value">{patient.dischargeDate}</span>
          </div>
        )}
        {patient.riskFactors && patient.riskFactors.length > 0 && (
          <div className="phc-row">
            <span className="phc-label">Risk factors</span>
            <span className="phc-value">{patient.riskFactors.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Single action button ── */

function ActionButton({ label, onClick }) {
  const [status, setStatus] = useState("idle");

  const handleClick = async () => {
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    try {
      await onClick();
      setStatus("success");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  const text =
    status === "loading"
      ? "Updating..."
      : status === "success"
        ? "Done!"
        : status === "error"
          ? "Failed"
          : label;

  return (
    <button
      className={`chat-action-btn chat-action-btn--${status}`}
      onClick={handleClick}
      disabled={status === "loading" || status === "success"}
    >
      {text}
    </button>
  );
}

/* ── Follow-up presets ── */

function FollowupPresets({ patientId }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle");

  const schedule = async () => {
    setStatus("loading");
    await new Promise((r) => setTimeout(r, 500));
    setStatus("success");
  };

  if (status === "success")
    return <span className="chat-action-btn chat-action-btn--success">Scheduled!</span>;
  if (status === "loading")
    return <span className="chat-action-btn chat-action-btn--loading">Updating...</span>;
  if (status === "error")
    return <span className="chat-action-btn chat-action-btn--error">Failed</span>;

  if (!open) {
    return (
      <button className="chat-action-btn" onClick={() => setOpen(true)}>
        Schedule earlier follow-up
      </button>
    );
  }

  return (
    <div className="chat-action-presets">
      <span className="chat-action-presets-label">Follow-up in:</span>
      {[
        { label: "Tomorrow", days: 1 },
        { label: "2 days", days: 2 },
        { label: "1 week", days: 7 },
      ].map((opt) => (
        <button
          key={opt.days}
          className="chat-action-btn chat-action-btn--preset"
          onClick={() => schedule(opt.days)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Recursively extract plain text from React children ── */

function extractText(children) {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && children.props && children.props.children)
    return extractText(children.props.children);
  return "";
}

/* ── Main chatbot ── */

const Chatbot = () => {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [nameLookup, setNameLookup] = useState(new Map());
  const [hoverPatient, setHoverPatient] = useState(null);
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch patients on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/patients/all");
        const data = await res.json();
        if (res.ok && data.patients) {
          const uiPatients = data.patients.map(patientToUI);

          const lookup = new Map();
          for (const p of uiPatients) {
            const full = p.name.toLowerCase();
            lookup.set(full, p);
            // "pt-steven-jobs" style key
            lookup.set("pt-" + full.replace(/\s+/g, "-"), p);
            const parts = p.name.trim().split(/\s+/);
            if (parts.length > 1) {
              lookup.set(parts[parts.length - 1].toLowerCase(), p);
            }
          }
          setNameLookup(lookup);
        }
      } catch {
        // Silently fail — chatbot still works without patient data
      }
    })();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const text = query.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setQuery("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversation_id: conversationId }),
      });
      const data = await res.json();
      if (res.ok) {
        setConversationId(data.conversation_id);
        const detectedActions = detectActions(data.response, nameLookup).slice(0, 5);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response, detectedActions },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "error", content: data.error }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: "Failed to connect to server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Enter key on input — explicitly submit even if button is disabled
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && query.trim() && !loading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (text) => {
    setQuery(text);
    inputRef.current?.focus();
  };

  // Hover handlers
  const handleNameEnter = useCallback((e, patient) => {
    const rect = e.target.getBoundingClientRect();
    setHoverPos({ top: rect.bottom + 8, left: rect.left });
    setHoverPatient(patient);
  }, []);

  const handleNameLeave = useCallback(() => {
    setHoverPatient(null);
  }, []);

  // Custom markdown renderers — stable reference via useMemo
  const markdownComponents = useMemo(
    () => ({
      strong: ({ children }) => {
        const raw = extractText(children).trim();
        const lower = raw.toLowerCase();
        // Try direct lookup (handles "pt-steven-jobs" and "Steven Jobs")
        // Then try converting "pt-steven-jobs" → "steven jobs" for name lookup
        const ptToName = lower.startsWith("pt-")
          ? lower.slice(3).replace(/-/g, " ")
          : null;
        const patient =
          nameLookup.get(lower) ||
          (ptToName && nameLookup.get(ptToName));
        if (patient) {
          return (
            <strong
              className="patient-name-link"
              onMouseEnter={(e) => handleNameEnter(e, patient)}
              onMouseLeave={handleNameLeave}
            >
              {patient.name}
            </strong>
          );
        }
        return <strong>{children}</strong>;
      },
    }),
    [nameLookup, handleNameEnter, handleNameLeave]
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="home-container">
      {!hasMessages && (
        <div className="home-hero-wrap">
          <div className="home-hero">
            <h1 className="home-title">CareLink</h1>
            <p className="home-subtitle">
              Ask about patients, symptoms, recovery, and care plans
            </p>
          </div>
        </div>
      )}

      {hasMessages && (
        <div className="home-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`home-msg home-msg--${msg.role}`}>
              {msg.role === "assistant" && (
                <div className="home-msg-label">CareLink</div>
              )}
              <div className={`home-msg-bubble home-msg-bubble--${msg.role}`}>
                {msg.role === "assistant" ? (
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {highlightPatientNames(msg.content, nameLookup)}
                  </Markdown>
                ) : (
                  msg.content
                )}
              </div>

              {/* Action buttons */}
              {msg.detectedActions && msg.detectedActions.length > 0 && (
                <div className="chat-actions">
                  {msg.detectedActions.map((da, idx) => (
                    <div key={idx} className="chat-actions-group">
                      <span className="chat-actions-patient">{da.patient.name}</span>
                      <div className="chat-actions-buttons">
                        {da.actions.includes("schedule_followup") && (
                          <FollowupPresets patientId={da.patient.patient_id} />
                        )}
                        {da.actions.includes("mark_healthy") && (
                          <ActionButton
                            label="Mark as healthy"
                            onClick={async () => {
                              await new Promise((r) => setTimeout(r, 500));
                            }}
                          />
                        )}
                        {da.actions.includes("monitor_closely") && (
                          <ActionButton
                            label="Monitor closely"
                            onClick={async () => {
                              await new Promise((r) => setTimeout(r, 500));
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="home-msg home-msg--assistant">
              <div className="home-msg-label">CareLink</div>
              <div className="home-msg-bubble home-msg-bubble--assistant">
                <span className="home-typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Hover card */}
      {hoverPatient && (
        <PatientHoverCard patient={hoverPatient} position={hoverPos} />
      )}

      <div className="home-input-area">
        <form onSubmit={handleSubmit} className="home-form">
          <div className="home-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="home-input"
              placeholder="Ask about a patient..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              type="submit"
              className="home-submit"
              disabled={!query.trim() || loading}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </form>

        {!hasMessages && (
          <div className="home-suggestions">
            {["Post-op patients", "Urgent cases", "Analyze population-level trend"].map((s) => (
              <button
                key={s}
                className="home-suggestion-chip"
                onClick={() => handleSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Chatbot;
