# Authentication Implementation Plan

## Overview
Add email/password authentication for internal staff using Supabase Auth. Two roles: **Admin** (full access) and **Staff** (restricted to own work).

---

## Current State
- No auth — app loads straight to Dashboard
- Hardcoded `CURRENT_USER = "Alex Jones"` for activity logging
- `shared.staff` table already has `auth_user_id UUID REFERENCES auth.users(id)` column (unused)
- Supabase Auth service is running but not integrated
- All RLS policies are wide open (`USING (true)`)
- All routes are unprotected

---

## Implementation Steps

### Phase 1 — Auth Context & Login Page

**1. Create `src/lib/auth.js` — Auth helper module**
- `signIn(email, password)` — wraps `supabase.auth.signInWithPassword()`
- `signOut()` — wraps `supabase.auth.signOut()`
- `getSession()` — returns current session
- `onAuthStateChange(callback)` — listens for login/logout events
- `getStaffProfile(userId)` — fetches the `shared.staff` row linked to the auth user

**2. Create `src/components/AuthProvider.jsx` — React auth context**
- Provides `{ user, staff, role, loading, signIn, signOut }` via context
- On mount: checks `supabase.auth.getSession()`, fetches linked staff profile
- Listens to `onAuthStateChange` to handle session expiry/refresh
- `user` = Supabase auth user, `staff` = staff profile row, `role` = staff.role

**3. Create login page (inline in `job-management-app.jsx`)**
- Clean login form: email + password fields, sign-in button, error display
- Matches existing app styling (Open Sans, dark accents, white cards)
- Shows the FieldOps logo/brand at top
- No sign-up form — admin creates accounts (see Phase 2)

**4. Wrap the app with AuthProvider**
- In `App.jsx`: wrap `<JobManagementApp />` with `<AuthProvider>`
- Show login page when no session, show main app when authenticated
- Show loading spinner while checking session

**5. Replace hardcoded `CURRENT_USER`**
- Replace `const CURRENT_USER = "Alex Jones"` with the logged-in staff's `full_name`
- Update the sidebar footer to show the real user's name, initials, and role
- All activity log entries now use the real user identity

### Phase 2 — User Management (Admin Only)

**6. Add "Users" section to Settings page**
- New tab in Settings: "Users" (alongside existing "Integrations")
- Admin-only — Staff users don't see this tab
- Lists all staff with: name, email, role, active status
- Invite new user flow:
  1. Admin enters name, email, role
  2. Creates Supabase auth user via `supabase.auth.admin.createUser()` (edge function needed — admin API can't be called from client)
  3. Creates linked `shared.staff` row with `auth_user_id`
  4. Sends welcome email with temporary password or reset link
- Edit user: change role, toggle active status
- Deactivate (not delete) — preserves audit trail

**7. Create `invite-user` edge function**
- Supabase admin API requires the service role key (can't be in the frontend)
- Edge function accepts: `{ email, fullName, role }`
- Creates auth user with `supabase.auth.admin.createUser()`
- Creates `shared.staff` row linked to the auth user
- Returns success/error

### Phase 3 — Role-Based Access Control

**8. Frontend route guards**
- Admin: full access to everything
- Staff restrictions:
  - Can view all jobs, clients, schedule (read-only for unassigned)
  - Can only log time for themselves
  - Can only edit jobs they're assigned to
  - Cannot access: Settings (Users tab), user management
  - Bills: can capture but cannot approve/post
  - Cannot delete anything except their own time entries
- Hide UI elements (buttons, tabs) the user's role can't access
- Show a toast/message if they somehow try a restricted action

**9. Tighten Supabase RLS policies**
- Replace `USING (true)` with proper policies:
  - Staff can read most tables
  - Staff can only INSERT/UPDATE their own time entries
  - Staff can only UPDATE jobs where they're in `assigned_staff_ids`
  - Only admins can DELETE, manage users, change settings
  - All policies check `auth.uid()` against `shared.staff.auth_user_id`
- This is the server-side enforcement — frontend restrictions are UX only

### Phase 4 — Session & Security Polish

**10. Session management**
- Auto-refresh tokens (Supabase handles this, but confirm it's working)
- Handle expired sessions gracefully — redirect to login with message
- "Remember me" option on login (longer session duration)
- Show session timeout warning

**11. Password management**
- "Change password" option in user profile/settings
- "Forgot password" link on login page → Supabase password reset email
- Admin can trigger password reset for any user

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/auth.js` | Create | Auth helper functions |
| `src/components/AuthProvider.jsx` | Create | React auth context provider |
| `src/job-management-app.jsx` | Modify | Add login page, replace CURRENT_USER, add route guards, add Users settings tab |
| `src/App.jsx` | Modify | Wrap with AuthProvider, conditional login/app render |
| `apps/api/supabase/functions/invite-user/` | Create | Edge function for admin user creation |
| `apps/api/supabase/migrations/` | Create | New migration for RLS policy updates |

---

## Suggested Build Order

| Step | What | Effort |
|------|------|--------|
| 1 | Auth module + AuthProvider + Login page | First — gets login/logout working |
| 2 | Replace CURRENT_USER + sidebar identity | Quick win after step 1 |
| 3 | User management in Settings (admin) | Needed to create accounts |
| 4 | invite-user edge function | Required for step 3 |
| 5 | Frontend role guards (hide/disable UI) | UX-level access control |
| 6 | RLS policy migration | Server-side enforcement |
| 7 | Password reset + session polish | Final hardening |

---

## Notes
- No client/external user access — staff & admin only
- Email + password sign-in via Supabase Auth
- The existing `shared.staff.auth_user_id` column is already in place — no schema change needed for the core link
- Seed data staff (Tom Baker, Sarah Lee, etc.) will need auth accounts created to become real users
- The invite-user edge function needs the `SUPABASE_SERVICE_ROLE_KEY` as a secret
