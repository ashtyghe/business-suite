# Business Suite — Dev Setup Guide

## Prerequisites

- **Node.js** v20+ and npm v10+
- **Git** with SSH access to GitHub

## 1. Clone the repo

```bash
git clone git@github.com:ashtyghe/business-suite.git
cd business-suite
```

## 2. Install dependencies

```bash
cd apps/frontend
npm install
cd ../..
```

## 3. Create the environment file

Create `apps/frontend/.env` with:

```
VITE_SUPABASE_URL=https://cpfzjduxhzhzrahcicef.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwZnpqZHV4aHpoenJhaGNpY2VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzc1ODMsImV4cCI6MjA4ODc1MzU4M30.ZZ9mC7lK-OV3Mu15ioDcWnXBMLjd5FWe4v_ffzH9LMQ
```

## 4. Set up Git identity

```bash
git config user.email "ashley@c8c.com.au"
git config user.name "Ashley Tyghe"
```

## 5. Set up SSH for GitHub (if not already done)

```bash
ssh-keygen -t ed25519 -C "ashley@c8c.com.au" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Add the public key at: https://github.com/settings/keys > **New SSH key**

## 6. Run the dev server

```bash
cd apps/frontend
npm run dev
```

App runs at **http://localhost:5173**

## Project Structure

```
business-suite/
├── apps/
│   ├── frontend/           # React 18 + Vite frontend
│   │   ├── src/
│   │   │   ├── job-management-app.jsx   # Main app (single file, ~5500 lines)
│   │   │   ├── lib/
│   │   │   │   ├── supabase.js          # Supabase client
│   │   │   │   └── db.js               # CRUD operations
│   │   │   └── main.jsx
│   │   └── .env                         # Supabase credentials (not in git)
│   └── api/
│       └── supabase/
│           └── functions/               # Supabase Edge Functions
├── .claude/
│   └── launch.json                      # Dev server config for Claude Code
└── SETUP.md                             # This file
```

## Xero Integration Setup

The Xero integration requires these Supabase Edge Function secrets:

```bash
supabase secrets set XERO_CLIENT_ID=your_client_id
supabase secrets set XERO_CLIENT_SECRET=your_client_secret
```

Get these from the [Xero Developer Portal](https://developer.xero.com/app/manage) after creating an app. The redirect URI should be your app's URL (e.g. `https://your-app.netlify.app/`).

## Key Architecture Notes

- **Single-file app**: All UI is in `job-management-app.jsx` — components, styles, and logic (~12,700 lines)
- **Styling**: Custom CSS via `injectStyles()` function + inline styles (no Tailwind)
- **CSS variables**: `--section-accent` cascades accent colors per section
- **SECTION_COLORS**: Constants mapping section IDs to `{accent, light}` hex pairs
- **SectionDrawer**: Reusable drawer component with View/Edit toggle
- **Backend**: Supabase (hosted) for database + auth + edge functions
- **Auth**: Supabase Auth with email/password, admin/staff roles
- **Xero**: Two-way sync via edge functions, OAuth 2.0 + PKCE

## Deployment

- **Netlify** auto-deploys from `main` branch
- Build command: `npm run build` (in `apps/frontend`)
- Publish directory: `apps/frontend/dist`
