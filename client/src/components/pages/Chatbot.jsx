import React, { useState, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./Home.css";

const Chatbot = () => {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      } else {
        setMessages((prev) => [...prev, { role: "error", content: data.error }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", content: "Failed to connect to server." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (text) => {
    setQuery(text);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="home-container">
      {!hasMessages && (
        <div className="home-hero-wrap">
          <div className="home-hero">
            <h1 className="home-title">CareLink</h1>
            <p className="home-subtitle">Ask about patients, symptoms, recovery, and care plans</p>
          </div>
        </div>
      )}

      {hasMessages && (
        <div className="home-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`home-msg home-msg--${msg.role}`}>
              {msg.role === "assistant" && <div className="home-msg-label">CareLink</div>}
              <div className={`home-msg-bubble home-msg-bubble--${msg.role}`}>
                {msg.role === "assistant" ? (
                  <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="home-msg home-msg--assistant">
              <div className="home-msg-label">CareLink</div>
              <div className="home-msg-bubble home-msg-bubble--assistant">
                <span className="home-typing">
                  <span></span><span></span><span></span>
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="home-input-area">
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
    </div>
  );
};

export default Chatbot;
