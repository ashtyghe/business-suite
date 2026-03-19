# Business App Suite — Project Context

This document gives Claude Code full context on the project so it can pick up where we left off without needing prior chat history.

---

## Business Overview

A trade/construction/maintenance company currently using:
- **Google Workspace** — email, calendar, file storage
- **Tradify** — job management (quoting, invoicing, scheduling, time tracking, bills)
- **Xero** — accounting

The goal is to replace or integrate these tools with a custom suite of apps that streamlines office and field operations.

---

## Apps Built So Far

### 1. Timesheet App
- **File:** `timesheet-app.html` (single-file PWA)
- **Deployed:** `https://serene-paletas-1e5a07.netlify.app`
- **Stack:** Vanilla HTML/CSS/JS, PWA (installable on iOS/Android)
- **Features:**
  - Week view with colour-coded days (red/orange/green based on hours logged)
  - Manual time entry drawer with half-hour quick-select chips (30min → 8hr)
  - Client dropdown (manager-editable)
  - Image attachments per entry
  - Activity log on each entry card
  - Edit + delete per entry
  - Manager dashboard with Overview, Timesheets, Employees, and Clients tabs
  - Open Sans font

### 2. Bill Capture App
- **File:** `bill-capture-app.jsx` (React component)
- **Stack:** React, Anthropic Claude API (vision) for AI extraction
- **Features:**
  - Capture bills via mobile camera, email upload, or direct file upload
  - Supports JPEG, PNG, GIF, WebP, HEIC/HEIF
  - AI extracts: vendor, date, invoice number, job reference, line items, subtotal, tax, total, currency, payment terms, notes
  - Edit extracted data before saving
  - Bill list view
- **Backend:** Anthropic API called via Supabase Edge Function (to avoid exposing API key)
- **Hosting plan:** GitHub Pages (static) + Supabase Edge Function (API proxy)

### 3. Job Management App — "FieldOps"
- **File:** `job-management-app.jsx` (React, single-file component)
- **Stack:** React, Tailwind CSS
- **Features:**
  - Jobs with status pipeline (Lead → Quoted → Scheduled → In Progress → Complete → Invoiced)
  - Multi-site support per client (site name, address, contact person, contact phone)
  - Quotes — line items, GST toggle, status, notes; editable from Job Detail drawer
  - Invoices — line items, due date, status, GST, notes; editable from Job Detail drawer
  - Bills module — two-stage receipt capture and cost allocation pipeline with statuses: Inbox → Linked → Approved → Posted to Job
  - BillModal with GST toggle, ex-GST breakdown, markup %, job linking
  - PostToJobModal showing cost summary with markup calculation
  - Kanban pipeline view + filterable list view for bills
  - Costs tab in Job Detail showing ex-GST, markup, on-charge amounts
  - Activity log throughout (jobs, quotes, invoices, bills)
  - Schedule view showing site and contact details
  - Sidebar badges for actionable items
  - **Authentication** — Supabase Auth with email/password, admin/staff roles, RLS policies
  - **Xero Integration** — Two-way sync of invoices, bills, and contacts with Xero accounting. Includes:
    - OAuth 2.0 + PKCE connection flow (Settings > Xero tab)
    - Contact fuzzy-matching to prevent duplicates
    - Push invoices/bills to Xero on status change (auto) or manually
    - Pull payment status from Xero (polling)
    - Dry-run preview before first sync
    - Configurable account code mappings
    - "Already in Xero" skip flags to prevent duplicate entries
    - Sync status badges on invoice/bill rows

---

## Planned Apps (Not Yet Built)

### 4. Scheduling & KPI Dashboard
- Display on office digital screens and mobile
- Show job schedules, team assignments, KPI metrics
- Needs to pull data from Job Management app

### 5. Digital Asset Management (DAM)
- Store and manage business documents outside of jobs
- Separate from job-specific files (which live in the Job Management app)
- Categories: templates, contracts, compliance docs, marketing assets, etc.

---

## Architecture & Infrastructure

### Tech Stack
- **Frontend:** React (JSX), Tailwind CSS
- **Backend/Database:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514) — used in Bill Capture for vision extraction
- **Hosting:** GitHub Pages (static frontend) + Supabase Edge Functions (API calls)
- **PWA:** Timesheet app is installable; others to follow

### How Apps Communicate
- All apps share a single Supabase project as the data layer
- Jobs, clients, bills, timesheets, and documents all live in Supabase
- Apps are standalone but reference shared entities (e.g. a bill links to a job ID, a timesheet entry links to a client)
- Anthropic API calls are proxied through Supabase Edge Functions (never exposed client-side)

### Key Decisions Made
- Supabase chosen over Netlify for backend (more generous free tier, no credit limits)
- Single-file React components for portability during development
- GST (Australian tax) is used throughout — 10% rate
- Currency: AUD ($)
- Bills have markup support (cost + markup % = on-charge amount to client)

---

## File Structure

```
business-suite/
├── CONTEXT.md                  ← this file
├── SETUP.md                    ← dev setup guide
├── PLAN-auth.md                ← auth implementation plan (completed)
├── apps/
│   ├── frontend/               ← React 18 + Vite frontend
│   │   ├── src/
│   │   │   ├── job-management-app.jsx  ← Main app (~12,700 lines)
│   │   │   ├── App.jsx                 ← Auth wrapper + routing
│   │   │   ├── LoginPage.jsx           ← Login form
│   │   │   └── lib/
│   │   │       ├── supabase.js         ← Supabase client + edge function wrappers
│   │   │       ├── db.js              ← CRUD operations + normalizers
│   │   │       ├── auth.js            ← Auth helper functions
│   │   │       └── AuthContext.jsx    ← React auth context provider
│   │   └── vite.config.js
│   └── api/
│       └── supabase/
│           ├── functions/
│           │   ├── _shared/xero-client.ts    ← Shared Xero API client
│           │   ├── extract-bill/             ← AI bill extraction
│           │   ├── invite-user/              ← Admin user creation
│           │   ├── ai-insight/               ← Business analytics AI
│           │   ├── xero-oauth/               ← Xero OAuth flow
│           │   ├── xero-sync-contacts/       ← Contact sync with matching
│           │   ├── xero-sync-invoices/       ← Invoice sync with dry-run
│           │   ├── xero-sync-bills/          ← Bill sync with dry-run
│           │   └── xero-poll-updates/        ← Poll Xero for payment updates
│           └── migrations/                   ← PostgreSQL schema migrations
└── (future apps)
    ├── scheduling-dashboard/
    └── dam/
```

---

## Notes for Claude Code

- When editing existing apps, prefer targeted string replacements over full rewrites to preserve working code
- The job management app uses Python scripts for patching due to its size — check if this pattern is still needed
- All monetary values use AUD with GST at 10%
- The Anthropic model to use is always `claude-sonnet-4-20250514`
- Supabase project details (URL, anon key) will be in environment variables — never hardcode them
- The team is non-technical, so UIs should be intuitive with minimal onboarding required
