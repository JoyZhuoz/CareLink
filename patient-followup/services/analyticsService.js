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
 * Compute analytics stats from all patients in the index.
 * @returns {Promise<{
 *   totalPatients: number,
 *   totalSurgeries: number,
 *   averageAge: number,
 *   bySurgeryType: Record<string, number>,
 *   byGender: Record<string, number>,
 *   byRiskFactor: Record<string, number>,
 *   totalCalls: number,
 *   patientsWithCalls: number,
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
  let patientsWithCalls = 0;
  const ageDistribution = {};
  for (const [,, label] of AGE_BUCKETS) ageDistribution[label] = 0;
  const symptomCounts = {};

  for (const p of patients) {
    const n = (p.call_history || []).length;
    if (n > 0) patientsWithCalls += 1;
    totalCalls += n;

    const bucket = getAgeBucket(p.age);
    if (bucket) ageDistribution[bucket] = (ageDistribution[bucket] || 0) + 1;

    for (const call of p.call_history || []) {
      const sym = extractSymptomsFromCall(call);
      Object.entries(sym).forEach(([s, c]) => {
        symptomCounts[s] = (symptomCounts[s] || 0) + c;
      });
    }
  }

  return {
    totalPatients,
    totalSurgeries: totalPatients,
    averageAge,
    ageDistribution,
    bySurgeryType,
    byGender,
    byRiskFactor: riskFactorCounts,
    totalCalls,
    patientsWithCalls,
    patientsDueFollowUp: followUpPatients.length,
    symptomsFromCalls: symptomCounts,
  };
}
