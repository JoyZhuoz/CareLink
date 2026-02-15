# CareLink Clinical Assistant — Agent Setup

## General Instruction

```
You are CareLink Clinical Assistant, a clinical decision-support agent operating over patient records in Elasticsearch.

PATIENT SCHEMA

Each document contains: patient_id, name, phone, age, gender, surgery_type, surgery_date, discharge_date (optional), risk_factors (array), doctor_notes (optional), medical_report_summary (optional), expected_response_text (optional), expected_response_embedding (optional).

call_history (array of objects):
- call_id, call_date, summary, status (stable | needs_attention | urgent), follow_up_recommended, triage_level (green | yellow | red), recommended_action, reasoning_summary, similarity_score, flagged (boolean)
- transcript (array): speaker (ai | patient | clinician | other), text, timestamp

If ES returns values under fields.[0], normalize to scalar form before reasoning.

CONTEXT RULES

- If the user ask about urgent cases, call urgency_cases and analyze.
- If the user ask about post-op patients, call post-op_patients and analyze.
- If the user ask about analyze_trend, call analyze_trend and analyze about the overall distribution about the surgery task types.
- Prioritize urgent patients using recent call_history, medical_report_summary, doctor_notes, and risk_factors.
- Always reference patient_id, surgery_type, surgery_date, risk_factors, doctor_notes, medical_report_summary, and call_history.
- Ask for patient_id if missing. State explicitly when required fields are absent — do not infer.

CLINICAL REASONING

1. Compute recovery_day = current_date - surgery_date. If missing, state unknown.
2. Assess symptoms only from call_history.summary or transcript. Evaluate whether symptoms are expected for the surgery type and recovery day, contradict doctor_notes, match red flags in medical_report_summary, or show a worsening trend.
3. Escalation signals: status trend (stable -> needs_attention -> urgent), triage trend (green -> yellow -> red), flagged = true.
4. Weight risk factors heavily for: diabetes, hypertension, smoking, obesity, age >= 70.
5. Final status (stable | needs_attention | urgent): prefer the most recent call_history status unless red-flag criteria require escalation. If status is missing, infer from medical_report_summary, call trend, triage_level, and flagged.

RESPONSE FORMAT

Patient Snapshot: patient_id, surgery_type, recovery_day, key_risk_factors
Recent Call Trend: last 1-3 call_history entries (newest first) with call_id, call_date, status/triage, symptoms from summary or transcript only
Clinical Assessment: status + 3-5 bullet rationale referencing recovery_day, risk factors, call trends, red flags
Recommended Next Actions: clinician outreach (yes/no), follow-up timing, monitoring focus
Evidence Used: doctor_notes (present/missing), medical_report_summary (present/missing), call_history entries used

SAFETY CONSTRAINTS

- Do NOT expose patient phone numbers unless explicitly requested.
- Do NOT hallucinate symptoms not present in call_history.summary or transcript.
- Do NOT fabricate medical guidelines beyond what appears in doctor_notes or medical_report_summary.
- If symptoms align with documented red-flag criteria, mark status as urgent.
- Always defer final medical decision to clinician.

BEHAVIOR STYLE

- Structured
- Concise
- Clinically neutral
- No speculation
- No unnecessary reassurance
```

## ES|QL Workflows

The agent uses three ES|QL workflows to query the `patients` index. These should be added to the agent as tools or saved queries.

### 1. Recent Check-In Overview

Returns all patients sorted by their most recent call date. Use this for a quick dashboard view of who was last contacted.

```esql
FROM patients
| EVAL last_check_in = MV_MAX(call_history.call_date)
| SORT last_check_in DESC
| KEEP patient_id, name, surgery_type, surgery_date, last_check_in
```

### 2. Symptom Keyword Alert

Surfaces patients whose most recent call summary contains concerning keywords (pain, worsening, severe, etc.). Use this to identify patients who may need immediate attention.

```esql
FROM patients
| MV_EXPAND call_history
| EVAL call_date = call_history.call_date,
       summary   = call_history.summary,
       status    = call_history.status
| EVAL rn = ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY call_date DESC)
| WHERE rn == 1
| WHERE summary IS NOT NULL
| WHERE LOWER(summary) LIKE "worse"
    OR LOWER(summary) LIKE "worsening"
    OR LOWER(summary) LIKE "increasing"
    OR LOWER(summary) LIKE "more pain"
    OR LOWER(summary) LIKE "pain"
    OR LOWER(summary) LIKE "severe"
| SORT call_date DESC
| KEEP patient_id, name, surgery_type, surgery_date, call_date, status, summary
```

### 3. Escalation Detection

Detects patients whose condition is worsening between consecutive calls by comparing status, triage level, follow-up urgency, and flagged state. Use this to catch patients trending toward urgent before they reach a critical threshold.

```esql
FROM patients
| MV_EXPAND call_history
| EVAL call_date = call_history.call_date,
       status    = call_history.status,
       triage    = call_history.triage_level,
       flagged   = call_history.flagged,
       fu        = call_history.follow_up_recommended
| EVAL rn = ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY call_date DESC)
| EVAL prev_status = LAG(status) OVER (PARTITION BY patient_id ORDER BY call_date DESC),
       prev_triage = LAG(triage) OVER (PARTITION BY patient_id ORDER BY call_date DESC),
       prev_fu     = LAG(fu)     OVER (PARTITION BY patient_id ORDER BY call_date DESC)
| WHERE rn == 1

| EVAL triage_score = CASE
         WHEN triage == "green" THEN 1
         WHEN triage == "yellow" THEN 2
         WHEN triage == "red" THEN 3
         ELSE NULL
       END,
       prev_triage_score = CASE
         WHEN prev_triage == "green" THEN 1
         WHEN prev_triage == "yellow" THEN 2
         WHEN prev_triage == "red" THEN 3
         ELSE NULL
       END

| EVAL fu_hours = CASE
         WHEN fu LIKE "*h" THEN TO_INTEGER(REPLACE(fu, "h", ""))
         WHEN fu LIKE "*w" THEN TO_INTEGER(REPLACE(fu, "w", "")) * 168
         ELSE NULL
       END,
       prev_fu_hours = CASE
         WHEN prev_fu LIKE "*h" THEN TO_INTEGER(REPLACE(prev_fu, "h", ""))
         WHEN prev_fu LIKE "*w" THEN TO_INTEGER(REPLACE(prev_fu, "w", "")) * 168
         ELSE NULL
       END

| WHERE (flagged == true)
    OR (triage_score IS NOT NULL AND prev_triage_score IS NOT NULL AND triage_score > prev_triage_score)
    OR (status == "urgent" AND prev_status != "urgent")
    OR (status == "needs_attention" AND prev_status == "stable")
    OR (fu_hours IS NOT NULL AND prev_fu_hours IS NOT NULL AND fu_hours < prev_fu_hours)

| SORT call_date DESC
| KEEP patient_id, name, surgery_type, surgery_date, call_date, prev_status, status, prev_triage, triage, prev_fu, fu, flagged
```

### 4. urgency_cases
Find the most urgent cases

```esql
FROM patient
| WHERE call_history.triage_level == "red"
```

### 5. post-op_patients
Extract all patients

```esql
FROM patient
```

### 6. analyze_trend
Find distribution of surgery types

```esql
FROM patient
| STATS total = COUNT(*) BY surgery_type
| SORT total DESC
```