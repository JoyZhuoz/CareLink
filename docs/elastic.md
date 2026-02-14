# CareLink — Implementation Plan

## THINGS YOU MUST FOLLOW:

1. write test for each step to make sure it work. document the tests in a separate file
2. write everything in node.js and express
3. skip the twilio implementation and perplexity call implementation.

## Goal
Reduce preventable hospital readmissions by detecting post-surgery issues early through AI-assisted daily voice check-ins and clinician-facing summaries.

## One-Sentence Flow
Doctor uploads patient data → Elastic ingest pipeline (PDF extraction → chunking → Jina embeddings) → Claude generates a care plan → Perplexity results are pre-fetched and stored → each day, a cron job assembles pre-call context from Elasticsearch (care plan + call history + clinician flags + stored Perplexity results) → triggers a Twilio outbound voice call with Claude → after the call, Claude generates a clinician summary stored back in Elasticsearch.

---

## Tech Stack

| Component | Tool |
|---|---|
| Data storage + vector search | Elasticsearch on Elastic Cloud (dev tier) |
| Embeddings | Jina embeddings v3 via Elastic inference endpoint |
| PDF extraction | Elastic attachment processor (Apache Tika) |
| Chunking + indexing | Elastic `semantic_text` field type (auto-chunks + auto-embeds) |
| Orchestration + API server | Node.js / Express |
| Scheduling | node-cron (daily pre-call jobs) |
| LLM | Claude (Anthropic API) via `@anthropic-ai/sdk` |
| Voice calls | Twilio (outbound calls, STT, TTS) |
| Medical context search | Perplexity API (pre-fetched, stored in `medical_references` index) |
| Clinician UI | Kibana (built-in with Elastic Cloud) |
| ES client | `@elastic/elasticsearch` npm package |

---

## Elastic-Native Features: What We Can Use vs What Needs Node.js

### What Elastic handles natively today (GA, works on dev tier)

| Feature | What it does for us | API |
|---|---|---|
| **Jina inference endpoint** | Embeds patient docs at index time | `PUT /_inference/text_embedding/jina-embeddings` with `service: "jinaai"` |
| **`semantic_text` field** | Auto-chunks + auto-embeds, zero code | Set field type to `semantic_text` in mapping |
| **Attachment processor** | Extracts text from PDFs (Apache Tika) | Ingest pipeline with `attachment` processor |
| **Inference processor** | Calls any inference endpoint during ingest | Ingest pipeline with `inference` processor |

### What Elastic offers but we can't use yet

| Feature | Status | Why not | Path forward |
|---|---|---|---|
| **Elastic Inference API (Anthropic `completion`)** | GA since 8.11, Platinum+ tier | Dev/free tier doesn't include it. Also only supports single-turn `completion`, not `chat_completion` — no conversation state | If we upgrade to Platinum, we could route care plan + summary generation through `PUT /_inference/completion/claude` instead of calling Anthropic SDK directly. Centralizes API keys in Elastic. |
| **Agent Builder** | GA in 9.3, Enterprise tier only | Requires Enterprise tier and Elastic 9.3. No direct Anthropic connector — Claude only accessible via Bedrock. Designed for conversational agents over ES data, not deterministic pipelines. | Could eventually replace our voice call agent logic — define a CareLink agent with tools that query `care_plans`, `check_in_calls`, etc. But Twilio integration still needs custom code. |
| **Elastic Workflows** | Tech Preview in 9.3, Platinum+ | Not production-ready. APIs may change. Claude only via Bedrock. YAML-based, limited for complex logic. | When GA, could replace our cron jobs: `scheduled trigger → elasticsearch.search → ai.prompt → elasticsearch.request → slack`. Watch for GA announcement (likely late 2026). |

### What must stay in Node.js regardless

These require custom code no matter what Elastic features you adopt:

1. **Twilio voice call handling** — No Elastic feature handles real-time TwiML webhook loops. Express routes for `POST /api/twilio/voice-handler` and `POST /api/twilio/call-status` are required.
2. **Multi-turn Claude conversation during calls** — In-memory conversation state, streaming JSON responses, parsing `next_action` — this is application logic, not search/data platform territory.
3. **Perplexity pre-fetch** — Elastic has no Perplexity connector. Custom `fetch()` call required.
4. **PDF upload endpoint** — Express route with multer to accept files and feed them to the ingest pipeline.

### Recommendation

**Build with Node.js now. Adopt Elastic-native features incrementally:**

- **Now:** Use Elastic for everything it's good at today — storage, embeddings (Jina), ingest pipelines (PDF + chunking), semantic search, Kibana dashboards. Node.js handles all orchestration and external API calls.
- **If you upgrade to Platinum (8.11+):** Move Claude calls for care plan + summary generation to Elastic's Inference API (`completion` task type). This centralizes API key management and lets you call Claude from ingest pipelines directly.
- **When Elastic 9.3 Enterprise is available:** Evaluate Agent Builder for the care plan Q&A / data retrieval parts. Evaluate Workflows for replacing cron jobs (pre-call context assembly, call triggers).
- **Twilio + conversation loop stays in Node.js permanently.** No Elastic feature replaces this.

---

## Part 1: Process Patient Data

**Goal:** Turn uploaded discharge notes into a searchable, embedded knowledge base in Elasticsearch.

### 1.1 Set Up Elastic Cloud + Indices

**Where:** Elastic Cloud console + one-time setup script

- Provision an Elastic Cloud deployment (dev tier)
- Configure Jina embedding model as an inference endpoint:
```
PUT _inference/text_embedding/jina-embeddings
{
  "service": "jinaai",
  "service_settings": {
    "api_key": "<JINA_API_KEY>",
    "model_id": "jina-embeddings-v3",
    "similarity": "cosine",
    "dimensions": 1024
  },
  "task_settings": {
    "input_type": "ingest"
  }
}
```

- Create indices (via setup script or Kibana dev tools):

**`patient_documents`** — uses `semantic_text` for automatic chunking + embedding:
```json
{
  "mappings": {
    "properties": {
      "patient_id": { "type": "keyword" },
      "doc_type": { "type": "keyword" },
      "content": {
        "type": "semantic_text",
        "inference_id": "jina-embeddings"
      },
      "raw_text": { "type": "text" },
      "uploaded_at": { "type": "date" }
    }
  }
}
```
> `semantic_text` handles chunking (~250 words, sentence boundaries) and calls Jina automatically at index time. No manual chunking code needed.

**`care_plans`**:
```json
{
  "mappings": {
    "properties": {
      "patient_id": { "type": "keyword" },
      "patient_name": { "type": "text" },
      "phone_number": { "type": "keyword" },
      "surgery_type": { "type": "keyword" },
      "surgery_date": { "type": "date" },
      "monitor_items": { "type": "text" },
      "check_in_questions": { "type": "text" },
      "call_frequency": { "type": "keyword" },
      "next_call_date": { "type": "date" },
      "created_at": { "type": "date" }
    }
  }
}
```

**`medical_references`** — pre-fetched Perplexity results, stored per patient per recovery stage:
```json
{
  "mappings": {
    "properties": {
      "patient_id": { "type": "keyword" },
      "surgery_type": { "type": "keyword" },
      "recovery_day_range": { "type": "keyword" },
      "query_used": { "type": "text" },
      "perplexity_response": { "type": "object", "enabled": false },
      "recovery_milestones": { "type": "text" },
      "red_flag_symptoms": { "type": "text" },
      "common_concerns": { "type": "text" },
      "fetched_at": { "type": "date" }
    }
  }
}
```
> Perplexity results are fetched **ahead of time** (at care plan creation + periodically) and stored here. The daily pre-call workflow reads from this index — it does NOT call Perplexity at call time.

**`check_in_calls`**, **`clinician_summaries`**, **`call_queue`** — schemas defined in Parts 2-3 below.

### 1.2 Build the Ingest Pipeline

**Where:** Elastic ingest pipeline (native) + Express upload route (Node.js)

Create an Elastic ingest pipeline for PDF extraction:
```
PUT _ingest/pipeline/patient-doc-pipeline
{
  "processors": [
    {
      "attachment": {
        "field": "data",
        "target_field": "attachment"
      }
    },
    {
      "set": {
        "field": "raw_text",
        "value": "{{attachment.content}}"
      }
    },
    {
      "set": {
        "field": "content",
        "value": "{{attachment.content}}"
      }
    },
    {
      "remove": {
        "field": ["data", "attachment"]
      }
    }
  ]
}
```

Express upload route (`POST /api/patients/:patientId/documents`):
1. Accept PDF file upload (multer) or raw text body
2. If PDF: base64-encode the file, index via `patient-doc-pipeline`
3. If text: index directly (the `semantic_text` field auto-chunks + embeds)
4. Elasticsearch handles the rest — chunking, Jina embeddings, storage

### 1.3 Generate Care Plan

**Where:** Node.js (Express route, triggered after upload)

Express route (`POST /api/patients/:patientId/care-plan`), called after document upload:

1. Query `patient_documents` to retrieve all docs for the patient:
```js
const results = await esClient.search({
  index: 'patient_documents',
  query: { term: { patient_id: patientId } }
});
```

2. Call Claude API with the full patient context:
```js
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  system: 'You are a clinical assistant generating a post-surgical monitoring plan...',
  messages: [{ role: 'user', content: `Patient documents:\n${allDocText}\n\nGenerate a care plan...` }]
});
```
Prompt asks Claude to extract:
- Top 3-5 things to monitor (e.g., infection signs, pain level, mobility)
- Check-in questions tailored to this patient
- Default call frequency (daily)

3. Parse Claude's response and index into `care_plans`:
```js
await esClient.index({
  index: 'care_plans',
  document: {
    patient_id: patientId,
    patient_name, phone_number, surgery_type, surgery_date,
    monitor_items: parsed.monitor_items,
    check_in_questions: parsed.check_in_questions,
    call_frequency: 'daily',
    next_call_date: tomorrow,
    created_at: new Date()
  }
});
```

**Deliverable:** Upload a PDF → see embedded chunks in `patient_documents` → see a care plan in `care_plans`.

### 1.4 Pre-Fetch Perplexity Medical References

**Where:** Node.js — runs after care plan creation, and on a weekly refresh

After a care plan is created, immediately fetch Perplexity results for the key recovery stages this patient will go through:

```js
// server/services/perplexityService.js
async function prefetchMedicalReferences(patientId, surgeryType) {
  // Fetch references for multiple recovery windows upfront
  const dayRanges = ['day 1-3', 'day 4-7', 'day 8-14', 'day 15-30'];

  for (const range of dayRanges) {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{
          role: 'user',
          content: `${surgeryType} recovery ${range}:
                    expected recovery milestones, warning signs,
                    red flag symptoms, and common patient concerns.`
        }]
      })
    });

    const data = await response.json();

    await esClient.index({
      index: 'medical_references',
      document: {
        patient_id: patientId,
        surgery_type: surgeryType,
        recovery_day_range: range,
        query_used: `${surgeryType} recovery ${range}`,
        perplexity_response: data,
        recovery_milestones: extractMilestones(data),
        red_flag_symptoms: extractRedFlags(data),
        common_concerns: extractConcerns(data),
        fetched_at: new Date()
      }
    });
  }
}
```

This means:
- At patient onboarding, we fetch references for **all expected recovery windows** in one batch
- The daily pre-call workflow just reads from `medical_references` — no Perplexity latency at call time
- A weekly cron job can refresh stale entries (e.g., if a patient's recovery extends beyond 30 days)

**Deliverable:** After care plan creation, `medical_references` has 4 entries covering the full recovery timeline for this patient.

---

## Part 2: Create Pre-Call Context

**Goal:** Before each outbound call, assemble everything Claude needs to conduct a knowledgeable, personalized check-in — combining patient-specific data, call history, and real-time medical context.

The quality of the call depends entirely on the quality of this context. Claude can only be as good as what we give it.

### 2.1 Context Sources (What Claude Needs to Know)

The pre-call context is assembled from **four sources**, each providing a different layer of knowledge:

#### Source A: Care Plan (from Elasticsearch `care_plans`)
What the doctor originally flagged for this patient.
- `monitor_items[]` — e.g., "watch for redness around incision", "track pain level 1-10"
- `check_in_questions[]` — e.g., "Have you noticed any swelling?", "Are you able to walk to the bathroom?"
- `surgery_type`, `days_since_surgery` (computed from `surgery_date`)

#### Source B: Call History (from Elasticsearch `check_in_calls`)
What happened in previous calls — retrieve the **last 3 call transcripts**.
- Full transcript of each call
- Any patient-reported symptoms or concerns
- Trend data: is pain going up or down? Is mobility improving?

#### Source C: Clinician Flags (from Elasticsearch `clinician_summaries`)
What clinicians have noted after reviewing prior summaries.
- Any `concerning_findings` from previous summaries
- Any `recommended_action` that was "schedule outreach" or "urgent"
- Whether the clinician added manual notes (future: annotation field)

#### Source D: Medical References (from Elasticsearch `medical_references`)
Pre-fetched Perplexity results for this patient's surgery type and current recovery stage.
- Already stored at care plan creation time (see 1.4)
- Queried by `patient_id` + matching `recovery_day_range` for current `days_since_surgery`
- Contains:
  - `recovery_milestones` — what's expected at this stage
  - `red_flag_symptoms` — what needs immediate attention
  - `common_concerns` — what patients typically worry about now
- **No Perplexity API call at context assembly time** — just an Elasticsearch read

### 2.2 Context Assembly Workflow

**Where:** Node.js scheduled job (node-cron), runs daily at 7:00 AM

```js
// server/jobs/preCallContextBuilder.js
const cron = require('node-cron');

cron.schedule('0 7 * * *', async () => {
  // Step 1: Find today's patients
  const patients = await esClient.search({
    index: 'care_plans',
    query: { range: { next_call_date: { lte: 'now/d' } } }
  });

  for (const patient of patients.hits.hits) {
    await buildContextForPatient(patient._source);
  }
});
```

`buildContextForPatient()` — all four sources are Elasticsearch reads, no external API calls:

```js
async function buildContextForPatient(carePlan) {
  const { patient_id, surgery_type, surgery_date } = carePlan;
  const daysSinceSurgery = daysBetween(surgery_date, new Date());
  const dayRange = getDayRange(daysSinceSurgery); // e.g., 'day 4-7'

  // Step 2: Fetch all four sources in parallel — all Elasticsearch reads
  const [callHistory, clinicianFlags, medicalRef] = await Promise.all([
    // Source B: last 3 call transcripts
    esClient.search({
      index: 'check_in_calls',
      query: { term: { patient_id } },
      sort: [{ called_at: 'desc' }],
      size: 3
    }),
    // Source C: last 3 clinician summaries
    esClient.search({
      index: 'clinician_summaries',
      query: { term: { patient_id } },
      sort: [{ generated_at: 'desc' }],
      size: 3
    }),
    // Source D: pre-fetched Perplexity results for current recovery stage
    esClient.search({
      index: 'medical_references',
      query: {
        bool: {
          must: [
            { term: { patient_id } },
            { term: { recovery_day_range: dayRange } }
          ]
        }
      },
      size: 1
    })
  ]);

  // Step 3: Call Claude to synthesize a pre-call briefing
  const briefing = await claudeService.generatePreCallBriefing({
    carePlan,
    daysSinceSurgery,
    callHistory: callHistory.hits.hits.map(h => h._source),
    clinicianFlags: clinicianFlags.hits.hits.map(h => h._source),
    medicalReference: medicalRef.hits.hits[0]?._source
  });

  // Step 4: Write to call_queue
  await esClient.index({
    index: 'call_queue',
    document: {
      patient_id,
      patient_name: carePlan.patient_name,
      phone_number: carePlan.phone_number,
      pre_call_briefing: briefing,
      medical_reference_used: medicalRef.hits.hits[0]?._id,
      scheduled_at: new Date(),
      status: 'pending',
      retry_count: 0
    }
  });
}
```

The only external API call in this workflow is Claude (Step 3). All data sources are Elasticsearch reads.

### 2.3 Claude Pre-Call Briefing Prompt

**Where:** Node.js — Claude API call inside `buildContextForPatient()`

Claude receives all four sources and generates a structured briefing:

```
You are preparing a context briefing for an AI health check-in call.
The AI agent will use this briefing to conduct a voice call with the patient.

PATIENT CONTEXT:
- Surgery: {surgery_type}
- Days since surgery: {days_since_surgery}
- Care plan monitor items: {monitor_items}

CALL HISTORY:
{last_3_transcripts}

CLINICIAN NOTES:
{clinician_summaries}

MEDICAL REFERENCE (from web search):
{perplexity_results}

Generate a briefing with these sections:

1. OPENING (how to greet this patient — use their name, reference
   where they are in recovery)

2. PRIORITY QUESTIONS (ordered list, max 5)
   - The most important questions to ask today
   - For each: WHY this question matters right now
   - Include expected "normal" answers vs "concerning" answers

3. FOLLOW-UPS FROM LAST CALL
   - Anything the patient mentioned that needs revisiting
   - Any trends to probe (e.g., "pain was 6 last call, was 7 before that")

4. RED FLAGS
   - Specific patient responses that should trigger immediate concern
   - Based on medical reference: what symptoms at this recovery stage
     are emergencies

5. CONVERSATION GUIDELINES
   - Tone guidance (e.g., "patient was anxious last call, be reassuring")
   - Topics to avoid or be gentle about
   - Expected call duration
```

### 2.4 Call Queue Index

**Where:** Elasticsearch index, written to by Node.js context builder

`call_queue` schema:
```json
{
  "mappings": {
    "properties": {
      "patient_id": { "type": "keyword" },
      "patient_name": { "type": "text" },
      "phone_number": { "type": "keyword" },
      "pre_call_briefing": { "type": "object", "enabled": false },
      "medical_reference_used": { "type": "keyword" },
      "scheduled_at": { "type": "date" },
      "status": { "type": "keyword" },
      "call_sid": { "type": "keyword" },
      "completed_at": { "type": "date" },
      "retry_count": { "type": "integer" }
    }
  }
}
```

> `"enabled": false` on briefing = stored as-is, not indexed for search. `medical_reference_used` is a doc ID pointing to the `medical_references` entry used — avoids duplicating Perplexity data.

**Deliverable:** Each morning, `call_queue` is populated with one entry per patient. Each entry contains a rich briefing that tells Claude exactly what to ask, why, and what answers to watch for.

---

## Part 3: Build Voice Agent Workflow

**Goal:** Execute the outbound call via Twilio and conduct a real-time AI conversation where Claude uses the pre-call briefing to guide a natural check-in.

### 3.1 Twilio Outbound Call Trigger

**Where:** Node.js scheduled job, runs after pre-call context is built (e.g., 8:00 AM)

```js
// server/jobs/callTrigger.js
async function processCallQueue() {
  const pending = await esClient.search({
    index: 'call_queue',
    query: { term: { status: 'pending' } },
    sort: [{ scheduled_at: 'asc' }],
    size: 1  // MVP: one call at a time
  });

  for (const entry of pending.hits.hits) {
    const call = await twilioClient.calls.create({
      to: entry._source.phone_number,
      from: TWILIO_PHONE_NUMBER,
      url: `${SERVER_URL}/api/twilio/voice-handler?queueId=${entry._id}`,
      statusCallback: `${SERVER_URL}/api/twilio/call-status?queueId=${entry._id}`
    });

    await esClient.update({
      index: 'call_queue', id: entry._id,
      doc: { status: 'in_progress', call_sid: call.sid }
    });
  }
}
```

Rate limit: max 1 concurrent call for MVP. Process next after current completes.

### 3.2 Claude System Prompt for the Call

**Where:** Node.js — loaded when Twilio webhook fires on call connect

When the call connects, Claude is initialized with a system prompt built from the pre-call briefing. This is the **most important prompt in the system** — it determines call quality.

```
You are a friendly, patient health check-in assistant calling on behalf
of {patient_name}'s care team. You are calling {patient_name} to check
on their recovery after {surgery_type} ({days_since_surgery} days ago).

YOUR BRIEFING:
{pre_call_briefing from call_queue}

CONVERSATION RULES:
- Keep your language simple and warm. You are talking to a patient, not
  a doctor.
- Ask ONE question at a time. Wait for the full response.
- Do NOT diagnose. Do NOT give medical advice. You are collecting
  information.
- If the patient reports something from the RED FLAGS list, calmly
  acknowledge it, tell them their care team will follow up today,
  and note it with [URGENT] in the transcript.
- If the patient asks a medical question you can't answer, say:
  "That's a great question — I'll make sure your care team sees it
  and gets back to you."
- Keep the call under 5 minutes. Prioritize the PRIORITY QUESTIONS.
- End by thanking them and confirming when the next call will be.

OUTPUT FORMAT:
After each patient response, return JSON:
{
  "spoken_reply": "what to say next (sent to Twilio TTS)",
  "internal_note": "clinical observation for the transcript",
  "next_action": "ask_followup | next_question | end_call",
  "urgency": "normal | elevated | urgent",
  "question_index": 2
}
```

### 3.3 Voice Conversation Loop

**Where:** Express route (`POST /api/twilio/voice-handler`) — Twilio webhook

The webhook server handles the real-time call flow:

```
CALL CONNECTS → Twilio hits POST /api/twilio/voice-handler?queueId=X
  │
  ├─ Load pre_call_briefing from call_queue (by queueId)
  ├─ Initialize Claude conversation with system prompt (3.2)
  ├─ Store conversation state in memory (Map keyed by call_sid)
  ├─ Return TwiML: <Say> opening greeting, then <Gather> for patient speech
  │
  ▼
┌─── CONVERSATION TURN (Twilio re-hits webhook with STT result) ◄────┐
│  1. Extract patient speech from req.body.SpeechResult              │
│  2. Append to conversation history (in-memory Map)                 │
│  3. Send to Claude:                                                │
│     - System prompt (stays constant)                               │
│     - Full conversation so far                                     │
│     - Current question index                                       │
│  4. Claude returns JSON response                                   │
│  5. Parse response, return TwiML:                                  │
│     ├─ "ask_followup" → <Say> follow-up, <Gather> ────────────────┘
│     ├─ "next_question" → <Say> next Q, <Gather> ──────────────────┘
│     └─ "end_call" → <Say> closing, <Hangup>
│                                                                     │
│  If urgency == "urgent":                                            │
│     → Flag in transcript with [URGENT]                              │
│     → Will trigger priority clinician summary                       │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
CALL ENDS → Twilio hits POST /api/twilio/call-status?queueId=X
  ├─ Retrieve conversation state from in-memory Map
  ├─ Compile full transcript
  ├─ esClient.index → store in `check_in_calls`
  ├─ esClient.update → `call_queue` status = completed
  ├─ Delete conversation state from memory
  ├─ Trigger clinician summary generation (3.5)
  └─ Update `care_plans` next_call_date to tomorrow
```

**Conversation state** is held in an in-memory Map during the call (keyed by `call_sid`). Only the final transcript is persisted to Elasticsearch. For MVP this is fine — a single server handles one call at a time.

### 3.4 Transcript Storage

**Where:** Elasticsearch `check_in_calls` index, written by Node.js after call ends

Schema:
```json
{
  "mappings": {
    "properties": {
      "patient_id": { "type": "keyword" },
      "call_sid": { "type": "keyword" },
      "transcript": { "type": "object", "enabled": false },
      "questions_asked": { "type": "text" },
      "questions_skipped": { "type": "text" },
      "overall_urgency": { "type": "keyword" },
      "call_duration_seconds": { "type": "integer" },
      "called_at": { "type": "date" }
    }
  }
}
```

Each transcript entry in the array:
- `speaker` (agent | patient)
- `text`
- `internal_note` (Claude's clinical observations, not spoken)
- `urgency` (normal | elevated | urgent)
- `timestamp`

### 3.5 Generate Clinician Summary

**Where:** Node.js — called immediately after transcript is stored

```js
async function generateClinicianSummary(callDoc, queueEntry) {
  // 1. Fetch context in parallel — all Elasticsearch reads
  const [carePlan, medicalRef] = await Promise.all([
    esClient.search({
      index: 'care_plans',
      query: { term: { patient_id: callDoc.patient_id } },
      size: 1
    }),
    queueEntry.medical_reference_used
      ? esClient.get({ index: 'medical_references', id: queueEntry.medical_reference_used })
      : null
  ]);

  // 2. Call Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    system: 'You are generating a clinical summary for a care team...',
    messages: [{ role: 'user', content: buildSummaryPrompt(carePlan, medicalRef, callDoc) }]
  });

  // 3. Store in Elasticsearch
  await esClient.index({ index: 'clinician_summaries', document: parseSummary(response) });
}
```

Claude summary prompt:
```
You are generating a clinical summary for a care team.
Be concise and actionable. Use medical terminology appropriate
for clinicians.

CARE PLAN:
{care_plan}

MEDICAL REFERENCE USED:
{perplexity_results}

CALL TRANSCRIPT:
{transcript}

Generate:
1. PATIENT STATUS (1 sentence — overall impression)
2. NORMAL FINDINGS — what aligns with expected recovery
3. CONCERNING FINDINGS — what deviates, with specific quotes
   from the patient
4. COMPARISON TO LAST CALL — better / worse / unchanged,
   with specifics
5. RECOMMENDED ACTION — one of:
   - "Continue monitoring" (routine, next scheduled call)
   - "Schedule outreach" (clinician should call within 24h)
   - "Urgent review" (needs same-day clinical attention)
6. OPEN QUESTIONS — anything the patient asked that needs
   a clinician's answer
```

If `overall_urgency` from the call was `urgent`:
- Tag the summary as `priority: true`
- (Future: trigger an alert to the clinician via email/Slack)

`clinician_summaries` schema:
```json
{
  "mappings": {
    "properties": {
      "patient_id": { "type": "keyword" },
      "call_id": { "type": "keyword" },
      "patient_status": { "type": "text" },
      "normal_findings": { "type": "text" },
      "concerning_findings": { "type": "text" },
      "comparison_to_last_call": { "type": "text" },
      "recommended_action": { "type": "keyword" },
      "open_questions": { "type": "text" },
      "priority": { "type": "boolean" },
      "summary_text": { "type": "text" },
      "generated_at": { "type": "date" }
    }
  }
}
```

**Deliverable:** Patient receives a call → Claude conducts a context-aware check-in → clinician sees a structured, actionable summary in Kibana.

---

## Project Structure

```
carelink/
├── server/
│   ├── server.js                  # Express app, starts cron jobs
│   ├── config/
│   │   └── elasticsearch.js       # ES client setup
│   ├── routes/
│   │   ├── patients.js            # POST /api/patients/:id/documents
│   │   │                          # POST /api/patients/:id/care-plan
│   │   ├── twilio.js              # POST /api/twilio/voice-handler
│   │   │                          # POST /api/twilio/call-status
│   │   └── admin.js               # GET /api/call-queue, manual triggers
│   ├── services/
│   │   ├── elasticService.js      # All Elasticsearch queries
│   │   ├── claudeService.js       # All Claude API calls (care plan, briefing, conversation, summary)
│   │   ├── perplexityService.js   # Pre-fetch + store medical references at onboarding
│   │   └── twilioService.js       # Twilio call management
│   ├── jobs/
│   │   ├── preCallContextBuilder.js  # 7 AM cron: build call_queue (ES reads only)
│   │   ├── callTrigger.js            # 8 AM cron: process call_queue
│   │   └── refreshMedicalRefs.js     # Weekly cron: refresh stale Perplexity data
│   ├── prompts/
│   │   ├── carePlan.js            # Care plan generation prompt
│   │   ├── preCallBriefing.js     # Pre-call briefing prompt (Section 2.3)
│   │   ├── callConversation.js    # Voice call system prompt (Section 3.2)
│   │   └── clinicianSummary.js    # Summary generation prompt (Section 3.5)
│   └── setup/
│       └── createIndices.js       # One-time: create all ES indices + inference endpoint
├── tests/
│   ├── phase1.test.js             # Ingest pipeline + care plan tests
│   ├── phase2.test.js             # Pre-call context assembly tests
│   ├── phase3.test.js             # Voice call + summary tests
│   └── integration.test.js        # End-to-end flow
├── .env.example
└── package.json
```

---

## Implementation Order

| Phase | What | Where | Depends On | How to Test |
|---|---|---|---|---|
| **Phase 1** | Elastic Cloud + indices + Jina endpoint | Elastic console + `setup/createIndices.js` | Nothing | Indices exist, Jina endpoint returns embeddings |
| **Phase 2** | PDF ingest pipeline + upload route | Elastic pipeline + `routes/patients.js` | Phase 1 | Upload PDF, see chunks with vectors in `patient_documents` |
| **Phase 3** | Care plan generation | `services/claudeService.js` + `routes/patients.js` | Phase 2 | Care plan appears in `care_plans` after upload |
| **Phase 4** | Perplexity pre-fetch at onboarding | `services/perplexityService.js` | Phase 3 | After care plan creation, `medical_references` has entries for all recovery windows |
| **Phase 5** | Pre-call context assembly + call queue | `jobs/preCallContextBuilder.js` | Phase 3 + 4 | Run job, see populated `call_queue` with full briefing (no external API calls except Claude) |
| **Phase 6** | Twilio outbound trigger | `jobs/callTrigger.js` + `services/twilioService.js` | Phase 5 | Outbound call connects to test phone number |
| **Phase 7** | Voice conversation loop | `routes/twilio.js` + `services/claudeService.js` | Phase 6 | Complete a 3-5 question call, transcript stored in `check_in_calls` |
| **Phase 8** | Clinician summary generation | `services/claudeService.js` | Phase 7 | Summary appears in `clinician_summaries` after call ends |

Each phase is independently testable. Don't move to the next until the current phase produces correct output. Phase 4 runs immediately after Phase 3 (same onboarding flow), not in parallel.

---

## What This MVP Deliberately Excludes (Future Work)
- Continuous care plan updates based on trends
- Risk scoring models
- EMR / FHIR integration
- Clinician-facing web dashboard (summaries are queryable in Kibana for now)
- Escalation alerts (paging, SMS to doctors)
- Patient trend analysis across multiple calls
- Inbound patient calls
- Multi-server scaling (in-memory conversation state limits to single server)

---

## Success Criteria
1. A doctor uploads patient notes (PDF or text) via Express API
2. A care plan is automatically generated and stored in Elasticsearch
3. Perplexity medical references are pre-fetched and stored at onboarding time
4. Each day at 7 AM, pre-call context is assembled per patient from Elasticsearch only (care plan + call history + clinician flags + stored medical references) — the only external call is Claude for briefing synthesis
5. At 8 AM, the system calls the patient via Twilio and Claude conducts a check-in
6. A clinician can query Elasticsearch/Kibana for a structured summary
