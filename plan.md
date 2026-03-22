# CSS Modules Migration Plan

## Current State
- **2,802 inline `style={{}}` usages** across 4 JSX files
- **~250-line embedded `<style>` tag** in `job-management-app.jsx` (lines 593-842) with a full design system
- No CSS modules, no preprocessor, no Tailwind — just inline styles + one embedded `<style>` block
- Vite supports CSS modules out of the box (files named `*.module.css`)

## Strategy

Migrate incrementally, file-by-file, smallest to largest. Each phase is independently shippable.

---

### Phase 1 — Extract the embedded `<style>` tag → `app.module.css`
**Files:** `job-management-app.jsx`, new `app.module.css`

- Move the ~250-line `<style>` block into `src/app.module.css` as a CSS module
- Since these are global utility classes (`.btn`, `.card`, `.modal`, etc.) used via `className="btn btn-primary"` strings throughout the app, import them as a **regular CSS file** (not a module) first: `import './app.css'`
- This keeps all existing `className="..."` usage working with zero changes
- Rename the file from the inline `<style>` tag to `src/styles/global.css`

**Result:** Embedded styles extracted, no behaviour change.

### Phase 2 — Convert `LoginPage.jsx` (23 inline styles)
**Files:** `LoginPage.jsx`, new `LoginPage.module.css`

- Create `src/LoginPage.module.css` with classes for all inline styles
- Replace `style={{...}}` with `className={styles.xyz}` throughout
- Small, self-contained component — good proving ground

**Result:** LoginPage fully using CSS modules.

### Phase 3 — Convert `NotesTab.jsx` (86 inline styles)
**Files:** `NotesTab.jsx`, new `NotesTab.module.css`

- Create `src/NotesTab.module.css`
- Extract inline styles into named classes (`.toolbar`, `.noteCard`, `.categoryPill`, `.attachmentChip`, etc.)
- Dynamic styles (colours from props like `jobAccent`, `cat.color`) kept as minimal inline `style` for the dynamic part only, with layout/sizing in CSS

**Result:** NotesTab mostly CSS-module-driven with minimal inline for dynamic values.

### Phase 4 — Convert `App.jsx` (3 inline styles)
**Files:** `App.jsx`, new `App.module.css`

- Trivial — only 3 inline styles to convert

### Phase 5 — Convert `job-management-app.jsx` inline styles (2,690 usages)
This is the bulk of the work. Break into sub-phases by component/section:

**5a.** Layout & navigation (`jm-root`, `jm-sidebar`, `jm-topbar`, `jm-content`) — these already use global CSS classes, so focus on inline overrides

**5b.** Dashboard section — stat cards, charts, summary widgets

**5c.** Jobs section — job cards, kanban board, job detail drawer

**5d.** Quotes & Invoices — line items tables, totals, PDF preview

**5e.** Schedule — week grid, day columns, schedule cards

**5f.** Bills — upload zone, bill cards, extraction preview

**5g.** Time tracking — time entry forms, team stats

**5h.** Settings — tabs, user management, integrations

**5i.** Shared modals & drawers — `SectionDrawer`, `FormFillerModal`, `PhotoMarkupEditor`, `PlanDrawingEditor`, `PdfFormFiller`

**5j.** Work Orders & Purchase Orders

For each sub-phase:
- Create a `src/styles/[SectionName].module.css`
- Replace inline styles with `className={styles.xxx}`
- Keep dynamic values (computed colours, conditional widths) as minimal inline style or CSS variables

---

## Conventions

1. **File naming:** `ComponentName.module.css` alongside the component, or `src/styles/` for shared styles
2. **Class naming:** camelCase in modules (`.noteCard`, `.toolbarBtn`)
3. **Dynamic styles:** Use CSS custom properties (`style={{ '--accent': jobAccent }}`) + `var(--accent)` in CSS where possible; fall back to inline `style` for truly dynamic values
4. **Composition:** Use `composes:` in CSS modules for shared patterns (e.g., `composes: btn from './global.css'`)
5. **No new dependencies** — Vite handles CSS modules natively

## Execution Order

| Phase | Scope | Inline styles | Effort |
|-------|-------|--------------|--------|
| 1 | Extract `<style>` tag | 0 (existing classes) | Small |
| 2 | LoginPage | 23 | Small |
| 3 | NotesTab | 86 | Medium |
| 4 | App.jsx | 3 | Trivial |
| 5a-5j | job-management-app.jsx | 2,690 | Large (split across 10 sub-phases) |
