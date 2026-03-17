require('dotenv').config();

const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const { tools } = require('./tools');
const { handleToolCall } = require('./handlers');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL =
  'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview';

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}

// ─── DYNAMIC SETTINGS ─────────────────────────────────────────────

let currentSettings = {
  name: 'Iris',
  voice: 'sage',
  greetingStyle: 'Start every call by singing a short snippet (3-8 words) from a random well-known song, then smoothly transition into a warm greeting. Pick a different song every time — pop, rock, classic, 80s, 90s, anything catchy.',
  personality: "Friendly and warm — talk like a helpful mate, not a robot. Use 'hey', 'no worries', 'easy done', 'nice one'. Bright and positive — always upbeat, encouraging, and supportive. Keep it brief — this is a phone call. Use Australian English and throw in the occasional Aussie slang naturally — 'reckon', 'heaps', 'no dramas', 'too easy'.",
  generalKnowledge: 'You know Coffs Harbour and the region — the beaches, the Big Banana, Park Beach, Sawtell, Woolgoolga. You know the local building scene — coastal builds deal with salt air corrosion, council approvals through Coffs Harbour City Council. You know the weather matters for trades work. You know the trades — sparkies, chippies, plumbers, concreters, roofers.',
  silenceDuration: 500,
  vadThreshold: 0.5,
  confirmWrites: true,
};

function buildSystemPrompt(settings) {
  const s = settings || currentSettings;
  return `You are ${s.name}, the voice assistant for FieldOps — a construction and trades business management app. You help builders, project managers, and tradies manage their jobs, schedules, contractors, bills, and work orders over the phone.

About you:
- Your name is ${s.name}
- You're the voice assistant for FieldOps — always helpful, always ready

Personality and style:
${s.personality || 'Be friendly, professional, and concise.'}

General knowledge (use sparingly and naturally, don't force it):
${s.generalKnowledge || 'No specific background knowledge configured.'}

Greeting style:
${s.greetingStyle || 'Greet callers warmly and ask how you can help.'}

Important rules:
- ${s.confirmWrites !== false ? 'For write operations (adding entries, updating statuses, logging time), always confirm details before making changes' : 'You may proceed with write operations without confirmation unless the caller seems uncertain'}
- When in doubt about which job or item someone means, ask — don't guess
- When listing items, give the count first, then offer details
- Say "dollars" not "dollar sign". Use natural dates like "next Tuesday" or "the 15th of March"
- If someone sounds stressed, be warm, calm, and reassuring

Today's date is ${new Date().toISOString().split('T')[0]}.`;
}

// ─── EXPRESS APP ───────────────────────────────────────────────────

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// CORS for frontend
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: `FieldOps Voice Assistant — ${currentSettings.name}` });
});

// Get current settings
app.get('/settings', (_req, res) => {
  res.json(currentSettings);
});

// Update settings — applied to the next call
app.post('/settings', (req, res) => {
  const allowed = ['name', 'voice', 'greetingStyle', 'personality', 'generalKnowledge', 'silenceDuration', 'vadThreshold', 'confirmWrites'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      currentSettings[key] = req.body[key];
    }
  }
  console.log('Voice settings updated:', JSON.stringify(currentSettings, null, 2));
  res.json({ ok: true, settings: currentSettings });
});

// Twilio incoming call webhook — returns TwiML to connect to media stream
app.post('/incoming-call', (req, res) => {
  console.log('Incoming call from:', req.body.From || 'unknown');

  // Determine the WebSocket host from the request
  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${host}/media-stream`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="callerNumber" value="${req.body.From || ''}" />
    </Stream>
  </Connect>
</Response>`;

  res.type('text/xml').send(twiml);
});

// ─── HTTP + WEBSOCKET SERVER ───────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/media-stream' });

wss.on('connection', (twilioWs, req) => {
  console.log('Twilio media stream connected');

  let streamSid = null;
  let callSid = null;
  let openaiWs = null;
  let openaiReady = false;
  const audioQueue = []; // Buffer audio until OpenAI is ready

  // ── Connect to OpenAI Realtime API ─────────────────────────────

  function connectOpenAI() {
    openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    openaiWs.on('open', () => {
      console.log('Connected to OpenAI Realtime API');
    });

    openaiWs.on('message', (rawData) => {
      const event = JSON.parse(rawData.toString());
      handleOpenAIEvent(event);
    });

    openaiWs.on('error', (err) => {
      console.error('OpenAI WebSocket error:', err.message);
    });

    openaiWs.on('close', (code, reason) => {
      console.log(`OpenAI WebSocket closed: ${code} ${reason}`);
      openaiReady = false;
    });
  }

  // ── Configure OpenAI session once connected ────────────────────

  function configureSession() {
    const settings = currentSettings;
    const sessionConfig = {
      type: 'session.update',
      session: {
        voice: settings.voice || 'sage',
        instructions: buildSystemPrompt(settings),
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: settings.vadThreshold || 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: settings.silenceDuration || 500,
        },
        tools: tools,
        tool_choice: 'auto',
      },
    };
    sendToOpenAI(sessionConfig);
    openaiReady = true;

    // Flush queued audio
    while (audioQueue.length > 0) {
      sendToOpenAI(audioQueue.shift());
    }

    // Send initial greeting prompt
    sendToOpenAI({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions:
          `Greet the caller following your greeting style instructions. Introduce yourself as ${settings.name || 'Iris'}. Keep it short, fun, and natural. Ask what you can help with.`,
      },
    });
  }

  // ── Handle events from OpenAI ──────────────────────────────────

  function handleOpenAIEvent(event) {
    switch (event.type) {
      case 'session.created':
        console.log('OpenAI session created:', event.session?.id);
        configureSession();
        break;

      case 'session.updated':
        console.log('OpenAI session configured');
        break;

      case 'response.audio.delta':
        // Stream audio back to Twilio
        if (event.delta && streamSid) {
          sendToTwilio({
            event: 'media',
            streamSid,
            media: {
              payload: event.delta,
            },
          });
        }
        break;

      case 'response.audio_transcript.delta':
        // Log assistant speech for debugging
        if (event.delta) {
          process.stdout.write(event.delta);
        }
        break;

      case 'response.audio_transcript.done':
        console.log('\n[Assistant transcript complete]');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        console.log(`\n[Caller]: ${event.transcript}`);
        break;

      case 'response.function_call_arguments.done':
        handleFunctionCall(event);
        break;

      case 'response.done':
        if (event.response?.status === 'failed') {
          console.error(
            'Response failed:',
            event.response?.status_details?.error
          );
        }
        break;

      case 'error':
        console.error('OpenAI error:', event.error);
        break;

      case 'input_audio_buffer.speech_started':
        // User started speaking — clear any queued Twilio audio
        if (streamSid) {
          sendToTwilio({ event: 'clear', streamSid });
        }
        // Cancel any in-progress response
        sendToOpenAI({ type: 'response.cancel' });
        break;

      default:
        // Ignore other events
        break;
    }
  }

  // ── Handle function calls from OpenAI ──────────────────────────

  async function handleFunctionCall(event) {
    const { call_id, name, arguments: argsStr } = event;
    console.log(`\n[Tool call]: ${name}(${argsStr})`);

    let args;
    try {
      args = JSON.parse(argsStr);
    } catch {
      args = {};
    }

    const result = await handleToolCall(name, args);
    console.log(`[Tool result]: ${result.substring(0, 200)}...`);

    // Send result back to OpenAI
    sendToOpenAI({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id,
        output: result,
      },
    });

    // Trigger a response from the assistant
    sendToOpenAI({
      type: 'response.create',
    });
  }

  // ── Handle messages from Twilio ────────────────────────────────

  twilioWs.on('message', (rawData) => {
    const msg = JSON.parse(rawData.toString());

    switch (msg.event) {
      case 'connected':
        console.log('Twilio stream connected');
        break;

      case 'start':
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        console.log(`Stream started — SID: ${streamSid}, Call: ${callSid}`);
        connectOpenAI();
        break;

      case 'media':
        // Forward audio to OpenAI
        const audioEvent = {
          type: 'input_audio_buffer.append',
          audio: msg.media.payload, // Already base64 g711_ulaw from Twilio
        };
        if (openaiReady) {
          sendToOpenAI(audioEvent);
        } else {
          audioQueue.push(audioEvent);
        }
        break;

      case 'stop':
        console.log('Twilio stream stopped');
        if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
        break;

      default:
        break;
    }
  });

  twilioWs.on('close', () => {
    console.log('Twilio WebSocket disconnected');
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on('error', (err) => {
    console.error('Twilio WebSocket error:', err.message);
  });

  // ── Helpers ────────────────────────────────────────────────────

  function sendToOpenAI(data) {
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(JSON.stringify(data));
    }
  }

  function sendToTwilio(data) {
    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify(data));
    }
  }
});

// ─── START SERVER ──────────────────────────────────────────────────

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// Graceful shutdown for Railway
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => process.exit(0));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FieldOps Voice Assistant running on 0.0.0.0:${PORT}`);
  console.log(`Webhook: /incoming-call`);
  console.log(`WebSocket: /media-stream`);
});
