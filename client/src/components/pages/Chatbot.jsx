import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./Home.css";

const PATIENT_AVATARS = {
  "1001": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
  "1002": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
  "1003": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
  "1004": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
  "1005": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
  "1006": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop",
};

/** Compact hover card shown when mousing over a patient name */
const PatientHoverCard = ({ patient, style }) => {
  if (!patient) return null;
  const avatar = PATIENT_AVATARS[patient.patient_id];
  const urgencyColor =
    patient.urgency === "Urgent" ? "#EB5757" :
    patient.urgency === "Monitor" ? "#EAB308" : "#22C55E";

  return (
    <div className="patient-hover-card" style={style}>
      <div className="phc-header">
        {avatar && <img src={avatar} alt={patient.name} className="phc-avatar" />}
        <div>
          <div className="phc-name">{patient.name}</div>
          <span className="phc-urgency" style={{ background: urgencyColor }}>
            {patient.urgency}
          </span>
        </div>
      </div>
      <div className="phc-details">
        <div className="phc-row"><span className="phc-label">Operation</span><span>{patient.operation}</span></div>
        <div className="phc-row"><span className="phc-label">Age / Sex</span><span>{patient.age} / {patient.sex}</span></div>
        <div className="phc-row"><span className="phc-label">Discharged</span><span>{patient.dischargeDate}</span></div>
        {patient.riskFactors && patient.riskFactors.length > 0 && (
          <div className="phc-row">
            <span className="phc-label">Risk Factors</span>
            <span>{patient.riskFactors.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/** Animated thinking steps shown while the agent processes */
const ThinkingSteps = ({ steps }) => {
  if (steps.length === 0) return null;
  return (
    <div className="thinking-steps">
      {steps.map((step, i) => (
        <div key={step.id + i} className={`thinking-step thinking-step--${step.status}`}>
          <span className="thinking-step-icon">
            {step.status === "done" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <span className="thinking-spinner" />
            )}
          </span>
          <span className="thinking-step-label">{step.label}</span>
          {step.detail && <span className="thinking-step-detail">{step.detail}</span>}
        </div>
      ))}
    </div>
  );
};

const TRIAGE_TO_URGENCY = { green: "Minimal", yellow: "Monitor", red: "Urgent" };

function formatDischargeDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate.replace("T00:00:00.000Z", ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function rawToUI(raw) {
  const latestCall = raw.call_history && raw.call_history[0];
  const fields = latestCall && latestCall.fields ? latestCall.fields : {};
  const triage = (fields.triage_level && fields.triage_level[0]) || "green";
  return {
    patient_id: raw.patient_id,
    name: raw.name,
    phone: raw.phone,
    operation: raw.surgery_type,
    dischargeDate: formatDischargeDate(raw.discharge_date),
    urgency: TRIAGE_TO_URGENCY[triage] || "Minimal",
    age: raw.age,
    sex: raw.gender,
    riskFactors: (raw.risk_factors || []).map((f) => f.charAt(0).toUpperCase() + f.slice(1)),
  };
}

const MOCK_PATIENTS = [
  { patient_id: "1001", name: "John Smith", phone: "+14155551234", age: 45, gender: "Male", surgery_type: "ACL reconstruction", discharge_date: "2026-02-15", risk_factors: ["diabetes", "obesity"], call_history: [] },
  { patient_id: "1002", name: "Maria Gonzalez", phone: "+14155552345", age: 62, gender: "Female", surgery_type: "Total knee replacement", discharge_date: "2026-02-12", risk_factors: ["hypertension"], call_history: [] },
  { patient_id: "1003", name: "David Chen", phone: "+14155553456", age: 38, gender: "Male", surgery_type: "Appendectomy", discharge_date: "2026-02-16", risk_factors: [], call_history: [] },
  { patient_id: "1004", name: "Aisha Patel", phone: "+14155554567", age: 55, gender: "Female", surgery_type: "Hysterectomy", discharge_date: "2026-02-14", risk_factors: ["anemia", "smoking"], call_history: [] },
  { patient_id: "1005", name: "Michael Brown", phone: "+14155555678", age: 70, gender: "Male", surgery_type: "Coronary artery bypass", discharge_date: "2026-02-10", risk_factors: ["heart disease", "diabetes", "hypertension"], call_history: [] },
  { patient_id: "1006", name: "Samantha Lee", phone: "+14155556789", age: 29, gender: "Female", surgery_type: "Gallbladder removal", discharge_date: "2026-02-18", risk_factors: ["obesity"], call_history: [] },
];

function extractMentionedPatients(text, patients) {
  if (!text || !patients.length) return [];
  const found = [];
  const lowerText = text.toLowerCase();
  const hasAction = /follow.?up|call|contact|reach out|check.?in|schedule/i.test(text);
  if (!hasAction) return [];
  for (const p of patients) {
    if (lowerText.includes(p.name.toLowerCase())) {
      found.push(p);
    }
  }
  return found;
}

/**
 * Parse SSE stream from /api/chat.
 * Calls onStep(step) for each step event, onDone(data) for the final response,
 * and onError(err) on failure.
 */
async function streamChat(message, conversationId, { onStep, onDone, onError }) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });

    if (!res.ok) {
      const data = await res.json();
      onError(data.error || `Server error ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      let currentEvent = null;
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ") && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === "step") onStep(data);
            else if (currentEvent === "done") onDone(data);
            else if (currentEvent === "error") onError(data.error);
          } catch { /* skip malformed JSON */ }
          currentEvent = null;
        }
      }
    }
  } catch (err) {
    onError("Failed to connect to server.");
  }
}

const Chatbot = () => {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const messagesEndRef = useRef(null);

  const [patients, setPatients] = useState([]);
  const [hoveredPatient, setHoveredPatient] = useState(null);
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 });
  const [callStatus, setCallStatus] = useState({});

  useEffect(() => {
    async function load() {
      let raw = MOCK_PATIENTS;
      try {
        const res = await fetch("/api/patients/all");
        if (res.ok) {
          const data = await res.json();
          if (data.patients && data.patients.length > 0) raw = data.patients;
        }
      } catch { /* use mock */ }
      setPatients(raw.map(rawToUI));
    }
    load();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingSteps]);

  const nameLookup = useMemo(() => {
    const map = {};
    for (const p of patients) {
      map[p.name.toLowerCase()] = p;
      const parts = p.name.split(" ");
      if (parts.length >= 2) {
        map[parts[parts.length - 1].toLowerCase()] = p;
      }
    }
    return map;
  }, [patients]);

  const handleNameHover = useCallback((patient, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPos({ top: rect.bottom + 8, left: rect.left });
    setHoveredPatient(patient);
  }, []);

  const handleNameLeave = useCallback(() => {
    setHoveredPatient(null);
  }, []);

  const mdComponents = useMemo(() => ({
    strong: ({ children }) => {
      const text = typeof children === "string" ? children : String(children);
      const matched = nameLookup[text.toLowerCase()];
      if (matched) {
        return (
          <strong
            className="patient-name-link"
            onMouseEnter={(e) => handleNameHover(matched, e)}
            onMouseLeave={handleNameLeave}
          >
            {children}
          </strong>
        );
      }
      return <strong>{children}</strong>;
    },
  }), [nameLookup, handleNameHover, handleNameLeave]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = query.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setQuery("");
    setLoading(true);
    setThinkingSteps([]);

    await streamChat(text, conversationId, {
      onStep: (step) => {
        setThinkingSteps((prev) => {
          // Update existing step or add new one
          const existing = prev.findIndex((s) => s.id === step.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = step;
            return updated;
          }
          return [...prev, step];
        });
      },
      onDone: (data) => {
        setConversationId(data.conversation_id);
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        setLoading(false);
        // Keep steps visible briefly, then collapse
        setTimeout(() => setThinkingSteps([]), 800);
      },
      onError: (error) => {
        setMessages((prev) => [...prev, { role: "error", content: error }]);
        setLoading(false);
        setThinkingSteps([]);
      },
    });
  };

  const handleCall = async (patient) => {
    setCallStatus((prev) => ({ ...prev, [patient.patient_id]: "loading" }));
    try {
      const res = await fetch(`/api/twilio/call/${patient.patient_id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Call failed");
      setCallStatus((prev) => ({ ...prev, [patient.patient_id]: "success" }));
    } catch (err) {
      setCallStatus((prev) => ({ ...prev, [patient.patient_id]: "error" }));
    }
  };

  const handleSuggestion = (text) => {
    setQuery(text);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="home-container">
      {!hasMessages && (
        <div className="home-hero">
          <h1 className="home-title">CareLink</h1>
          <p className="home-subtitle">Ask about patients, symptoms, recovery, and care plans</p>
        </div>
      )}

      {hasMessages && (
        <div className="home-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`home-msg home-msg--${msg.role}`}>
              {msg.role === "assistant" && <div className="home-msg-label">CareLink</div>}
              <div className={`home-msg-bubble home-msg-bubble--${msg.role}`}>
                {msg.role === "assistant" ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {msg.content}
                  </Markdown>
                ) : (
                  msg.content
                )}
              </div>
              {/* Follow-up action buttons */}
              {msg.role === "assistant" && (() => {
                const mentioned = extractMentionedPatients(msg.content, patients);
                if (mentioned.length === 0) return null;
                return (
                  <div className="chat-actions">
                    {mentioned.map((p) => {
                      const status = callStatus[p.patient_id];
                      return (
                        <button
                          key={p.patient_id}
                          className="chat-action-btn"
                          onClick={() => handleCall(p)}
                          disabled={status === "loading" || status === "success"}
                        >
                          <svg className="chat-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                          </svg>
                          {status === "loading" ? "Calling..." :
                           status === "success" ? `Called ${p.name}` :
                           status === "error" ? "Retry call" :
                           `Call ${p.name}`}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ))}

          {/* Thinking steps (shown while loading) */}
          {loading && (
            <div className="home-msg home-msg--assistant">
              <div className="home-msg-label">CareLink</div>
              <div className="home-msg-bubble home-msg-bubble--assistant">
                {thinkingSteps.length > 0 ? (
                  <ThinkingSteps steps={thinkingSteps} />
                ) : (
                  <span className="home-typing">
                    <span></span><span></span><span></span>
                  </span>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className={`home-input-area ${hasMessages ? "home-input-area--bottom" : ""}`}>
        <form onSubmit={handleSubmit} className="home-form">
          <div className="home-input-wrapper">
            <input
              type="text"
              className="home-input"
              placeholder="Ask about a patient..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" className="home-submit" disabled={!query.trim() || loading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </form>

        {!hasMessages && (
          <div className="home-suggestions">
            {["Post-op patients", "Urgent cases", "Analyze trend"].map((s) => (
              <button key={s} className="home-suggestion-chip" onClick={() => handleSuggestion(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {hoveredPatient && (
        <PatientHoverCard
          patient={hoveredPatient}
          style={{ position: "fixed", top: hoverPos.top, left: hoverPos.left, zIndex: 50 }}
        />
      )}
    </div>
  );
};

export default Chatbot;
