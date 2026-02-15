<p align="center">
  <img src="CareLink_Banner.png" alt="CareLink — Connecting Patients, Empowering Care" width="100%" />
</p>

# CareLink

## Inspiration
1 in 5 Medicare recipients are readmitted within just a month of discharge from the hospital due to post-surgery complications - complications which would have been highly avoidable had proactive and sufficient follow-up been conducted on discharged patients. Readmissions cost the U.S. hospital system 26 billion dollars a year, exerting stress upon understaffed and busy hospital systems without the bandwidth to ensure patients get consistent care after walking through the doors of the operating room.

## What it does
CareLink aims to take the burden off of doctors, hospital systems, and even patients, by automating the post-surgical follow-up process while keeping medical staff in the loop - resulting in safe and efficient decision-making. The platform accomplishes two main purposes:

Automate patient post-surgical follow-up through agentic and adaptive voice call,
Provide hospitals and doctors with digestible patient care recommendations through RAG-powered clinical reasoning.

48 hours after a patient's discharge date, our voice AI agent automatically calls the patient for a check-in to ask the patient about any discomfort they've experienced and any concerns they have. With access to the patient's surgery information, preexisting risk factors, and medical documentation on potential surgery complications, the agent dynamically reasons about follow-up questions to extract more information from the patient and determine the possibility of major surgery complications.

If the agent believes the patient may be at risk, the hospital-facing dashboard flags the patient as requiring urgent care, alerting doctors to the need for follow-up appointments - preventing escalation of the patient condition and reducing the chances of patient readmission for increasingly severe surgical complications.

## How we built it
We built CareLink with React for the frontend, Express.js for the backend, and a demo patient database stored using Elasticsearch's powerful vector embedding and retrieval capabilities.

Pre-call information retrieval: We use Perplexity API to gather contextual information from credible medical documentation (including PubMed, NCBI, and FDA publications) on the patient's surgery and potential complications. Next, we use Elasticsearch's Jina embedding model to convert this doc to embedding vectors for more efficient comparison with the patient's true symptoms.

Automated phone call pipeline: We use the Twilio API to provide the communication infrastructure via a direct phone call 48 hours after the discharge date. We use a combination of Claude and ElevenLabs API to support dynamic, natural conversation with the patient. We leverage Claude's reasoning capabilities to generate personalized questions for the patient and use ElevenLabs for high quality text-to-speech conversion for the phone call.

Transcription and summarization: The agent-patient conversation is transcribed and summarized for clinician records. We compare the patient's symptoms with the expected results retrieved using Perplexity via the vector evaluation system in Elasticsearch, allowing us to present the appropriate actionables in the hospital dashboard.

Hospital chatbot: On the hospital UI, we used Elastic Agent Builder via Kibana as part of Elastic Cloud. Specifically, we developed an agent that has access to customized workflows and tools to investigate specific data through semantic reasoning. The chatbot feature allows hospital clinicians to receive information about patients through retrieval-augmented generation that draws directly from patient records and call transcripts from the Elasticsearch database.

Clinician dashboards: We also incorporated an analytics dashboard to present various statistics about the patients and surgeries stored in the database. Finally, a full patient list allows clinicians to see individual patients data, call transcripts/summaries, and recommended actionables. In addition, they can manually initiate communication through phone call or email with the patient if needed.


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

## Project Structure

```
carelink/
├── client/                      # React frontend (Vite + Tailwind)
│   └── src/
│       └── components/
│           ├── layouts/         # SidebarLayout (shared shell)
│           ├── modules/         # PatientCard, PatientProfile, CallSummary, etc.
│           ├── pages/           # Dashboard, Chatbot, Analytics
│           └── utils/           # Shared helpers (patientUtils)
├── server/                      # Express server
│   ├── server.js                # Main entry — routes, SSE chat, Socket.IO
│   └── services/
│       ├── callAgent.js         # Elastic Agent Builder client (SSE streaming)
│       ├── chatFallback.js      # Fallback chat when Agent Builder unavailable
│       ├── elasticService.js    # Elasticsearch helpers
│       └── emailService.js      # Email notifications (Nodemailer)
├── patient-followup/            # Follow-up call system
│   ├── routes/
│   │   ├── analytics.js         # Analytics aggregation API
│   │   ├── patients.js          # Patient CRUD + search API
│   │   └── twilio.js            # Twilio call webhooks
│   ├── services/
│   │   ├── analyticsService.js  # Population-level analytics computation
│   │   ├── claudeService.js     # Claude LLM for call triage
│   │   ├── twilioService.js     # Twilio call orchestration
│   │   ├── elevenLabsService.js # Text-to-speech voice generation
│   │   ├── embeddingService.js  # Jina embedding for semantic search
│   │   ├── perplexityService.js # Medical context research
│   │   ├── patientService.js    # Elasticsearch patient queries
│   │   └── schedulerService.js  # Cron-based follow-up scheduler
│   └── scripts/                 # Database seeding scripts
├── data/
│   ├── agent_setup.md           # Agent Builder setup instructions
│   └── patients.json            # Sample patient data
├── package.json
├── SETUP.md                     # Installation and setup guide
└── .env.example
```

## Getting Started

See [`SETUP.md`](SETUP.md) for prerequisites, installation, environment configuration, and running instructions.
