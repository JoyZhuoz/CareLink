# CareLink Agent Response Format

## Overview

CareLink uses Elasticsearch's built-in Inference API (`chatCompletionUnified`) to route all LLM calls through a pre-configured Anthropic endpoint in Elastic Cloud. The agent returns a structured response with two fields: a user-facing **response** and a clinician-only **internal analysis**.

## Response Structure

Every call to `agent.converse()` returns:

```js
{
  conversation_id: "conv-...",       // Unique conversation ID (pass back for multi-turn)
  response: "...",                   // User/patient-facing message
  internal_analysis: "..."           // Clinical reasoning (stored in ES, never shown to patient)
}
```

### `response`
The clean text to display to the user or speak to the patient. This is the only field that should be shown in the UI or used in voice calls.

### `internal_analysis`
Clinical reasoning, risk assessment, and recommended actions for the care team. This is automatically stored in the `clinician_summaries` Elasticsearch index for later review.

### `conversation_id`
A unique ID for the conversation. Pass it back as the second argument to `converse()` to continue a multi-turn conversation.

## Usage

### Single-turn query

```js
const agent = require("./server/services/callAgent");

const result = await agent.converse("What is John Smith's recovery status?");

console.log(result.response);           // Display to user
console.log(result.internal_analysis);  // For clinician dashboard
```

### Multi-turn conversation

```js
const turn1 = await agent.converse("How is the patient doing?");
console.log(turn1.response);

// Continue the same conversation
const turn2 = await agent.converse(
  "The patient reports severe pain.",
  turn1.conversation_id
);
console.log(turn2.response);
```

### Via REST API

**Care plan generation:**
```bash
curl -X POST http://localhost:3000/api/patients/1001/care-plan
```

**Clinician summary:**
```bash
curl -X POST http://localhost:3000/api/patients/1001/summary \
  -H "Content-Type: application/json" \
  -d '{"transcript": "Patient reports pain level 4/10..."}'
```

## Configuration

Required environment variables in `.env`:

```
ELASTICSEARCH_URL="https://your-deployment.es.us-central1.gcp.cloud.es.io:443"
ELASTICSEARCH_API_KEY="your-api-key"
ES_CHAT_INFERENCE_ID=".anthropic-claude-4.6-opus-chat_completion"
```

The `ES_CHAT_INFERENCE_ID` points to a built-in Elastic Cloud inference endpoint. No separate Anthropic API key is needed at runtime — the LLM credentials are managed within Elasticsearch.

## Architecture

```
User message
  → RAG retrieval (patient record, semantic docs, care plan from ES)
  → System prompt + retrieved context + conversation history
  → ES Inference chatCompletionUnified (SSE stream)
  → Parse SSE → Extract JSON { response, internal_analysis }
  → Store internal_analysis in clinician_summaries index
  → Return { conversation_id, response, internal_analysis }
```

## Agent Modes

The agent responds differently based on message prefixes:

| Prefix | Mode | Behavior |
|--------|------|----------|
| `[CALL]` | Voice check-in | Asks one question at a time, warm tone |
| `[CARE_PLAN]` | Care plan generation | Generates monitor_items, check_in_questions, call_frequency |
| `[SUMMARY]` | Clinician summary | Summarizes a call transcript with findings |
| *(none)* | General query | Answers questions about patient status |
