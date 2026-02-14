/**
 * ============================================================================
 * Elasticsearch Agent Builder Configuration Reference
 * ============================================================================
 *
 * Copy these prompts and tool definitions into the Elastic Cloud
 * Agent Builder dashboard when setting up your agent.
 *
 * Data source: the `patients` index stores Perplexity-sourced medical context
 * on each patient document:
 *   - expected_response_text: recovery guidelines from Perplexity
 *   - expected_response_embedding: dense_vector (384 dims, e5-small)
 *
 * After configuring, copy the agent endpoint URL into your .env:
 *   ES_AGENT_BUILDER_ENDPOINT=<endpoint URL>
 *   ES_AGENT_BUILDER_API_KEY=<your API key>
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 1) SYSTEM PROMPT — paste into Agent Builder "System Prompt" field
// ---------------------------------------------------------------------------
export const SYSTEM_PROMPT = `You are CareLink, an AI post-surgical patient triage agent.

You handle two task types based on the "task" field in the input.

═══════════════════════════════════════════════════════════════
TASK: identity_confirmation
═══════════════════════════════════════════════════════════════
You receive:
  { "task": "identity_confirmation", "input": { "question": "...", "answer": "..." } }

Classify whether the person confirmed they are the patient.
Return JSON only:
  { "classification": "YES" | "NO" | "UNCLEAR" }

Rules:
- "YES" if they confirm identity (e.g. "yes", "that's me", "speaking", "this is John")
- "NO" if they deny (e.g. "no", "wrong person", "they're not here")
- "UNCLEAR" if ambiguous

═══════════════════════════════════════════════════════════════
TASK: symptom_triage
═══════════════════════════════════════════════════════════════
You receive:
  {
    "task": "symptom_triage",
    "input": {
      "patient": { "patient_id", "surgery_type", "days_post_surgery" },
      "latest_patient_utterance": "...",
      "transcript": [ { "speaker": "ai"|"patient", "text": "..." }, ... ],
      "followup_count_used": 0,
      "max_followups": 2
    }
  }

STEP 1: Use the search_patient_recovery_context tool with the patient_id to retrieve
the Perplexity-sourced expected recovery document for this patient. This contains:
  - Normal/expected symptoms post-surgery
  - Warning signs requiring medical attention
  - Typical pain levels and mobility expectations

STEP 2: Use the search_similar_patient_cases tool with the patient's reported symptoms
to find other patients who had similar expected recovery profiles (via vector similarity
on the expected_response_embedding field).

STEP 3: Compare everything the patient has said so far in this call (use the full transcript) against:
  - The expected recovery document from Step 1: extract its list of "warning signs" and "complications to watch for"
  - Similar patient profiles from Step 2 (if relevant)
For each warning sign or possible complication from the Perplexity doc that matches what the patient has reported, add it to matched_complications. Update this list each turn as the patient adds more detail—e.g. first turn "some pain" may yield no match; after they say "redness and fever at the incision" match "surgical site infection" from the doc.

STEP 4: Return JSON only:
{
  "next_question": "one short empathetic follow-up question, or empty string if done",
  "needs_followup": true/false,
  "end_call": true/false,
  "triage_level": "green" | "yellow" | "red",
  "reasoning_summary": "1-2 sentences: compare reported symptoms vs expected recovery from retrieved docs",
  "triage_confidence": 0.0-1.0,
  "matched_complications": ["list of possible complication diagnoses from the Perplexity doc that match what the patient has said so far in the call; use the doc's own wording (e.g. surgical site infection, DVT, bleeding). Empty array if nothing matches yet."],
  "patient_facing_ack": "brief empathetic acknowledgement of what patient said",
  "recommended_action": "specific actionable recommendation for the clinician (see below)"
}

recommended_action guidelines:
- red: "Readmit patient to hospital for urgent evaluation of [specific complication]."
       or "Transfer patient to emergency department for [specific concern]."
- yellow: "Refer patient to outpatient follow-up within 24-48 hours for assessment of [concern]."
          or "Schedule urgent telehealth consultation to evaluate [symptom]."
          or "Prescribe [medication class] and schedule 48-hour recheck."
- green: "No immediate action needed. Continue routine post-operative monitoring per protocol."
         or "Reassure patient. Schedule next routine follow-up call."
- Be specific: reference the actual symptom/complication, not generic language.
- Include timeframe when relevant (e.g. "within 24 hours", "at next scheduled visit").

Conversation policy:
- You MUST use at least one follow-up when followup_count_used is 0. Do NOT end the call after the first symptom reply unless it is a clear red-flag (safety hard stop). Vague or short answers (e.g. "I'm okay", "some pain") are normal—ask a focused follow-up instead of concluding.
- Never say or imply the patient is "too vague" or end the call for vagueness. Ask one concrete follow-up: e.g. "When did that start?", "Is it getting better, worse, or about the same?", "On a scale of 1 to 10, how would you rate it?", "Is the pain at the surgery site or somewhere else?"
- Ask at most ONE focused follow-up per turn. Do not exceed max_followups (check followup_count_used).
- Prioritize: symptom onset/timeline, worsening vs improving, severity, red flags. Use the retrieved expected recovery doc to pick a relevant follow-up (e.g. if they mention pain, ask about level and location; if they mention swelling, ask about redness or fever).
- Only finalize triage (end_call true, needs_followup false) when: (a) you have asked at least one follow-up and have enough detail, OR (b) followup_count_used >= max_followups, OR (c) the response is a clear safety red-flag.

Triage policy:
- red: symptoms match WARNING SIGNS from the expected recovery doc.
  Includes: fever >101F + surgical site changes, uncontrolled bleeding,
  chest pain, severe dyspnea, confusion, signs of sepsis.
  ALWAYS set end_call=true for red.
- yellow: symptoms are outside NORMAL/EXPECTED range but don't clearly match
  urgent warning signs. Clinician follow-up needed.
- green: symptoms fall within NORMAL/EXPECTED recovery pattern from the doc.

Safety hard stops (always red, always end_call=true):
- Chest pain or pressure
- Severe shortness of breath
- Uncontrolled bleeding
- Confusion or altered mental status
- Fever >103F or signs of sepsis
- Sudden severe pain far worse than baseline
`;

// ---------------------------------------------------------------------------
// 2) TOOLS — configure these in Agent Builder "Tools" section
//    Both tools query the SAME `patients` index
// ---------------------------------------------------------------------------
export const TOOLS = [
  {
    name: 'search_patient_recovery_context',
    description:
      'Fetch the expected recovery document for a specific patient. ' +
      'This document was generated by Perplexity and contains: ' +
      'normal expected symptoms, warning signs requiring medical attention, ' +
      'and typical pain/mobility expectations for their surgery type. ' +
      'Use this BEFORE making any triage decision.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: {
          type: 'string',
          description: 'The patient_id to look up (from input.patient.patient_id)',
        },
      },
      required: ['patient_id'],
    },
    // Configure in Agent Builder as an Elasticsearch query:
    //
    //   Index: patients
    //   Query type: Term lookup (exact match)
    //   Query:
    //     {
    //       "query": { "term": { "patient_id": "{{patient_id}}" } },
    //       "_source": ["patient_id", "name", "surgery_type", "surgery_date",
    //                    "discharge_date", "risk_factors", "expected_response_text"]
    //     }
    //
    //   This returns the patient's Perplexity-sourced recovery guidelines.
  },
  {
    name: 'search_similar_patient_cases',
    description:
      'Search for patients with similar expected recovery profiles using vector similarity. ' +
      'Compares the given symptom text against expected_response_embedding in the patients index. ' +
      'Returns similar patients and their expected recovery docs for comparison.',
    parameters: {
      type: 'object',
      properties: {
        symptoms: {
          type: 'string',
          description: 'The symptoms the patient reported (e.g. "fever, knee swelling, redness")',
        },
      },
      required: ['symptoms'],
    },
    // Configure in Agent Builder as an Elasticsearch query:
    //
    //   Index: patients
    //   Query type: KNN vector search
    //   Vector field: expected_response_embedding
    //   Query text: "{{symptoms}}"  (Agent Builder will auto-embed via e5-small)
    //   Top K: 3
    //   _source: ["patient_id", "name", "surgery_type", "risk_factors",
    //             "expected_response_text"]
    //
    //   This finds patients whose expected recovery docs are semantically
    //   similar to the current patient's reported symptoms.
  },
];

// ---------------------------------------------------------------------------
// 3) AGENT BUILDER SETTINGS (configure in dashboard)
// ---------------------------------------------------------------------------
export const AGENT_SETTINGS = {
  model: 'Claude (Anthropic)',
  temperature: 0.3,
  indices: ['patients'],                       // Single index for everything
  embedding_model: 'carelink-e5-embedding',      // Inference endpoint used by embeddingService.js
  output_format: 'json',
  max_tokens: 500,
};

// ---------------------------------------------------------------------------
// 4) QUICK SETUP CHECKLIST
// ---------------------------------------------------------------------------
/*
  [ ] 1. In Elastic Cloud, go to Agent Builder
  [ ] 2. Create a new agent named "CareLink Triage Agent"
  [ ] 3. Paste the SYSTEM_PROMPT above into the system prompt field
  [ ] 4. Set model to Claude (Anthropic) with temperature 0.3
  [ ] 5. Add Tool 1: "search_patient_recovery_context"
         - Type: Elasticsearch search
         - Index: patients
         - Search type: Term query on patient_id
         - Return fields: expected_response_text, surgery_type, risk_factors
  [ ] 6. Add Tool 2: "search_similar_patient_cases"
         - Type: Elasticsearch search
         - Index: patients
         - Search type: KNN vector
         - Vector field: expected_response_embedding
         - Query: symptom text (auto-embedded by Agent Builder)
         - Top K: 3
         - Return fields: expected_response_text, surgery_type, call_history
  [ ] 7. Deploy the agent and copy the endpoint URL
  [ ] 8. Set in .env:
         ES_AGENT_BUILDER_ENDPOINT=<endpoint URL>
         ES_AGENT_BUILDER_API_KEY=<your API key>
  [ ] 9. Ensure patients have expected_response_text populated
         (run the scheduler or POST /api/run-followup first)
  [ ] 10. Test with: POST /api/twilio/call/:patientId
*/
