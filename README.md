# CareLink

AI-powered post-surgical patient follow-up and readmission prevention.

<!-- TODO: Add project description -->

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      PATIENT LAYER                       │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Conversational Interface Layer                          │
│  - Web / Mobile App                                      │
│  - Text-to-speech (ElevenLabs)                           │
│  - Real-time streaming (Twilio)                          │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Primary Clinical Agent                                  │
│  (Reasoning + Conversation Engine)                       │
│                                                          │
│  - Perplexity deep web research (PubMed, FDA, CDA)      │
│  - Jina API embedding similarity match                   │
│  - LLM (Elasticsearch-integrated Claude) reasoning       │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Agent Orchestration Layer                               │
│  (Multi-Agent Router + Controller)                       │
│                                                          │
│  - Elastic Agent Builder + Workflow Orchestrator         │
│  - ES|QL tool expert                                     │
│  - Guardrails & Safety Policies                          │
│  - Escalation Rules + Clinical guidelines RAG            │
└────┬────────────┬────────────┬────────────┬──────────────┘
     ▼            ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Symptom  │ │ Action   │ │Escalation│ │ General  │
│ Expert   │ │ Expert   │ │ Expert   │ │ Expert   │
│(Triage)  │ │(Follow-up│ │(Risk     │ │(FAQ /    │
│          │ │ Logic)   │ │Detector) │ │ Support) │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Data & Retrieval Layer                                  │
│                                                          │
│  - Elastic Cloud database                                │
│  - Jina embedding for semantic search                    │
│  - Interactive clinician decision interface               │
└──────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** >= 20.x
- **npm** (comes with Node.js)
- **Elasticsearch** deployment on Elastic Cloud (with a `patients` index)
- **Kibana** with Agent Builder enabled (for the clinical chatbot)
- **Twilio** account (for automated patient calls)
- **Cloudflared** (optional, for exposing local server to Twilio webhooks)
- **ElevenLabs** API key (optional, for natural voice — falls back to Twilio's built-in "alice" voice)

> **Note:** This is a Node.js project. There is no `requirements.txt` — all dependencies are managed through `package.json` via `npm install`.

## Setup

### 1. Clone and install

```bash
git clone https://github.com/JoyZhuoz/carelink.git
cd carelink
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable | Required | Description |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio phone number (E.164 format) |
| `PUBLIC_BASE_URL` | Yes | Public URL for Twilio webhooks (use tunnel URL in dev) |
| `ELASTICSEARCH_URL` | Yes | Elasticsearch deployment URL |
| `ELASTICSEARCH_API_KEY` | Yes | Elasticsearch API key |
| `KIBANA` | Yes | Kibana base URL (for Agent Builder chat) |
| `ES_CHAT_INFERENCE_ID` | No | ES inference endpoint ID for LLM chat completion |
| `ES_AGENT_BUILDER_ENDPOINT` | No | Agent Builder run endpoint |
| `ES_AGENT_BUILDER_API_KEY` | No | Agent Builder API key |
| `ELEVENLABS_API_KEY` | No | ElevenLabs API key for natural voice |
| `ELEVENLABS_VOICE_ID` | No | ElevenLabs voice ID |

### 3. Seed patient data (optional)

```bash
npm run seed
```

Seeds a test patient into Elasticsearch for development.

### 4. Set up Twilio webhook tunnel (for local development)

Twilio needs a public URL to send call webhooks back to your server. In a separate terminal:

```bash
npm run tunnel
```

Copy the generated URL and set it as `PUBLIC_BASE_URL` in your `.env`.

### 5. Set up the Elastic Agent Builder

See [`data/agent_setup.md`](data/agent_setup.md) for the full agent instruction and ES|QL workflow configuration.

## Running

Start the backend and frontend dev server in two terminals:

```bash
# Terminal 1 — Backend (Express + Socket.IO on port 3000)
npm start

# Terminal 2 — Frontend (Vite dev server with HMR on port 5173)
npm run dev
```

For production, build the frontend first:

```bash
npm run build
npm start
```

The server serves the built frontend from `client/dist` and runs on port 3000.

## Project Structure

```
carelink/
├── client/                      # React frontend (Vite + Tailwind)
│   └── src/
│       └── components/
│           ├── layouts/         # SidebarLayout (shared shell)
│           ├── modules/         # PatientCard, PatientProfile, CallSummary, Sidebar, etc.
│           └── pages/           # Dashboard, Chatbot, Analytics
├── server/                      # Express server
│   ├── server.js                # Main entry — routes, SSE chat, Socket.IO
│   └── services/
│       ├── callAgent.js         # Elastic Agent Builder client (SSE streaming)
│       └── elasticService.js    # Elasticsearch helpers
├── patient-followup/            # Follow-up call system
│   ├── routes/
│   │   ├── patients.js          # Patient CRUD + search API
│   │   └── twilio.js            # Twilio call webhooks
│   ├── services/
│   │   ├── claudeService.js     # Claude LLM for call triage
│   │   ├── twilioService.js     # Twilio call orchestration
│   │   ├── elevenLabsService.js # Text-to-speech voice generation
│   │   ├── embeddingService.js  # Jina embedding for semantic search
│   │   ├── perplexityService.js # Medical context research
│   │   ├── patientService.js    # Elasticsearch patient queries
│   │   └── schedulerService.js  # Cron-based follow-up scheduler
│   └── scripts/
│       └── seed-patient-due-now.js
├── data/
│   ├── agent_setup.md           # Agent Builder setup instructions
│   └── patients.json            # Sample patient data
├── package.json
└── .env.example
```

## Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start the production server on port 3000 |
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Build frontend to `client/dist` |
| `npm run start:dev` | Start backend with nodemon (auto-restart) |
| `npm run tunnel` | Open Cloudflare tunnel for Twilio webhooks |
| `npm run seed` | Seed test patient into Elasticsearch |
| `npm run test:call` | Trigger a test follow-up call to the seeded patient |
