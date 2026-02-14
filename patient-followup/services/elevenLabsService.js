/**
 * ElevenLabs text-to-speech: generate natural voice for Twilio <Play>.
 * Caches audio by id so Twilio can fetch via GET /api/twilio/tts/play/:id.
 */

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map(); // id -> { buffer, contentType, createdAt }

function isConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function getVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // "Sarah" – clear, warm
}

/**
 * Call ElevenLabs API to generate MP3 for the given text.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
async function generateAudio(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const voiceId = getVoiceId();
  const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128&optimize_streaming_latency=2`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: text.trim() || " ",
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs TTS failed ${res.status}: ${errText.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate audio for text, store in cache, return public URL for Twilio <Play>.
 * @param {string} text
 * @returns {Promise<string>} Full URL to play (e.g. https://your-server/api/twilio/tts/play/abc123)
 */
async function getPlayUrl(text) {
  if (!text || !text.trim()) return null;

  const buffer = await generateAudio(text);
  const id = crypto.randomUUID();
  cache.set(id, {
    buffer,
    contentType: "audio/mpeg",
    createdAt: Date.now(),
  });

  pruneCache();

  const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/api/twilio/tts/play/${id}`;
}

function pruneCache() {
  const now = Date.now();
  for (const [id, entry] of cache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) cache.delete(id);
  }
}

/**
 * Retrieve cached audio by id (for GET /api/twilio/tts/play/:id).
 * @param {string} id
 * @returns {{ buffer: Buffer, contentType: string } | null}
 */
function getCachedAudio(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  return { buffer: entry.buffer, contentType: entry.contentType };
}

export { isConfigured, getPlayUrl, getCachedAudio };
