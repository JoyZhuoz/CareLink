/**
 * Analytics derived from the Elasticsearch `patients` index.
 */

import * as patientService from './patientService.js';

const AGE_BUCKETS = [
  [0, 17, '0-17'],
  [18, 30, '18-30'],
  [31, 40, '31-40'],
  [41, 50, '41-50'],
  [51, 60, '51-60'],
  [61, 70, '61-70'],
  [71, 120, '71+'],
];

/** Symptom keywords to extract from call transcripts (case-insensitive). Excludes meta terms like "symptom". */
const SYMPTOM_KEYWORDS = [
  'pain', 'swelling', 'fever', 'nausea', 'vomiting', 'dizziness', 'bleeding',
  'redness', 'drainage', 'shortness of breath', 'chest pain', 'infection',
  'numbness', 'stiffness', 'bruising', 'soreness', 'headache', 'fatigue',
  'constipation', 'diarrhea', 'insomnia', 'sleep', 'cough', 'wound',
  'discomfort', 'tenderness', 'itching',
  // Additional post-surgical / recovery symptoms
  'weakness', 'anxiety', 'depression', 'appetite', 'mobility', 'tingling',
  'cramping', 'bloating', 'heartburn', 'rash', 'scar', 'warmth', 'pressure',
  'palpitations', 'confusion', 'drowsiness', 'spasms', 'throat', 'swallowing',
  'dehydration', 'inflammation', 'sensitivity', 'edema', 'dry mouth',
  'back pain', 'leg pain', 'arm pain', 'joint pain', 'muscle pain',
  'night sweats', 'chills', 'gas', 'reflux',
  'lightheaded', 'blurred vision', 'ringing', 'hoarseness', 'hiccups',
  // More diverse / alternate phrasings patients use
  'sore', 'stiff', 'dizzy', 'tired', 'nauseous', 'swollen', 'bruise',
  'burning', 'aching', 'tightness', 'grinding', 'popping', 'clicking', 'limp',
  'pus', 'odor', 'leaking',
  'chest tightness', 'difficulty breathing', 'loss of appetite', 'no appetite',
  'belching', 'burping', 'indigestion',
  'muscle weakness', 'leg weakness', 'arm weakness',
  'itchy', 'scabbing', 'oozing', 'discoloration',
  'forgetful', 'brain fog', 'irritability',
];

/** Labels that are not actual symptoms; excluded from symptom charts (case-insensitive). */
const NON_SYMPTOM_LABELS = new Set(['symptom', 'symptoms', 'complication', 'complications']);

/** Keywords used for the "symptoms from patient mentions" chart (same as SYMPTOM_KEYWORDS; infection included). */
const SYMPTOM_KEYWORDS_FOR_PATIENT_CHART = [...SYMPTOM_KEYWORDS];

function countBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const k = keyFn(item);
    if (k == null || k === '') continue;
    map[k] = (map[k] || 0) + 1;
  }
  return map;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/** Normalize gender for consistent chart/tooltip keys (Male, Female, Other). */
function normalizeGender(gender) {
  if (gender == null || String(gender).trim() === '') return '';
  const s = String(gender).trim().toLowerCase();
  if (s === 'male' || s === 'm') return 'Male';
  if (s === 'female' || s === 'f') return 'Female';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Coerce age to number (ES or API may return string). Returns bucket label or null if invalid. */
function getAgeBucket(age) {
  const n = typeof age === 'number' ? age : Number(age);
  if (Number.isNaN(n) || n < 0) return null;
  for (const [lo, hi, label] of AGE_BUCKETS) {
    if (n >= lo && n <= hi) return label;
  }
  return '71+';
}

function extractSymptomsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const found = [];
  for (const kw of SYMPTOM_KEYWORDS) {
    if (lower.includes(kw)) found.push(kw);
  }
  return found;
}

/** Like extractSymptomsFromText but requires whole-word match (avoids e.g. "infection" in "disinfection"). Optional keyword list (default SYMPTOM_KEYWORDS). */
function extractSymptomsFromTextWholeWord(text, keywords = SYMPTOM_KEYWORDS) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const found = [];
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + escaped + '\\b', 'i');
    if (re.test(lower)) found.push(kw);
  }
  return found;
}

function extractSymptomsFromCall(call) {
  const counts = {};
  const add = (str) => {
    extractSymptomsFromText(str).forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
  };
  if (call.transcript && Array.isArray(call.transcript)) {
    call.transcript.forEach((t) => add(t && t.text));
  }
  if (call.reasoning_summary) add(call.reasoning_summary);
  if (call.matched_complications) {
    const v = call.matched_complications;
    if (typeof v === 'string') add(v);
    else if (Array.isArray(v)) v.forEach((s) => add(String(s)));
  }
  return counts;
}

/** True if this transcript speaker is the patient (not AI/agent). Only count symptoms from patient utterances. */
function isPatientSpeaker(speaker) {
  if (speaker == null) return false;
  const s = String(speaker).toLowerCase();
  return s === 'patient' || s === 'user' || s === 'caller';
}

/** Symptoms from patient-only transcript lines for the analytics chart. Uses chart keyword list and whole-word match. */
function extractSymptomsFromCallPatientMentions(call) {
  const counts = {};
  const add = (str) => {
    extractSymptomsFromTextWholeWord(str, SYMPTOM_KEYWORDS_FOR_PATIENT_CHART).forEach((s) => {
      counts[s] = (counts[s] || 0) + 1;
    });
  };
  if (call.transcript && Array.isArray(call.transcript)) {
    call.transcript.forEach((t) => {
      if (!t || typeof t !== 'object' || !t.text) return;
      if (isPatientSpeaker(t.speaker)) add(String(t.text));
    });
  }
  return counts;
}

/**
 * Normalize a call from either storage format for symptom extraction.
 * - Twilio format: { transcript: [{ speaker, text }], reasoning_summary, matched_complications }
 * - ES "fields" format: { fields: { "transcript.text": [...], reasoning_summary: [...], ... } }
 */
function normalizeCall(call) {
  if (!call) return null;
  const f = call.fields;
  if (f && typeof f === 'object') {
    const transcriptTexts = f['transcript.text'] || [];
    const transcriptSpeakers = f['transcript.speaker'] || [];
    const transcript = transcriptTexts.map((text, i) => ({
      speaker: transcriptSpeakers[i] || 'ai',
      text: typeof text === 'string' ? text : String(text || ''),
    }));
    const reasoning_summary = (f.reasoning_summary && f.reasoning_summary[0]) || '';
    const matched_complications = f.matched_complications;
    return { transcript, reasoning_summary, matched_complications };
  }
  return {
    transcript: Array.isArray(call.transcript) ? call.transcript : [],
    reasoning_summary: call.reasoning_summary ?? '',
    matched_complications: call.matched_complications,
  };
}

/**
 * Expected composite symptom severity by days since surgery (0–7) per surgery type.
 * Scale 1 = green, 2 = yellow, 3 = red. Patterns reflect typical recovery (Perplexity-style) per procedure.
 */
function getExpectedTrajectoryForSurgery(surgeryType) {
  const days = [0, 1, 2, 3, 4, 5, 6, 7];
  const st = (surgeryType || '').trim().toLowerCase();

  const curves = {
    'total knee replacement': (d) => {
      if (d <= 2) return 2.2;
      if (d <= 5) return 2.0 - (d - 2) * 0.15;
      if (d <= 10) return 1.55 - (d - 5) * 0.05;
      return 1.3;
    },
    'hip replacement': (d) => {
      if (d <= 3) return 2.3;
      if (d <= 7) return 2.1 - (d - 3) * 0.12;
      return Math.max(1.2, 1.65 - (d - 7) * 0.04);
    },
    'hysterectomy': (d) => {
      if (d <= 2) return 2.4;
      if (d <= 6) return 2.2 - (d - 2) * 0.2;
      return Math.max(1.2, 1.4 - (d - 6) * 0.02);
    },
    'colon resection': (d) => {
      if (d <= 4) return 2.5;
      if (d <= 9) return 2.2 - (d - 4) * 0.14;
      return 1.35;
    },
    'coronary artery bypass': (d) => {
      if (d <= 5) return 2.4;
      if (d <= 10) return 2.2 - (d - 5) * 0.1;
      return 1.4;
    },
    'spinal fusion': (d) => {
      if (d <= 4) return 2.5;
      if (d <= 10) return 2.3 - (d - 4) * 0.12;
      return 1.5;
    },
    'acl reconstruction': (d) => {
      if (d <= 2) return 2.0;
      if (d <= 7) return 1.9 - (d - 2) * 0.1;
      return 1.4;
    },
    'appendectomy': (d) => {
      if (d <= 1) return 2.0;
      if (d <= 5) return 1.8 - (d - 1) * 0.15;
      return 1.2;
    },
    'gallbladder removal': (d) => {
      if (d <= 2) return 1.9;
      if (d <= 6) return 1.8 - (d - 2) * 0.1;
      return 1.25;
    },
    'laparoscopic cholecystectomy': (d) => {
      if (d <= 2) return 1.9;
      if (d <= 6) return 1.8 - (d - 2) * 0.1;
      return 1.25;
    },
    'c-section': (d) => {
      if (d <= 3) return 2.3;
      if (d <= 8) return 2.1 - (d - 3) * 0.12;
      return 1.4;
    },
  };

  const defaultCurve = (d) => {
    if (d <= 2) return 2.2;
    if (d <= 6) return 2.0 - (d - 2) * 0.15;
    return Math.max(1.2, 1.5 - (d - 6) * 0.03);
  };
  const curveFn = curves[st] || defaultCurve;

  return days.map((day) => ({
    day,
    severity: Math.round(curveFn(day) * 10) / 10,
  }));
}

/** Triage level to numeric severity (composite score): red=3, yellow=2, green=1. */
function triageToSeverity(triageLevel) {
  const t = (triageLevel || '').toLowerCase();
  if (t === 'red') return 3;
  if (t === 'yellow') return 2;
  return 1;
}

/** Get call_date and triage_level from a call (handles raw or ES fields format). */
function getCallDayAndSeverity(call, surgeryDate) {
  const callDateStr = call.call_date ?? call.fields?.call_date?.[0];
  const triage = call.triage_level ?? call.fields?.triage_level?.[0];
  if (!callDateStr || !surgeryDate) return null;
  const callDate = new Date(callDateStr);
  const surgery = new Date(surgeryDate);
  if (Number.isNaN(callDate.getTime()) || Number.isNaN(surgery.getTime())) return null;
  const daysSince = Math.floor((callDate.getTime() - surgery.getTime()) / 86400000);
  if (daysSince < 0 || daysSince > 7) return null;
  return { day: daysSince, severity: triageToSeverity(triage) };
}

/**
 * Compute expected vs actual recovery trajectory for every surgery type present in patients.
 * @returns {{ recoveryTrajectoryBySurgery: Record<string, { surgeryType, expected, actual }>, surgeryTypesForTrajectory: string[] }}
 */
function computeRecoveryTrajectory(patients) {
  const surgeryTypes = [...new Set(patients.map((p) => (p.surgery_type || '').trim()).filter(Boolean))].sort();

  const recoveryTrajectoryBySurgery = {};
  for (const surgeryType of surgeryTypes) {
    const expected = getExpectedTrajectoryForSurgery(surgeryType);
    const actualByDay = {};
    for (let d = 0; d <= 7; d++) actualByDay[d] = { sum: 0, count: 0 };

    for (const p of patients) {
      const st = (p.surgery_type || '').trim();
      if (st !== surgeryType) continue;
      const surgeryDate = p.surgery_date;
      for (const call of p.call_history || []) {
        const parsed = getCallDayAndSeverity(call, surgeryDate);
        if (!parsed) continue;
        actualByDay[parsed.day].sum += parsed.severity;
        actualByDay[parsed.day].count += 1;
      }
    }

    const actual = [];
    for (let day = 0; day <= 7; day++) {
      const { sum, count } = actualByDay[day];
      const avgSeverity = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
      actual.push({ day, avgSeverity, count });
    }

    recoveryTrajectoryBySurgery[surgeryType] = { surgeryType, expected, actual };
  }

  return { recoveryTrajectoryBySurgery, surgeryTypesForTrajectory: surgeryTypes };
}

/**
 * Compute analytics stats from all patients in the index.
 * @returns {Promise<{
 *   totalPatients: number,
 *   totalSurgeries: number,
 *   averageAge: number,
 *   bySurgeryType: Record<string, number>,
 *   byGender: Record<string, number>,
 *   byRiskFactor: Record<string, number>,
 *   totalCalls: number,
 *   averageDaysInHospital: number | null,
 *   patientsDueFollowUp: number
 * }>}
 */
export async function getAnalytics() {
  const patients = await patientService.getAllPatients();
  const followUpPatients = await patientService.getPatientsForFollowup();

  const totalPatients = patients.length;
  const ages = patients.map((p) => p.age).filter((a) => typeof a === 'number');
  const averageAge = ages.length ? Math.round(sum(ages) / ages.length) : 0;

  const bySurgeryType = countBy(patients, (p) => p.surgery_type);
  const byGender = countBy(patients, (p) => normalizeGender(p.gender));

  const riskFactorCounts = {};
  for (const p of patients) {
    const factors = p.risk_factors || [];
    for (const f of factors) {
      if (f) riskFactorCounts[f] = (riskFactorCounts[f] || 0) + 1;
    }
  }

  let totalCalls = 0;
  const ageDistribution = {};
  for (const [,, label] of AGE_BUCKETS) ageDistribution[label] = 0;
  /** age_bucket -> { surgery_type: count } for age chart tooltip */
  const surgeryByAgeBucket = {};
  /** gender (Male/Female/Other) -> { surgery_type: count } for gender chart tooltip */
  const surgeryByGender = {};
  /** symptom -> surgery_type -> count (stacked chart: same surgery_type keys as bySurgeryType) */
  const symptomCountsBySurgery = {};
  /** Post-op days per patient = discharge_date − surgery_date (not stored in DB; derived from both dates). */
  const postOpDaysPerPatient = [];

  for (const p of patients) {
    totalCalls += (p.call_history || []).length;

    const surgeryDate = p.surgery_date ? new Date(p.surgery_date) : null;
    const dischargeDate = p.discharge_date ? new Date(p.discharge_date) : null;
    if (surgeryDate && dischargeDate && !Number.isNaN(surgeryDate.getTime()) && !Number.isNaN(dischargeDate.getTime())) {
      const days = Math.round((dischargeDate.getTime() - surgeryDate.getTime()) / 86400000);
      if (days >= 0) postOpDaysPerPatient.push(days);
    }

    const bucket = getAgeBucket(p.age);
    if (bucket) {
      ageDistribution[bucket] = (ageDistribution[bucket] || 0) + 1;
      const surgeryType = p.surgery_type != null && p.surgery_type !== '' ? String(p.surgery_type) : 'Unknown';
      if (!surgeryByAgeBucket[bucket]) surgeryByAgeBucket[bucket] = {};
      surgeryByAgeBucket[bucket][surgeryType] = (surgeryByAgeBucket[bucket][surgeryType] || 0) + 1;
    }

    // Use same key as surgery frequency graph (bySurgeryType): raw surgery_type
    const surgeryType = p.surgery_type != null && p.surgery_type !== '' ? String(p.surgery_type) : 'Unknown';

    const genderKey = normalizeGender(p.gender);
    if (genderKey) {
      if (!surgeryByGender[genderKey]) surgeryByGender[genderKey] = {};
      surgeryByGender[genderKey][surgeryType] = (surgeryByGender[genderKey][surgeryType] || 0) + 1;
    }

    // Count this patient once per symptom they mentioned in any call (percent = % of patients who mentioned it).
    // Use only transcript + reasoning_summary so we count what was said in the call, not matched_complications.
    const symptomsMentionedByThisPatient = new Set();
    for (const call of p.call_history || []) {
      const norm = normalizeCall(call);
      if (!norm) continue;
      const sym = extractSymptomsFromCallPatientMentions(norm);
      Object.keys(sym).forEach((symptom) => {
        if (NON_SYMPTOM_LABELS.has(symptom.toLowerCase())) return;
        symptomsMentionedByThisPatient.add(symptom);
      });
    }
    symptomsMentionedByThisPatient.forEach((symptom) => {
      if (!symptomCountsBySurgery[symptom]) symptomCountsBySurgery[symptom] = {};
      symptomCountsBySurgery[symptom][surgeryType] = (symptomCountsBySurgery[symptom][surgeryType] || 0) + 1;
    });
  }

  // Order of surgery types matching surgery frequency graph (same keys as bySurgeryType)
  const surgeryTypeOrder = Object.keys(bySurgeryType).sort();

  // Recovery trajectory: expected vs actual per surgery type (for dropdown chart)
  const { recoveryTrajectoryBySurgery, surgeryTypesForTrajectory } = computeRecoveryTrajectory(patients);

  const averageDaysInHospital =
    postOpDaysPerPatient.length > 0
      ? Math.round(sum(postOpDaysPerPatient) / postOpDaysPerPatient.length)
      : null;

  return {
    totalPatients,
    totalSurgeries: totalPatients,
    averageAge,
    averageDaysInHospital,
    ageDistribution,
    surgeryByAgeBucket,
    bySurgeryType,
    byGender,
    surgeryByGender,
    byRiskFactor: riskFactorCounts,
    totalCalls,
    patientsDueFollowUp: followUpPatients.length,
    symptomsFromCalls: symptomCountsBySurgery,
    surgeryTypeOrder,
    recoveryTrajectoryBySurgery,
    surgeryTypesForTrajectory,
  };
}
