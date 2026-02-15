import React, { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import "./Analytics.css";

/** Title-case for column/label display; "ACL" is always all caps. */
function toTitleCase(str) {
  if (str == null || typeof str !== "string") return "";
  return str
    .trim()
    .split(/\s+/)
    .map((word) => (word.toLowerCase() === "acl" ? "ACL" : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

/** Dashboard palette: primary, secondary, tertiary, primary--dim */
const GENDER_COLORS = ["var(--primary)", "var(--secondary)", "var(--tertiary)", "var(--primary--dim)"];

const DonutChart = ({ data }) => {
  const entries = Object.entries(data).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return <p className="analytics-chart-empty">No data</p>;
  const chartData = entries.map(([name, value]) => ({ name: toTitleCase(name), value }));
  return (
    <div className="analytics-chart-wrap analytics-donut-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [value, "Count"]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

const AGE_BUCKET_ORDER = ["0-17", "18-30", "31-40", "41-50", "51-60", "61-70", "71+"];

/** Same proportional spacing in all bar charts: percentage gap, no fixed bar size so they fit container. */
const BAR_CATEGORY_GAP_PCT = 12;
const CHART_MARGIN = { top: 12, right: 16, left: 8, bottom: 28 };

/** Wrap long labels onto multiple lines. */
function wrapTickLabel(text, maxChars = 14) {
  if (!text || text.length <= maxChars) return text;
  const mid = Math.floor(text.length / 2);
  const before = text.lastIndexOf(" ", mid);
  const splitAt = before > 0 ? before : mid;
  return [text.slice(0, splitAt).trim(), text.slice(splitAt).trim()].filter(Boolean).join("\n");
}

/** Custom X-axis tick; labels are title-cased. */
const MultiLineTick = ({ x, y, payload, fontSize = 12 }) => {
  const raw = payload?.value ?? "";
  const lines = wrapTickLabel(typeof raw === "string" ? raw : String(raw), 14).split("\n");
  const lineHeight = fontSize + 2;
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={i * lineHeight}
          dy={4}
          textAnchor="middle"
          fill="var(--tertiary)"
          fontSize={fontSize}
        >
          {toTitleCase(line)}
        </text>
      ))}
    </g>
  );
};

const AgeHistogram = ({ data }) => {
  const entries = AGE_BUCKET_ORDER.map((name) => ({ name, count: data[name] || 0 }));
  const hasData = entries.some((e) => e.count > 0);
  if (!hasData) return <p className="analytics-chart-empty">No data</p>;
  return (
    <div className="analytics-chart-wrap analytics-bar-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={entries} margin={CHART_MARGIN} barCategoryGap={`${BAR_CATEGORY_GAP_PCT}%`}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--medgrey)" />
          <XAxis dataKey="name" tick={<MultiLineTick fontSize={11} />} height={36} />
          <YAxis tick={{ fontSize: 12, fill: "var(--tertiary)" }} allowDecimals={false} width={28} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--primary)" name="Patients" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const CountBarChart = ({ data, barColor = "var(--primary)", sortOrder }) => {
  const entries = Object.entries(data)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => (sortOrder === "asc" ? a[1] - b[1] : b[1] - a[1]))
    .map(([name, count]) => ({ name: toTitleCase(name), count }));
  if (entries.length === 0) return <p className="analytics-chart-empty">No data</p>;
  return (
    <div className="analytics-chart-wrap analytics-bar-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={entries} margin={CHART_MARGIN} barCategoryGap={`${BAR_CATEGORY_GAP_PCT}%`}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--medgrey)" />
          <XAxis
            dataKey="name"
            tick={<MultiLineTick fontSize={10} />}
            height={40}
            interval={0}
          />
          <YAxis tick={{ fontSize: 12, fill: "var(--tertiary)" }} allowDecimals={false} width={28} />
          <Tooltip />
          <Bar dataKey="count" fill={barColor} name="Count" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Maximally distinct hues for surgery-type stacks (no similar reds/greens). */
const SURGERY_COLORS = [
  "#2563eb", /* blue */
  "#ea580c", /* orange */
  "#16a34a", /* green */
  "#9333ea", /* purple */
  "#b91c1c", /* red */
  "#0d9488", /* teal */
  "#ca8a04", /* gold */
  "#db2777", /* pink */
];

/**
 * Symptoms chart: stacked bars by surgery type (same surgery_type as surgery frequency graph).
 * data: { symptom: { [surgery_type]: count } } from API; surgeryTypeOrder: same keys as bySurgeryType.
 */
const SymptomsStackedChart = ({ data, surgeryTypeOrder }) => {
  const raw = data || {};
  const orderFromApi = Array.isArray(surgeryTypeOrder) ? surgeryTypeOrder : [];

  // Detect nested format: value is object and its values are numbers (surgery_type -> count)
  const isNestedBySurgery = (v) =>
    v && typeof v === "object" && !Array.isArray(v) &&
    Object.values(v).every((n) => typeof n === "number");

  const fromData = [...new Set(
    Object.values(raw).flatMap((bySurgery) => (isNestedBySurgery(bySurgery) ? Object.keys(bySurgery) : []))
  )];
  const allSurgeryTypes = orderFromApi.length > 0
    ? [...orderFromApi.filter((k) => fromData.includes(k)), ...fromData.filter((k) => !orderFromApi.includes(k)).sort()]
    : fromData.sort();

  const entries = Object.entries(raw)
    .map(([name, bySurgery]) => {
      const segments = isNestedBySurgery(bySurgery)
        ? bySurgery
        : typeof bySurgery === "number"
          ? { All: bySurgery }
          : {};
      const total = Object.entries(segments).reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
      const row = { name: toTitleCase(name), total };
      allSurgeryTypes.forEach((st) => {
        row[st] = segments[st] ?? 0;
      });
      if (allSurgeryTypes.length === 0 && total > 0) {
        row.All = total;
      }
      return row;
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);

  const surgeryTypes = allSurgeryTypes.length > 0 ? allSurgeryTypes : (entries.some((e) => e.All != null) ? ["All"] : []);
  return (
    <div className="analytics-chart-wrap analytics-bar-wrap analytics-symptoms-chart">
      {entries.length === 0 ? (
        <p className="analytics-chart-empty">No symptom data from patient calls yet. Data is extracted from follow-up call transcripts and summaries.</p>
      ) : (
        <ResponsiveContainer width="100%" height={440}>
          <BarChart data={entries} margin={CHART_MARGIN} barCategoryGap={`${BAR_CATEGORY_GAP_PCT}%`}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--medgrey)" />
            <XAxis
              dataKey="name"
              tick={<MultiLineTick fontSize={10} />}
              height={40}
              interval={0}
            />
            <YAxis tick={{ fontSize: 12, fill: "var(--tertiary)" }} allowDecimals={false} width={28} />
            <Tooltip wrapperStyle={{ zIndex: 100 }} />
            <Legend />
            {surgeryTypes.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="surgery"
                fill={SURGERY_COLORS[i % SURGERY_COLORS.length]}
                name={toTitleCase(key)}
                radius={i === surgeryTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

const Analytics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        setError(null);
        const res = await fetch("/api/analytics");
        if (!res.ok) throw new Error(res.statusText || "Failed to load analytics");
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="analytics-page mt-12">
        <h2>Analytics</h2>
        <p className="analytics-loading">Loading analytics from database…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-page mt-12">
        <h2>Analytics</h2>
        <p className="analytics-error">Could not load analytics: {error}</p>
      </div>
    );
  }

  return (
    <div className="analytics-page mt-12">
      <h2>Analytics</h2>
      <p className="analytics-subtitle">Stats from the patient database (Elasticsearch).</p>

      <div className="analytics-stats-grid animate-hero-enter">
        <div className="analytics-stat-card">
          <div className="label">Total patients</div>
          <div className="value">{stats.totalPatients}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="label">Surgeries</div>
          <div className="value">{stats.totalSurgeries}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="label">Average age</div>
          <div className="value">{stats.averageAge}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="label">Total follow-up calls</div>
          <div className="value">{stats.totalCalls}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="label">Avg. post-op days in hospital</div>
          <div className="value">{stats.averageDaysInHospital != null ? `${stats.averageDaysInHospital} days` : "—"}</div>
        </div>
        <div className="analytics-stat-card">
          <div className="label">Due for follow-up</div>
          <div className="value">{stats.patientsDueFollowUp}</div>
        </div>
      </div>

      <div className="analytics-charts-row">
        <div className="analytics-section">
          <h3>Patient Age</h3>
          <AgeHistogram data={stats.ageDistribution || {}} />
        </div>
        <div className="analytics-section">
          <h3>Gender Breakdown</h3>
          <DonutChart data={stats.byGender || {}} />
        </div>
      </div>

      <div className="analytics-charts-row">
        <div className="analytics-section">
          <h3>Surgery Frequency</h3>
          <CountBarChart data={stats.bySurgeryType || {}} barColor="var(--tertiary)" />
        </div>
        <div className="analytics-section">
          <h3>Risk Factors</h3>
          <CountBarChart data={stats.byRiskFactor || {}} barColor="var(--primary--dim)" />
        </div>
      </div>

      <div className="analytics-section">
        <h3>Symptoms From Call Transcripts</h3>
        <p className="analytics-subtitle analytics-section-desc">Mentions extracted from follow-up call transcripts and summaries, stacked by surgery type.</p>
        <SymptomsStackedChart data={stats.symptomsFromCalls} surgeryTypeOrder={stats.surgeryTypeOrder} />
      </div>
    </div>
  );
};

export default Analytics;
