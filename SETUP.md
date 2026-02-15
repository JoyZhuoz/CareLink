# Setup Guide

## Prerequisites

- **Node.js** >= 20.x
- **npm** (comes with Node.js)
- **Elasticsearch** deployment on Elastic Cloud (with a `patients` index)
- **Kibana** with Agent Builder enabled (for the clinical chatbot)
- **Twilio** account (for automated patient calls)
- **Cloudflared** (optional, for exposing local server to Twilio webhooks)
- **ElevenLabs** API key (optional, for natural voice — falls back to Twilio's built-in "alice" voice)

> **Note:** This is a Node.js project. There is no `requirements.txt` — all dependencies are managed through `package.json` via `npm install`.

## Installation

### 1. Clone and install

```bash
git clone https://github.com/JoyZhuoz/carelink.git
cd carelink
npm install
```

If you get permission errors on Windows:
- Close VS Code/Cursor completely
- Disable any antivirus temporarily
- Run Command Prompt as Administrator and navigate to the project folder
- Try: `npm install --legacy-peer-deps`

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

## Troubleshooting

### EPERM errors during npm install
- This is a Windows file locking issue
- Close all editors and terminals
- Try running as Administrator
- If it persists, restart your computer

### Tailwind styles not showing
- Make sure all files were saved
- Try stopping the dev server (Ctrl+C) and starting again
- Clear browser cache

### Port already in use
- Change the port in `vite.config.js`
- Or stop any other processes using port 5173
