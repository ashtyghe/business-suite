# FieldOps Voice Assistant

Voice-controlled assistant for FieldOps via phone call. Uses Twilio for telephony and OpenAI Realtime API for natural speech-to-speech conversation.

## Setup

### 1. Install dependencies
```bash
cd apps/voice-assistant
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Get your API keys

**Twilio:**
1. Sign up at [twilio.com](https://www.twilio.com)
2. Buy a phone number (Australian +61 recommended)
3. Copy Account SID and Auth Token from the console

**OpenAI:**
1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Ensure you have access to the Realtime API (gpt-4o-realtime-preview)

**Supabase:**
1. Use your existing Supabase project URL
2. Use the **service role key** (not the anon key) for full database access

### 4. Run locally with ngrok
```bash
# Terminal 1: Start the server
npm run dev

# Terminal 2: Expose via ngrok for Twilio
ngrok http 3001
```

### 5. Configure Twilio webhook
1. Go to your Twilio phone number settings
2. Set the webhook for incoming calls to: `https://your-ngrok-url.ngrok.io/incoming-call`
3. Method: POST

### 6. Call your number!

## Architecture

```
Phone Call → Twilio → POST /incoming-call (TwiML response)
                   → WebSocket /media-stream (audio streaming)
                        ↕
                   OpenAI Realtime API (speech-to-speech + function calling)
                        ↕
                   Supabase Database (read/write business data)
```

## Deployment

For production, deploy to any Node.js host (Railway, Render, Fly.io, etc.) and update the Twilio webhook URL.
