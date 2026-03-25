# Multi-App Platform Plan

> FieldOps business suite → 4 subdomain apps sharing one database, one login, centralized permissions.

---

## Overview

| App | Subdomain | Purpose | Status |
|-----|-----------|---------|--------|
| **Jobs** | `jobs.{domain}` | Current FieldOps app (renamed) — jobs, quotes, invoices, bills, schedule, timesheets | Existing (migrate) |
| **CRM** | `crm.{domain}` | Clients, contractors, suppliers, contacts, communication history | New |
| **Field** | `field.{domain}` | Mobile-first field crew app — daily schedule, time logging, site photos, safety checklists | New |
| **DAM** | `dam.{domain}` | Document/asset management — templates, contracts, compliance docs, marketing assets | New |

**Domain strategy:** Build for a custom domain (e.g. `fieldops.app`) but deploy initially on separate Netlify sites (`jobs-fieldops.netlify.app`, etc.) until the domain is ready.

---

## Architecture

```
business-suite/
├── packages/                          ← NEW: shared code
│   ├── ui/                            ← Shared React components (Icon, StatusBadge, AddressFields, etc.)
│   │   ├── package.json
│   │   └── src/
│   ├── lib/                           ← Shared logic (supabase client, auth, helpers)
│   │   ├── package.json
│   │   └── src/
│   │       ├── supabase.js            ← Supabase client init
│   │       ├── auth.js                ← Auth helpers (signIn, signOut, getStaffProfile)
│   │       ├── AuthContext.jsx         ← React auth context provider
│   │       ├── helpers.js             ← Shared utilities
│   │       └── timezone.js
│   └── styles/                        ← Shared CSS (global.css, design tokens)
│       ├── package.json
│       └── src/
├── apps/
│   ├── jobs/                          ← RENAMED from apps/frontend
│   │   ├── package.json               ← Depends on @fieldops/ui, @fieldops/lib
│   │   ├── vite.config.js
│   │   ├── netlify.toml               ← Per-app deployment config
│   │   └── src/
│   │       ├── App.jsx                ← Jobs app shell + routing
│   │       ├── pages/                 ← Existing 21 pages (unchanged)
│   │       └── components/            ← Jobs-specific components
│   ├── crm/                           ← NEW
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── netlify.toml
│   │   └── src/
│   │       ├── App.jsx
│   │       ├── main.jsx
│   │       └── pages/
│   │           ├── Dashboard.jsx      ← CRM dashboard (contact stats, recent activity)
│   │           ├── Clients.jsx        ← Client list + detail (expanded from Jobs app)
│   │           ├── Contractors.jsx    ← Contractor management + compliance
│   │           ├── Suppliers.jsx      ← Supplier management
│   │           ├── Contacts.jsx       ← Unified contact search across all types
│   │           └── Settings.jsx       ← CRM-specific settings
│   ├── field/                         ← NEW
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── netlify.toml
│   │   └── src/
│   │       ├── App.jsx
│   │       ├── main.jsx
│   │       └── pages/
│   │           ├── MyDay.jsx          ← Today's assigned jobs + schedule
│   │           ├── TimeLog.jsx        ← Quick time entry for field staff
│   │           ├── SitePhotos.jsx     ← Photo capture + markup at job site
│   │           ├── SafetyChecklist.jsx ← Pre-start safety forms
│   │           ├── JobNotes.jsx       ← Add notes/updates from the field
│   │           └── BillCapture.jsx    ← Snap receipts on the go
│   ├── dam/                           ← NEW
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── netlify.toml
│   │   └── src/
│   │       ├── App.jsx
│   │       ├── main.jsx
│   │       └── pages/
│   │           ├── Dashboard.jsx      ← Recent files, storage usage
│   │           ├── Browse.jsx         ← File browser with folders/tags
│   │           ├── Templates.jsx      ← Document templates (quotes, contracts, safety forms)
│   │           ├── Upload.jsx         ← Drag-and-drop bulk upload
│   │           └── Settings.jsx       ← Categories, tags, retention policies
│   ├── api/supabase/                  ← UNCHANGED (shared backend)
│   └── voice-assistant/               ← UNCHANGED
├── package.json                       ← Root: npm workspaces config
├── turbo.json                         ← NEW: Turborepo build orchestration
└── netlify.toml                       ← REMOVE (each app has its own)
```

---

## Phase 1 — Monorepo & Shared Packages (Foundation)

### 1.1 Set up npm workspaces + Turborepo

**Root `package.json`:**
```json
{
  "name": "business-suite",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "devDependencies": {
    "turbo": "^2"
  },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "dev:jobs": "turbo dev --filter=@fieldops/jobs",
    "dev:crm": "turbo dev --filter=@fieldops/crm",
    "dev:field": "turbo dev --filter=@fieldops/field",
    "dev:dam": "turbo dev --filter=@fieldops/dam"
  }
}
```

**`turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### 1.2 Extract shared packages

**`packages/lib`** — Extract from `apps/frontend/src/lib/`:
- `supabase.js` → Supabase client initialization
- `auth.js` → Auth helper functions (signIn, signOut, resetPassword, etc.)
- `AuthContext.jsx` → React auth provider + `useAuth()` hook
- `helpers.js` → Shared utilities from `utils/helpers.js`
- `timezone.js` → Timezone utilities
- `pdf.js` → PDF generation utilities

**`packages/ui`** — Extract from `apps/frontend/src/components/`:
- `Icon.jsx` → SVG icon system
- `shared.jsx` → StatusBadge, utility components
- `AddressFields.jsx` → Structured address input
- `AppSwitcher.jsx` → NEW: navigation between apps (see §5)
- `AppShell.jsx` → NEW: shared app layout (sidebar, header, app switcher)

**`packages/styles`** — Extract from `apps/frontend/src/styles/`:
- `global.css` → Reset, typography, design tokens
- `app-shell.module.css` → Shared layout styles

### 1.3 Rename `apps/frontend` → `apps/jobs`

- Rename the directory
- Update `package.json` name to `@fieldops/jobs`
- Update imports to use `@fieldops/lib` and `@fieldops/ui`
- Move `netlify.toml` from root into `apps/jobs/`
- Keep all existing pages and functionality intact

---

## Phase 2 — Cross-Subdomain Authentication (SSO)

### Strategy: Shared Supabase Auth + Token Relay Page

Supabase stores auth tokens in `localStorage` which is domain-scoped. For cross-subdomain SSO:

**Option A — Custom Domain with Shared Cookie (Recommended when domain is ready):**
- Use a custom domain like `fieldops.app`
- Configure Supabase auth cookies with `domain=.fieldops.app`
- All subdomains automatically share the session

**Option B — Token Relay (Works with any domain setup, use initially):**
1. User logs in on any app (e.g. `jobs-fieldops.netlify.app`)
2. Auth redirects store a short-lived token in Supabase (or URL param)
3. When navigating to another app, the App Switcher passes a one-time token
4. The target app exchanges the token for a session

### Implementation (Token Relay):

**New edge function: `auth-relay`**
```
POST /functions/v1/auth-relay
  action: "create"  → Creates a one-time relay token (valid 30 seconds)
  action: "exchange" → Exchanges relay token for a Supabase session
```

**New table: `shared.auth_relay_tokens`**
```sql
CREATE TABLE shared.auth_relay_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Flow:**
1. User clicks "CRM" in App Switcher (on Jobs app)
2. JS calls `auth-relay` → gets one-time token
3. Redirects to `crm.{domain}/auth/relay?token=xxx`
4. CRM app's `/auth/relay` route calls `auth-relay` exchange → gets session
5. User is now authenticated on CRM

**When custom domain is ready:** Switch to shared cookie approach — just reconfigure Supabase and remove the relay. All apps instantly share the session with zero code changes to the apps themselves.

---

## Phase 3 — Centralized Permissions

### 3.1 Database schema changes

**New table: `shared.apps`**
```sql
CREATE TABLE shared.apps (
  id TEXT PRIMARY KEY,         -- 'jobs', 'crm', 'field', 'dam'
  name TEXT NOT NULL,          -- 'Jobs', 'CRM', 'Field', 'DAM'
  description TEXT,
  icon TEXT,                   -- Icon name for App Switcher
  base_url TEXT,               -- 'https://jobs-fieldops.netlify.app'
  active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0
);

INSERT INTO shared.apps (id, name, description, icon, display_order) VALUES
  ('jobs',  'Jobs',  'Job management, quotes, invoices, bills', 'briefcase', 1),
  ('crm',   'CRM',   'Clients, contractors, suppliers',         'clients',   2),
  ('field', 'Field', 'Field crew daily schedule & time logging', 'schedule',  3),
  ('dam',   'DAM',   'Documents, templates, assets',             'files',     4);
```

**New table: `shared.staff_app_access`**
```sql
CREATE TABLE shared.staff_app_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES shared.staff(id) ON DELETE CASCADE,
  app_id TEXT REFERENCES shared.apps(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'viewer',  -- 'admin', 'editor', 'viewer'
  granted_by UUID REFERENCES shared.staff(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staff_id, app_id)
);
```

**Extend `shared.staff`:**
```sql
ALTER TABLE shared.staff ADD COLUMN default_app TEXT REFERENCES shared.apps(id) DEFAULT 'jobs';
```

### 3.2 RLS policies for app access

```sql
-- Users can only read data in apps they have access to
CREATE FUNCTION shared.has_app_access(app TEXT)
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
      SELECT 1 FROM shared.staff_app_access saa
      JOIN shared.staff s ON s.id = saa.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND saa.app_id = app
    ) OR shared.get_my_role() = 'admin';  -- admins always have access
  $$;
```

### 3.3 Permission management UI

In the **Jobs app** (admin settings) or a future **Admin** app:
- Settings → Users → click a user → "App Access" tab
- Toggle which apps the user can access
- Set per-app role (admin/editor/viewer)
- Set the user's default app (where they land after login)

---

## Phase 4 — Scaffold New Apps

Each new app follows the same pattern:

### App Template Structure
```
apps/{app-name}/
├── package.json          ← @fieldops/{app-name}, depends on @fieldops/lib, @fieldops/ui
├── vite.config.js        ← Standard Vite + React config
├── netlify.toml          ← App-specific deploy config
├── index.html
└── src/
    ├── main.jsx          ← React root + BrowserRouter + AuthProvider
    ├── App.jsx           ← Auth gate + AppShell + Routes
    ├── store.js          ← App-specific Zustand store (loads only what this app needs)
    ├── db.js             ← App-specific data fetching
    └── pages/            ← App pages
```

### 4.1 CRM App

**Purpose:** Central place to manage all contacts — clients, contractors, suppliers.

**Pages:**
| Page | Description |
|------|-------------|
| `Dashboard` | Contact stats (total clients, new this month, contractors expiring compliance) |
| `Clients` | Client list with search/filter, detail drawer (contact info, sites, job history, notes) |
| `Contractors` | Contractor list, compliance doc tracking (licenses, insurance, expiry dates) |
| `Suppliers` | Supplier list, order history, payment terms |
| `Contacts` | Unified search across all contact types |
| `Activity` | Communication/interaction log across all contacts |

**Database:** Uses existing `jobs.customers`, `shared.contractors`, `bills.suppliers` tables. New tables:

```sql
CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE crm.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_type TEXT NOT NULL,       -- 'client', 'contractor', 'supplier'
  contact_id UUID NOT NULL,
  type TEXT NOT NULL,               -- 'call', 'email', 'meeting', 'note'
  subject TEXT,
  notes TEXT,
  staff_id UUID REFERENCES shared.staff(id),
  interaction_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm.contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_type TEXT NOT NULL,
  contact_id UUID NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE(contact_type, contact_id, tag)
);
```

### 4.2 Field App

**Purpose:** Mobile-first app for field crews — see today's work, log time, capture photos/receipts.

**Pages:**
| Page | Description |
|------|-------------|
| `MyDay` | Today's assigned jobs with site address, contact, map link. Swipe to navigate days. |
| `TimeLog` | Quick time entry — select job, tap hours (30min chips), add note, submit |
| `SitePhotos` | Camera capture with optional markup, auto-tagged to current job |
| `SafetyChecklist` | Pre-start safety checklist (configurable templates) |
| `JobNotes` | Add notes/updates from the field, visible in Jobs app |
| `BillCapture` | Snap a receipt photo → AI extraction → linked to current job |

**Database:** Reads from `jobs.jobs`, `timesheets.entries`, writes to existing tables. New tables:

```sql
CREATE SCHEMA IF NOT EXISTS field;

CREATE TABLE field.safety_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs.jobs(id),
  staff_id UUID REFERENCES shared.staff(id),
  template_id UUID,
  responses JSONB NOT NULL,           -- { "question": "answer", ... }
  completed_at TIMESTAMPTZ DEFAULT now(),
  location_lat DECIMAL,
  location_lng DECIMAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE field.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  questions JSONB NOT NULL,            -- [{ "text": "...", "type": "yes_no" }, ...]
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Design notes:**
- PWA installable (add to home screen on iOS/Android)
- Large tap targets, minimal typing
- Works offline with sync queue (future enhancement)

### 4.3 DAM App

**Purpose:** Centralized document and asset management — not tied to specific jobs.

**Pages:**
| Page | Description |
|------|-------------|
| `Dashboard` | Recent files, storage usage, quick upload |
| `Browse` | Folder/tag-based file browser with search, preview, download |
| `Templates` | Document templates (quote templates, contract templates, safety forms) |
| `Upload` | Drag-and-drop upload with metadata (tags, category, description) |
| `Settings` | Categories, tag management, retention policies |

**Database:** Uses existing `dam` schema. New tables:

```sql
-- dam schema already exists, add tables:

CREATE TABLE dam.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES dam.folders(id),
  created_by UUID REFERENCES shared.staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dam.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,              -- Supabase Storage path
  file_type TEXT,                      -- MIME type
  file_size BIGINT,                    -- bytes
  folder_id UUID REFERENCES dam.folders(id),
  description TEXT,
  uploaded_by UUID REFERENCES shared.staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dam.asset_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES dam.assets(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(asset_id, tag)
);

CREATE TABLE dam.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,                       -- 'quote', 'contract', 'safety', 'marketing'
  asset_id UUID REFERENCES dam.assets(id),
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 5 — App Switcher & Navigation

### App Switcher Component (`packages/ui/src/AppSwitcher.jsx`)

A dropdown/grid in the top-left of every app that shows:
- All apps the user has access to (fetched from `shared.staff_app_access`)
- Current app highlighted
- Click to navigate (via token relay or direct link)
- Admin badge on apps where user has admin role

**Design:** Similar to Google's app grid (⊞ icon) or Atlassian's app switcher.

### Shared App Shell (`packages/ui/src/AppShell.jsx`)

Every app uses the same outer shell:
```
┌──────────────────────────────────────────┐
│ [⊞ Apps] [App Name]          [User] [⚙] │  ← Header
├────────┬─────────────────────────────────┤
│ Nav    │                                 │
│ Link 1 │      Page Content               │
│ Link 2 │                                 │
│ Link 3 │                                 │
│ ...    │                                 │
├────────┴─────────────────────────────────┤
│ Footer (optional)                        │
└──────────────────────────────────────────┘
```

- **Header:** App Switcher + app name + user avatar/menu + account settings
- **Sidebar:** App-specific navigation links (each app defines its own)
- **Content:** Route-based page rendering

This gives a consistent look across all apps while each app controls its own nav and pages.

---

## Phase 6 — Deployment

### Netlify Setup (one site per app)

Each app is a separate Netlify site:

| App | Netlify Site | Build Base | Custom Domain (future) |
|-----|-------------|-----------|----------------------|
| Jobs | `jobs-fieldops.netlify.app` | `apps/jobs` | `jobs.fieldops.app` |
| CRM | `crm-fieldops.netlify.app` | `apps/crm` | `crm.fieldops.app` |
| Field | `field-fieldops.netlify.app` | `apps/field` | `field.fieldops.app` |
| DAM | `dam-fieldops.netlify.app` | `apps/dam` | `dam.fieldops.app` |

Each app's `netlify.toml`:
```toml
[build]
  command = "cd ../.. && npm install && npx turbo build --filter=@fieldops/{app-name}"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Environment Variables (same across all apps)
```
VITE_SUPABASE_URL=https://cpfzjduxhzhzrahcicef.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_APP_ID=jobs|crm|field|dam
```

---

## Implementation Order

### Sprint 1 — Foundation (monorepo + shared packages)
1. Set up npm workspaces + Turborepo in root
2. Create `packages/lib` — extract supabase, auth, AuthContext, helpers
3. Create `packages/ui` — extract Icon, shared components
4. Create `packages/styles` — extract global CSS
5. Rename `apps/frontend` → `apps/jobs`, update imports
6. Verify Jobs app still builds and deploys correctly

### Sprint 2 — Permissions + Auth Relay
7. Database migration: `shared.apps`, `shared.staff_app_access` tables
8. Build `auth-relay` edge function
9. Add `/auth/relay` route to Jobs app (test with itself first)
10. Build App Switcher component
11. Build shared AppShell component
12. Add permission management UI to Jobs app Settings

### Sprint 3 — CRM App
13. Scaffold CRM app from template
14. Database migration: `crm` schema tables
15. Build CRM pages (Dashboard, Clients, Contractors, Suppliers, Contacts)
16. Deploy CRM to Netlify
17. Test cross-app navigation (Jobs ↔ CRM)

### Sprint 4 — Field App
18. Scaffold Field app from template
19. Database migration: `field` schema tables
20. Build Field pages (MyDay, TimeLog, SitePhotos, SafetyChecklist, JobNotes, BillCapture)
21. PWA manifest + service worker
22. Deploy Field to Netlify

### Sprint 5 — DAM App
23. Scaffold DAM app from template
24. Database migration: `dam` schema tables
25. Build DAM pages (Dashboard, Browse, Templates, Upload)
26. Deploy DAM to Netlify

### Sprint 6 — Polish
27. Custom domain setup (when ready)
28. Switch from token relay to shared cookie auth
29. Cross-app activity feeds
30. Unified search across apps

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Monorepo tool** | Turborepo | Lightweight, works with npm workspaces, minimal config |
| **Package manager** | npm workspaces | Already using npm, no migration needed |
| **SSO approach** | Token relay → shared cookie | Token relay works now with any domain; shared cookie is simpler once custom domain exists |
| **App isolation** | Separate Vite builds | Each app deploys independently, no coupling |
| **Shared code** | `packages/*` with workspace deps | Clean separation, IDE support, versioned |
| **Permissions** | `shared.staff_app_access` table | Simple, extensible, enforced by RLS |
| **FieldOps** | Becomes "Jobs" app | Keeps all existing functionality, just rebranded |
