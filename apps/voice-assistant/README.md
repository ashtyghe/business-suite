# FieldOps Voice Assistant

Twilio + OpenAI Realtime API voice assistant for the FieldOps construction business management platform. Call your Twilio number and interact with your jobs, schedule, contractors, bills, and work orders by voice.

## Prerequisites

- Node.js 18+
- A Twilio account with a phone number
- An OpenAI API key with access to the Realtime API
- A Supabase project with the required tables
- ngrok or similar tunnel for local development

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your credentials (or verify the existing `.env`):

```
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+61...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
PORT=3001
```

3. Start the server:

```bash
npm start
# or for development with auto-reload:
npm run dev
```

4. Expose your local server with ngrok:

```bash
ngrok http 3001
```

5. Configure your Twilio phone number's Voice webhook:
   - Go to **Twilio Console > Phone Numbers > Your Number**
   - Set **A call comes in** webhook to `https://YOUR_NGROK_URL/incoming-call` (HTTP POST)

6. Call your Twilio number to test.

## Architecture

```
Caller → Twilio → POST /incoming-call (TwiML)
                → WebSocket /media-stream (audio)
                    → OpenAI Realtime API (bidirectional audio + function calls)
                        → Supabase (data read/write)
```

- **server.js** — Express HTTP server + WebSocket bridge between Twilio and OpenAI
- **tools.js** — OpenAI function tool definitions (what the AI can do)
- **handlers.js** — Tool implementations that query/mutate Supabase

## Supabase Tables

The assistant expects these tables:

| Table | Key Columns |
|-------|------------|
| `jobs` | id, title, status, client, estimate, address, notes |
| `schedule_entries` | id, job_id, date, title, time, assignee |
| `contractors` | id, name, trade, phone, email, documents (jsonb[]) |
| `bills` | id, supplier, amount, status, date, category |
| `work_orders` | id, ref, status, assignee, due_date |
| `time_entries` | id, job_id, worker, hours, date, description |
| `quotes` | id, job_id, client, amount, status |

## Voice Capabilities

**Read operations:**
- List jobs and check status
- View today's/this week's/next week's schedule
- Check contractor compliance and document expiry
- Review pending bills and totals
- Check work order statuses
- Get quote totals

**Write operations:**
- Add schedule entries
- Add notes to jobs
- Update job and work order statuses
- Log time entries

## Deployment

For production, deploy to any Node.js host (Railway, Render, Fly.io, etc.) and update your Twilio webhook URL to point to the deployed server. Ensure WebSocket connections are supported by your hosting provider.
