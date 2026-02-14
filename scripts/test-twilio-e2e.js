#!/usr/bin/env node
/**
 * End-to-end test: trigger a Twilio outbound call.
 * Requires: server running (npm start), and optionally a tunnel (npm run tunnel)
 * so Twilio can reach your server for voice webhooks.
 *
 * Usage:
 *   npm run test:twilio                    # uses TWILIO_TEST_TO from env, or prompt
 *   npm run test:twilio -- +14155551234    # pass phone (E.164)
 *   TWILIO_TEST_TO=+14155551234 npm run test:twilio
 *
 * Set PUBLIC_BASE_URL in server/.env to your tunnel URL (e.g. https://xxx.loca.lt)
 * before starting the server so Twilio gets the correct voice URL.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TO = process.env.TWILIO_TEST_TO || process.argv.find((a) => /^\+\d{10,15}$/.test(a));

async function main() {
  if (!TO) {
    console.error("Usage: npm run test:twilio -- +1XXXXXXXXXX");
    console.error("   or: TWILIO_TEST_TO=+1XXXXXXXXXX npm run test:twilio");
    process.exit(1);
  }

  const url = `${BASE_URL}/api/calls`;
  const body = { to: TO };

  console.log("POST", url);
  console.log("Body:", JSON.stringify(body, null, 2));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Request failed:", res.status, data);
    process.exit(1);
  }

  if (!data.callSid) {
    console.error("Response missing callSid:", data);
    process.exit(1);
  }

  console.log("OK – call created:", data.callSid);
  console.log("Status:", data.status);
  console.log("Your phone should ring. Answer and follow the voice prompts.");
  console.log("To inspect call state: GET", `${BASE_URL}/api/calls/${data.callSid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
