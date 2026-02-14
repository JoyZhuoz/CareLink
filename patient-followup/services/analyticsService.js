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

/** Symptom keywords to extract from call transcripts (case-insensitive). */
const SYMPTOM_KEYWORDS = [
  'pain', 'swelling', 'fever', 'nausea', 'vomiting', 'dizziness', 'bleeding',
  'redness', 'drainage', 'shortness of breath', 'chest pain', 'infection',
  'numbness', 'stiffness', 'bruising', 'soreness', 'headache', 'fatigue',
  'constipation', 'diarrhea', 'insomnia', 'sleep', 'cough', 'wound',
  'complication', 'symptom', 'discomfort', 'tenderness', 'itching',
];

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

function getAgeBucket(age) {
  if (typeof age !== 'number' || age < 0) return null;
  for (const [lo, hi, label] of AGE_BUCKETS) {
    if (age >= lo && age <= hi) return label;
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
  const byGender = countBy(patients, (p) => p.gender);

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
    if (bucket) ageDistribution[bucket] = (ageDistribution[bucket] || 0) + 1;

    // Use same key as surgery frequency graph (bySurgeryType): raw surgery_type
    const surgeryType = p.surgery_type != null && p.surgery_type !== '' ? String(p.surgery_type) : 'Unknown';

    for (const call of p.call_history || []) {
      const norm = normalizeCall(call);
      if (!norm) continue;

      const sym = extractSymptomsFromCall(norm);
      Object.entries(sym).forEach(([symptom, count]) => {
        if (!symptomCountsBySurgery[symptom]) symptomCountsBySurgery[symptom] = {};
        symptomCountsBySurgery[symptom][surgeryType] = (symptomCountsBySurgery[symptom][surgeryType] || 0) + count;
      });
    }
  }

  // Order of surgery types matching surgery frequency graph (same keys as bySurgeryType)
  const surgeryTypeOrder = Object.keys(bySurgeryType).sort();

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
    bySurgeryType,
    byGender,
    byRiskFactor: riskFactorCounts,
    totalCalls,
    patientsDueFollowUp: followUpPatients.length,
    symptomsFromCalls: symptomCountsBySurgery,
    surgeryTypeOrder,
  };
}
