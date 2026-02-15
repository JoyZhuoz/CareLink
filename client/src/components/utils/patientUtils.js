export const TRIAGE_TO_URGENCY = { green: "Minimal", yellow: "Monitor", red: "Urgent" };

export function formatDischargeDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate.replace("T00:00:00.000Z", ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getTriageFromCall(latestCall) {
  if (!latestCall) return "green";
  const fields = latestCall.fields;
  if (fields && fields.triage_level && fields.triage_level[0]) return fields.triage_level[0];
  return latestCall.triage_level || "green";
}

export function getSummaryFromCall(latestCall) {
  if (!latestCall) return "No summary available.";
  const fields = latestCall.fields;
  if (fields) {
    const r = fields.reasoning_summary && fields.reasoning_summary[0];
    const a = fields.recommended_action && fields.recommended_action[0];
    return r || a || "No summary available.";
  }
  return latestCall.reasoning_summary || latestCall.recommended_action || "No summary available.";
}

/** Symptoms from a single call: Claude-extracted symptoms_mentioned (from triage JSON), not keyword extraction. */
export function getSymptomsFromCall(call) {
  if (!call) return null;
  const list = call.symptoms_mentioned || (call.fields && call.fields.symptoms_mentioned);
  if (Array.isArray(list) && list.length > 0) {
    return list.map((s) => (typeof s === "string" ? s : String(s)).trim()).filter(Boolean);
  }
  return null;
}

/** Return the single most recent call (by call_date) so Recent Symptoms and urgency use only latest call. */
export function getMostRecentCall(raw) {
  const history = raw.call_history;
  if (!Array.isArray(history) || history.length === 0) return null;
  const getDate = (c) => c.call_date || (c.fields && c.fields.call_date && c.fields.call_date[0]) || "";
  const sorted = [...history].sort((a, b) => new Date(getDate(b)) - new Date(getDate(a)));
  return sorted[0];
}

export function patientToUI(raw) {
  const mostRecentCall = getMostRecentCall(raw);
  const triage = getTriageFromCall(mostRecentCall);
  const aiSummary = getSummaryFromCall(mostRecentCall);
  const hasTranscript =
    mostRecentCall &&
    ((mostRecentCall.transcript && mostRecentCall.transcript.length > 0) ||
      (mostRecentCall.fields && (mostRecentCall.fields["transcript.text"] || []).length > 0));
  const extractedSymptoms = getSymptomsFromCall(mostRecentCall);
  const hasBeenCalled = !!(raw.call_history && raw.call_history.length > 0);
  const symptoms =
    !hasBeenCalled
      ? ["Not called yet"]
      : extractedSymptoms && extractedSymptoms.length > 0
        ? extractedSymptoms
        : hasTranscript
          ? ["See call history"]
          : ["None reported"];

  // Next scheduled call: 2 days after discharge if not yet called (matches scheduler logic)
  let nextCallDate = null;
  if (!hasBeenCalled && raw.discharge_date) {
    const d = new Date(raw.discharge_date);
    d.setDate(d.getDate() + 2);
    nextCallDate = d.toISOString();
  }

  const name = raw.name || "Unknown";
  // Custom avatar overrides per patient ID
  const CUSTOM_AVATARS = {
    "pt-joy-zhuo": "https://i.postimg.cc/mLsYWqxb/Weixin-Image-20260214230412-3-1.jpg",
  };
  const avatar = CUSTOM_AVATARS[raw.patient_id] || `https://i.pravatar.cc/128?u=${encodeURIComponent(raw.patient_id)}`;
  const avatarFallback =
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=128&background=random`;

  const latestConditionChange = mostRecentCall?.condition_change || null;

  return {
    id: raw.patient_id,
    patient_id: raw.patient_id,
    name,
    phone: raw.phone,
    avatar,
    avatarFallback,
    operation: raw.surgery_type,
    symptoms,
    dischargeDate: formatDischargeDate(raw.discharge_date),
    urgency: TRIAGE_TO_URGENCY[triage] || "Minimal",
    age: raw.age,
    sex: raw.gender,
    riskFactors: (raw.risk_factors || []).map((f) => (f && f.charAt(0).toUpperCase() + f.slice(1)) || "").filter(Boolean),
    aiSummary,
    call_history: raw.call_history,
    hasBeenCalled,
    nextCallDate,
    conditionChange: latestConditionChange,
  };
}
