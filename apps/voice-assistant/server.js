import "dotenv/config";
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { handleMediaStream } from "./lib/twilio-bridge.js";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({ status: "ok", service: "FieldOps Voice Assistant" }));

// ── Twilio webhook — incoming call ────────────────────────────────────────────
// Twilio POSTs here when someone calls your number.
// We return TwiML that tells Twilio to open a WebSocket media stream to us.
app.post("/incoming-call", (req, res) => {
  const caller = req.body.From || "unknown";
  console.log(`📞 Incoming call from ${caller}`);

  // Optional: restrict to allowed callers
  const allowed = (process.env.ALLOWED_CALLERS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(caller)) {
    console.log(`🚫 Rejected call from ${caller}`);
    res.type("text/xml").send(`
      <Response>
        <Say voice="Polly.Joanna">Sorry, you are not authorised to use this service.</Say>
        <Hangup/>
      </Response>
    `);
    return;
  }

  // Determine the WebSocket URL (same host, /media-stream path)
  const host = req.headers.host;
  const protocol = host?.includes("localhost") ? "ws" : "wss";

  res.type("text/xml").send(`
    <Response>
      <Say voice="Polly.Joanna">Connecting you to FieldOps assistant.</Say>
      <Connect>
        <Stream url="${protocol}://${host}/media-stream">
          <Parameter name="caller" value="${caller}" />
        </Stream>
      </Connect>
    </Response>
  `);
});

// ── Twilio status callback (optional) ─────────────────────────────────────────
app.post("/call-status", (req, res) => {
  console.log(`📊 Call status: ${req.body.CallStatus} (${req.body.From})`);
  res.sendStatus(200);
});

// ── Create HTTP server + WebSocket server ─────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media-stream" });

wss.on("connection", (ws, req) => {
  console.log("🔌 Twilio media stream connected");
  handleMediaStream(ws);
});

server.listen(PORT, () => {
  console.log(`\n🎙️  FieldOps Voice Assistant running on port ${PORT}`);
  console.log(`   Webhook URL: http://localhost:${PORT}/incoming-call`);
  console.log(`   Media Stream: ws://localhost:${PORT}/media-stream\n`);
});
