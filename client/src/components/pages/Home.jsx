import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

const Home = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/dashboard?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="home-container">
      <div className="home-content">
        <h1 className="home-title">CareLink</h1>
        <p className="home-subtitle">Search patient records, symptoms, and recovery data</p>

        <form onSubmit={handleSubmit} className="home-form">
          <div className="home-input-wrapper">
            <svg
              className="home-search-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="home-input"
              placeholder="Search for a patient, condition, or keyword..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="home-submit"
              disabled={!query.trim()}
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

        <div className="home-suggestions">
          {["Post-op patients", "Urgent cases", "Recent discharges"].map((suggestion) => (
            <button
              key={suggestion}
              className="home-suggestion-chip"
              onClick={() => {
                setQuery(suggestion);
                navigate(`/dashboard?q=${encodeURIComponent(suggestion)}`);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
