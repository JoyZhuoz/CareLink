import React, { useState, useEffect } from "react";
import "./DashboardTab.css";

const DashboardTab = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/admin/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText || "Failed to load dashboard");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="dashboard-tab-page">
        <p className="dashboard-tab-placeholder">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-tab-page">
        <p className="dashboard-tab-error">{error}</p>
      </div>
    );
  }

  const formatUrgency = (u) => (u ? String(u).replace(/^./, (c) => c.toUpperCase()) : "—");

  return (
    <div className="dashboard-tab-page">
      <div className="dashboard-tab-stats-panel">
        <div className="dashboard-tab-stat">
          <span className="dashboard-tab-stat-value">{stats?.numberOfSurgeries ?? "—"}</span>
          <span className="dashboard-tab-stat-label">Number of surgeries</span>
        </div>
        <div className="dashboard-tab-stat">
          <span className="dashboard-tab-stat-value">
            {stats?.averageAge != null ? `${stats.averageAge} yr` : "—"}
          </span>
          <span className="dashboard-tab-stat-label">Average patient age</span>
        </div>
        <div className="dashboard-tab-stat">
          <span className="dashboard-tab-stat-value">{formatUrgency(stats?.averageCaseUrgency)}</span>
          <span className="dashboard-tab-stat-label">Average case urgency</span>
        </div>
        <div className="dashboard-tab-stat">
          <span className="dashboard-tab-stat-value">
            {stats?.averageDaysSurgeryToDischarge != null
              ? `${stats.averageDaysSurgeryToDischarge} days`
              : "—"}
          </span>
          <span className="dashboard-tab-stat-label">Avg. days (surgery → discharge)</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardTab;
