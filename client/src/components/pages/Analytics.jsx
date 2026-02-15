import React, { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
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

/** Custom tooltip for gender donut: shows gender, count, and surgery frequency list for that gender only. */
const GenderDonutTooltip = ({ active, payload, surgeryByGender }) => {
  if (!active || !payload?.length || !surgeryByGender) return null;
  const name = payload[0]?.payload?.name;
  const count = payload[0]?.value ?? 0;
  const bySurgery = surgeryByGender[name] || {};
  const list = Object.entries(bySurgery)
    .sort((a, b) => b[1] - a[1])
    .map(([surgery, n]) => `${toTitleCase(surgery)}: ${n}`);
  return (
    <div className="analytics-tooltip-box">
      <div className="analytics-tooltip-title">
        {name} — {count} {count === 1 ? "patient" : "patients"}
      </div>
      {list.length > 0 ? (
        <ul className="analytics-tooltip-surgery-list">
          {list.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        <div className="analytics-tooltip-empty">No surgery data</div>
      )}
    </div>
  );
};

const DonutChart = ({ data, surgeryByGender }) => {
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
          <Tooltip
            content={surgeryByGender ? <GenderDonutTooltip surgeryByGender={surgeryByGender} /> : undefined}
            formatter={!surgeryByGender ? (value) => [value, "Count"] : undefined}
            wrapperStyle={{ zIndex: 100 }}
          />
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

/** Recovery trajectory chart: plot area layout (must match LineChart + YAxis width). */
const TRAJECTORY_CHART_HEIGHT = 360;
const TRAJECTORY_Y_AXIS_WIDTH = 32;
const TRAJECTORY_X_DOMAIN = [0, 7];

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

/** Slight rotation for X-axis labels to avoid overlap with other text. */
const TICK_ROTATION_ANGLE = -38;

/** Rotated X-axis tick to prevent overlap when many columns (e.g. Surgery Freq, Risk Factors). */
const RotatedTick = ({ x, y, payload, fontSize = 10, angle = TICK_ROTATION_ANGLE }) => {
  const raw = payload?.value ?? "";
  const text = toTitleCase(typeof raw === "string" ? raw : String(raw));
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill="var(--tertiary)"
        fontSize={fontSize}
        transform={`rotate(${angle})`}
      >
        {text}
      </text>
    </g>
  );
};

/** Custom tooltip for age histogram: shows age bucket, patient count, and surgery frequency list for that age group. */
const AgeHistogramTooltip = ({ active, payload, surgeryByAgeBucket }) => {
  if (!active || !payload?.length || !surgeryByAgeBucket) return null;
  const bucket = payload[0]?.payload?.name;
  const count = payload[0]?.value ?? 0;
  const bySurgery = surgeryByAgeBucket[bucket] || {};
  const list = Object.entries(bySurgery)
    .sort((a, b) => b[1] - a[1])
    .map(([surgery, n]) => `${toTitleCase(surgery)}: ${n}`);
  return (
    <div className="analytics-tooltip-box">
      <div className="analytics-tooltip-title">
        {bucket} — {count} {count === 1 ? "patient" : "patients"}
      </div>
      {list.length > 0 ? (
        <ul className="analytics-tooltip-surgery-list">
          {list.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        <div className="analytics-tooltip-empty">No surgery data</div>
      )}
    </div>
  );
};

const AgeHistogram = ({ data, surgeryByAgeBucket = {} }) => {
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
          <Tooltip
            content={<AgeHistogramTooltip surgeryByAgeBucket={surgeryByAgeBucket} />}
            wrapperStyle={{ zIndex: 100 }}
          />
          <Bar dataKey="count" fill="var(--primary)" name="Patients" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Bottom margin and XAxis height for bar charts with rotated labels (no overlap). */
const COUNT_BAR_CHART_MARGIN = { ...CHART_MARGIN, bottom: 72 };
const COUNT_BAR_X_AXIS_HEIGHT = 72;

const CountBarChart = ({ data, barColor = "var(--primary)", sortOrder }) => {
  const entries = Object.entries(data)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => (sortOrder === "asc" ? a[1] - b[1] : b[1] - a[1]))
    .map(([name, count]) => ({ name: toTitleCase(name), count }));
  if (entries.length === 0) return <p className="analytics-chart-empty">No data</p>;
  return (
    <div className="analytics-chart-wrap analytics-bar-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={entries} margin={COUNT_BAR_CHART_MARGIN} barCategoryGap={`${BAR_CATEGORY_GAP_PCT}%`}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--medgrey)" />
          <XAxis
            dataKey="name"
            tick={(props) => <RotatedTick {...props} fontSize={10} angle={TICK_ROTATION_ANGLE} />}
            height={COUNT_BAR_X_AXIS_HEIGHT}
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

/** Chart palette aligned with theme (primary, secondary, tertiary, primary--dim). */
const CHART_COLORS = ["var(--primary)", "var(--secondary)", "var(--tertiary)", "var(--primary--dim)"];

/** Column labels that are not actual symptoms; excluded from the symptoms chart (case-insensitive). Infection is excluded entirely. */
const NON_SYMPTOM_CHART_LABELS = new Set(['symptom', 'symptoms', 'complication', 'complications']);

/**
 * Section: Symptoms from call transcripts with surgery dropdown.
 * data: { symptom: { [surgery_type]: count } }. Y-axis: % of patients. Dropdown: "All" or a specific surgery.
 */
const SymptomsFromCallsSection = ({ data, surgeryTypeOrder, totalPatients = 0, bySurgeryType = {} }) => {
  const raw = data || {};
  const orderFromApi = Array.isArray(surgeryTypeOrder) ? surgeryTypeOrder : [];

  const filteredRaw = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !NON_SYMPTOM_CHART_LABELS.has(key.toLowerCase()))
  );

  const isNestedBySurgery = (v) =>
    v && typeof v === "object" && !Array.isArray(v) &&
    Object.values(v).every((n) => typeof n === "number");

  const fromData = [...new Set(
    Object.values(filteredRaw).flatMap((bySurgery) => (isNestedBySurgery(bySurgery) ? Object.keys(bySurgery) : []))
  )];
  const allSurgeryTypes = orderFromApi.length > 0
    ? [...orderFromApi.filter((k) => fromData.includes(k)), ...fromData.filter((k) => !orderFromApi.includes(k)).sort()]
    : fromData.sort();

  const options = ["All", ...allSurgeryTypes];
  const [selectedSurgery, setSelectedSurgery] = React.useState("All");

  // Fixed symptom order: all symptoms sorted once by total count (desc) so columns don't change when switching surgery
  const symptomOrder = React.useMemo(() => {
    return Object.entries(filteredRaw)
      .map(([name, bySurgery]) => {
        const segments = isNestedBySurgery(bySurgery) ? bySurgery : {};
        const total = Object.values(segments).reduce((sum, v) => sum + (Number(v) || 0), 0);
        return [name, total];
      })
      .filter(([, total]) => total > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [data, surgeryTypeOrder]);

  const denominator = selectedSurgery === "All"
    ? totalPatients
    : (Number(bySurgeryType[selectedSurgery]) || 1);

  const entries = React.useMemo(() => {
    return symptomOrder.map((name) => {
      const bySurgery = filteredRaw[name];
      const segments = isNestedBySurgery(bySurgery) ? bySurgery : {};
      const count = selectedSurgery === "All"
        ? Object.values(segments).reduce((sum, v) => sum + (Number(v) || 0), 0)
        : (Number(segments[selectedSurgery]) || 0);
      const percent = denominator
        ? Math.min(100, Math.round((count / denominator) * 1000) / 10)
        : 0;
      return { name: toTitleCase(name), count, percent };
    });
  }, [data, surgeryTypeOrder, selectedSurgery, symptomOrder, denominator]);

  return (
    <div className="analytics-section">
      <div className="analytics-section-header-with-dropdown">
        <div>
          <h3>Symptoms From Call Transcripts</h3>
          <p className="analytics-subtitle analytics-section-desc">
            Mentions extracted from follow-up call transcripts and summaries.
          </p>
        </div>
        <label className="analytics-trajectory-dropdown-wrap">
          <span className="analytics-trajectory-dropdown-label">Surgery</span>
          <select
            className="analytics-trajectory-dropdown"
            value={selectedSurgery}
            onChange={(e) => setSelectedSurgery(e.target.value)}
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="analytics-chart-wrap analytics-bar-wrap analytics-symptoms-chart">
        {entries.length === 0 ? (
          <p className="analytics-chart-empty">
            No symptom data from patient calls yet{selectedSurgery !== "All" ? ` for ${selectedSurgery}` : ""}. Data is extracted from follow-up call transcripts and summaries.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <BarChart
              data={entries}
              margin={COUNT_BAR_CHART_MARGIN}
              barCategoryGap={`${BAR_CATEGORY_GAP_PCT}%`}
              allowDataOverflow
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--medgrey)" />
              <XAxis
                dataKey="name"
                tick={(props) => <RotatedTick {...props} fontSize={10} angle={TICK_ROTATION_ANGLE} />}
                height={COUNT_BAR_X_AXIS_HEIGHT}
                interval={0}
              />
              <YAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 12, fill: "var(--tertiary)" }}
                tickFormatter={(v) => `${v}%`}
                width={36}
                allowDataOverflow
              />
              <Tooltip
                formatter={(value, name, props) => [
                  `${value}% (${props.payload.count} ${props.payload.count === 1 ? "patient" : "patients"})`,
                  "Mentions",
                ]}
                labelFormatter={(label) => label}
              />
              <Bar dataKey="percent" fill="var(--primary)" name="Mentions" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

/**
 * Section: Expected vs actual recovery with surgery dropdown in the corner.
 */
const RecoveryTrajectorySection = ({ recoveryTrajectoryBySurgery, surgeryTypesForTrajectory }) => {
  const options = surgeryTypesForTrajectory?.length
    ? surgeryTypesForTrajectory
    : recoveryTrajectoryBySurgery ? Object.keys(recoveryTrajectoryBySurgery).sort() : [];
  const firstKey = options[0] || null;
  const [selectedSurgery, setSelectedSurgery] = React.useState(firstKey);
  const data = selectedSurgery && recoveryTrajectoryBySurgery?.[selectedSurgery] ? recoveryTrajectoryBySurgery[selectedSurgery] : null;

  React.useEffect(() => {
    if (firstKey != null && (selectedSurgery == null || !recoveryTrajectoryBySurgery?.[selectedSurgery])) {
      setSelectedSurgery(firstKey);
    }
  }, [firstKey, recoveryTrajectoryBySurgery, selectedSurgery]);

  if (!recoveryTrajectoryBySurgery || Object.keys(recoveryTrajectoryBySurgery).length === 0) {
    return (
      <div className="analytics-section">
        <h3>Expected vs Actual Recovery</h3>
        <p className="analytics-chart-empty">No surgery data available for trajectory comparison.</p>
      </div>
    );
  }

  return (
    <div className="analytics-section">
      <div className="analytics-section-header-with-dropdown">
        <div>
          <h3>Expected vs Actual Recovery</h3>
          <p className="analytics-subtitle analytics-section-desc">
            Expected severity for this surgery vs actual average from check-ins.
          </p>
        </div>
        <label className="analytics-trajectory-dropdown-wrap">
          <span className="analytics-trajectory-dropdown-label">Surgery</span>
          <select
            className="analytics-trajectory-dropdown"
            value={selectedSurgery || ""}
            onChange={(e) => setSelectedSurgery(e.target.value || null)}
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <RecoveryTrajectoryChart data={data} />
    </div>
  );
};

/**
 * Expected vs actual recovery trajectory for one surgery.
 * Blue = expected, orange = actual from check-ins.
 */
const RecoveryTrajectoryChart = ({ data }) => {
  if (!data || !data.surgeryType) return null;

  const { expected = [], actual = [] } = data;
  const byDay = new Map(expected.map((e) => [e.day, { day: e.day, expected: e.severity, actual: null }]));
  actual.forEach((a) => {
    if (byDay.has(a.day) && a.avgSeverity != null) {
      byDay.get(a.day).actual = a.avgSeverity;
    }
  });
  const chartData = Array.from(byDay.values()).sort((a, b) => a.day - b.day);

  const hasAnyActual = chartData.some((d) => d.actual != null);
  const yDomain = [0.5, 3.5];

  return (
    <div className="analytics-chart-wrap analytics-bar-wrap">
      <ResponsiveContainer width="100%" height={TRAJECTORY_CHART_HEIGHT}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--medgrey)" />
            <XAxis
              dataKey="day"
              type="number"
              domain={TRAJECTORY_X_DOMAIN}
              tick={{ fontSize: 12, fill: "var(--tertiary)" }}
              label={{ value: "Days since surgery", position: "insideBottom", offset: -4, fontSize: 11 }}
            />
            <YAxis
              domain={yDomain}
              ticks={[1, 2, 3]}
              tick={{ fontSize: 12, fill: "var(--tertiary)" }}
              label={{ value: "Composite symptom severity", angle: -90, position: "insideLeft", fontSize: 11 }}
              width={TRAJECTORY_Y_AXIS_WIDTH}
            />
            <Tooltip
              formatter={(value, name) => [
                value != null ? value.toFixed(1) : "—",
                name === "expected" ? "Expected" : name === "actual" ? "Actual (avg)" : name,
              ]}
              labelFormatter={(day) => `Day ${day}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="expected"
              name="Expected"
              stroke="var(--primary--dim)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual (avg)"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={true}
            />
          </LineChart>
        </ResponsiveContainer>
      {!hasAnyActual && (
        <p className="analytics-chart-empty" style={{ marginTop: "0.5rem" }}>
          No check-in data yet for {data.surgeryType}. Actual line will appear once calls are recorded.
        </p>
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
          <AgeHistogram data={stats.ageDistribution || {}} surgeryByAgeBucket={stats.surgeryByAgeBucket || {}} />
        </div>
        <div className="analytics-section">
          <h3>Gender Breakdown</h3>
          <DonutChart data={stats.byGender || {}} surgeryByGender={stats.surgeryByGender || {}} />
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

      <SymptomsFromCallsSection
          data={stats.symptomsFromCalls}
          surgeryTypeOrder={stats.surgeryTypeOrder}
          totalPatients={stats.totalPatients}
          bySurgeryType={stats.bySurgeryType}
        />

      <RecoveryTrajectorySection
        recoveryTrajectoryBySurgery={stats.recoveryTrajectoryBySurgery}
        surgeryTypesForTrajectory={stats.surgeryTypesForTrajectory}
      />
    </div>
  );
};

export default Analytics;
