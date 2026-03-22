import { useState, useEffect, lazy, Suspense, Component } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
// db imports used by extracted pages — kept here only for re-export if needed
// Individual pages import directly from '../lib/db'
import { useAppStore } from './lib/store';
// supabase imports used by extracted pages — they import directly
import { useAuth } from './lib/AuthContext';
import { changePassword } from './lib/auth';
// pdf imports used by extracted pages — they import directly
// Heavy libraries loaded dynamically where used (fabric, pdfjs-dist, pdf-lib, signature_pad)

// ── TODO ─────────────────────────────────────────────────────────────────────
// Planned features & improvements for FieldOps:
//
// Features:
// TODO: Build digital asset management (DAM) for centralized templates, contracts, compliance docs, marketing assets
// TODO: Add drag-and-drop reordering for job phases and tasks
// TODO: Add notifications system (in-app + push) for overdue invoices, expiring contractor docs, job updates
//
// Integrations:
// TODO: Add webhook support for real-time Xero payment status updates (replace polling)
//
// ── File splitting plan (phased) ──────────────────────────────────────────
//
// Phase 1 — Quick wins (biggest impact, lowest risk):
// DONE: Extracted JobDetail (~2,000 lines) into pages/JobDetail.jsx
//       - Also extracted: PhotoMarkupEditor, PlanDrawingEditor, FormFillerModal,
//         BillModal, PdfFormFiller, OrderCard into components/
// DONE: Split JobDetail tabs into sub-components: JobPnL, JobGantt, JobTasks
// TODO: Extract Notes tab (~210 lines) — complex, tightly coupled with modals
// DONE: Extracted seed data (~450 lines) into fixtures/seedData.jsx
// DONE: Extracted CallerMemory (~340 lines) into pages/CallerMemory.jsx
// DONE: Extracted shared helpers (~100 lines) into utils/helpers.js
// DONE: Extracted Icon component into components/Icon.jsx
//
// Phase 2 — Route-based code splitting (developer experience + bundle size):
// DONE: Extracted all 21 route pages into pages/ (monolith reduced from ~9,500 to ~850 lines)
//       Dashboard, Jobs, Clients, Contractors, Suppliers, Schedule, Quotes, TimeTracking,
//       Bills, Invoices, Actions, Reminders, Activity, DisplaySchedule, DisplayOverview,
//       MyAssistant, Settings, Files, CallLog, SystemStatus, Orders
// DONE: Extracted OrderDrawer + helpers into components/OrderDrawer.jsx
// DONE: React.lazy() + Suspense for route-based code splitting
//       Initial bundle reduced from ~694KB to ~106KB (85% reduction)
//       Each page loads as a separate chunk on navigation
//
// Phase 3 — State management (performance + scalability):
// DONE: Replaced prop drilling with Zustand store (useAppStore)
// DONE: React.memo() on 15 heavy page components
// DONE: ErrorBoundary wrapping all routes with graceful error recovery
//
// Other technical debt:
// TODO: Add unit and integration tests for critical flows (quoting, invoicing, bill extraction)
// TODO: Replace inline styles with CSS modules or styled-components for maintainability
// TODO: Implement optimistic UI updates for better perceived performance
// ─────────────────────────────────────────────────────────────────────────────

// ── Google Font ──────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap";
document.head.appendChild(fontLink);

const spinStyle = document.createElement("style");
spinStyle.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
document.head.appendChild(spinStyle);

// ── Seed Data & Helpers (extracted) ──────────────────────────────────────────
import {
  SEED_CLIENTS, SEED_JOBS, SEED_QUOTES, SEED_SCHEDULE, SEED_FUTURE_SCHEDULE,
  SEED_TIME, SEED_BILLS, SEED_REMINDERS, SEED_CALL_LOG, SEED_INVOICES,
  DEFAULT_COMPANY, SEED_TEMPLATES, TEAM_DATA,
  ORDER_TERMINAL, SECTION_COLORS,
  SEED_WO, SEED_PO, SEED_CONTRACTORS, SEED_SUPPLIERS,
} from './fixtures/seedData.jsx';
import {
  CURRENT_USER, setCURRENT_USER, daysUntil,
  getContractorComplianceCount, hexToRgba,
} from './utils/helpers';
import { Icon } from './components/Icon';
// CallerMemory is lazy-loaded above
// Shared components used by extracted pages — they import directly
// Component imports used by extracted pages — they import directly
// (PhotoMarkupEditor, PlanDrawingEditor, FormFillerModal, BillModal, PdfFormFiller, OrderCard, JobDetail)

// ── Lazy-loaded page components (route-based code splitting) ────────────────
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Jobs = lazy(() => import('./pages/Jobs'));
const OrdersPage = lazy(() => import('./pages/Orders'));
const Clients = lazy(() => import('./pages/Clients'));
const Contractors = lazy(() => import('./pages/Contractors'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Quotes = lazy(() => import('./pages/Quotes'));
const TimeTracking = lazy(() => import('./pages/TimeTracking'));
const Bills = lazy(() => import('./pages/Bills'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Actions = lazy(() => import('./pages/Actions'));
const Reminders = lazy(() => import('./pages/Reminders'));
const ActivityPage = lazy(() => import('./pages/Activity'));
const DisplaySchedule = lazy(() => import('./pages/DisplaySchedule'));
const DisplayOverview = lazy(() => import('./pages/DisplayOverview'));
const MyAssistant = lazy(() => import('./pages/MyAssistant'));
const Settings = lazy(() => import('./pages/Settings'));
const FilesPage = lazy(() => import('./pages/Files'));
const CallLog = lazy(() => import('./pages/CallLog'));
const SystemStatus = lazy(() => import('./pages/SystemStatus'));
const CallerMemory = lazy(() => import('./pages/CallerMemory'));


// ── Global Styles ────────────────────────────────────────────────────────────
const injectStyles = () => {
  const s = document.createElement("style");
  s.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Open Sans', sans-serif !important; }
    .jm-root { font-family: 'Open Sans', sans-serif; background: #fafafa; color: #111; min-height: 100vh; min-height: 100dvh; display: flex; overflow-x: hidden; }
    .jm-sidebar { width: 220px; min-width: 220px; background: #111; color: #fff; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; height: 100vh; height: 100dvh; z-index: 100; }
    .jm-logo { padding: 24px 20px 20px; border-bottom: 1px solid #2a2a2a; }
    .jm-logo-mark { font-size: 11px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #fff; }
    .jm-logo-sub { font-size: 9px; color: #666; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 3px; }
    .jm-nav { flex: 1; padding: 16px 0; overflow-y: auto; }
    .jm-nav-section { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #444; padding: 16px 20px 6px; }
    .jm-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 20px; font-size: 13px; font-weight: 500; cursor: pointer; color: #999; border-left: 3px solid transparent; transition: all 0.15s; }
    .jm-nav-item:hover { color: #fff; }
    .jm-nav-item.active { color: #fff; border-left-color: #fff; background: #1e1e1e; }
    .jm-nav-item .badge { margin-left: auto; background: #fff; color: #111; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 7px; min-width: 20px; text-align: center; }
    .jm-main { margin-left: 220px; flex: 1; display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; min-width: 0; }
    .jm-topbar { background: #fff; border-bottom: 1px solid #e8e8e8; padding: 0 36px; padding-top: env(safe-area-inset-top, 0px); height: calc(60px + env(safe-area-inset-top, 0px)); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
    .jm-page-title { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
    .jm-topbar-actions { display: flex; gap: 10px; align-items: center; }
    .jm-content { padding: 28px 36px; flex: 1; }
    .btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; font-size: 13px; font-weight: 600; font-family: 'Open Sans', sans-serif; border: none; border-radius: 6px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
    .btn-primary { background: #111; color: #fff; }
    .btn-primary:hover { background: #333; }
    .btn-secondary { background: #fff; color: #111; border: 1.5px solid #ddd; }
    .btn-secondary:hover { border-color: #111; }
    .btn-ghost { background: transparent; color: #111; padding: 8px 12px; }
    .btn-ghost:hover { background: #f0f0f0; }
    .btn-danger { background: #fff; color: #c00; border: 1.5px solid #fcc; }
    .btn-danger:hover { background: #fff0f0; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn-xs { padding: 4px 9px; font-size: 11px; }
    .card { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; overflow: hidden; }
    .card-header { padding: 18px 20px 14px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; }
    .card-title { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
    .card-body { padding: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 22px; }
    .stat-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: 800; letter-spacing: -0.04em; color: #111; }
    .stat-sub { font-size: 12px; color: #999; margin-top: 4px; }
    .stat-card.dark { background: #111; border-color: #111; }
    .stat-card.dark .stat-label { color: #666; }
    .stat-card.dark .stat-value { color: #fff; }
    .stat-card.dark .stat-sub { color: #555; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #999; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; background: #fafafa; }
    td { padding: 14px 16px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f0f0f0; color: #555; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin-bottom: 6px; }
    .form-control { width: 100%; max-width: 100%; padding: 9px 12px; border: 1.5px solid #e0e0e0; border-radius: 6px; font-size: 13px; font-family: 'Open Sans', sans-serif; color: #111; background: #fff; outline: none; transition: border-color 0.15s; box-sizing: border-box; height: 44px; }
    input[type="date"].form-control, input[type="time"].form-control { -webkit-appearance: none; appearance: none; min-width: 0; width: 100%; height: 44px; }
    .form-control:focus { border-color: var(--section-accent, #111); }
    textarea.form-control { resize: vertical; min-height: 80px; height: auto; }
    select.form-control { cursor: pointer; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal { background: #fff; border-radius: 12px; width: 100%; max-width: 640px; max-height: 90vh; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
    .modal-lg { max-width: 800px; }
    .modal-header { padding: 20px 24px 16px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .modal-title { font-size: 16px; font-weight: 700; }
    .modal-body { padding: 24px; overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid #f0f0f0; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .tabs { display: flex; gap: 2px; border-bottom: 1px solid #e8e8e8; margin-bottom: 20px; overflow-y: hidden; }
    .tab { padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; color: #999; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
    .tab:hover { color: #333; }
    .tab.active { color: #111; border-bottom-color: var(--section-accent, #111); }
    .empty-state { text-align: center; padding: 48px 20px; color: #999; }
    .empty-state-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.4; }
    .empty-state-text { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #666; }
    .empty-state-sub { font-size: 12px; }
    .search-bar { display: flex; align-items: center; gap: 8px; background: #f5f5f5; border: 1.5px solid #e8e8e8; border-radius: 8px; padding: 9px 16px; min-width: 0; flex: 1; max-width: 480px; }
    .search-bar input { border: none; background: transparent; font-size: 13px; font-family: 'Open Sans', sans-serif; outline: none; flex: 1; color: #111; min-width: 0; }
    .search-bar:focus-within { border-color: var(--section-accent, #111); }
    .line-items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
    .line-items-table th { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #999; padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: left; }
    .line-items-table td { padding: 6px 8px; vertical-align: middle; }
    .line-items-table input { width: 100%; border: 1.5px solid #e8e8e8; border-radius: 4px; padding: 5px 7px; font-size: 12px; font-family: 'Open Sans', sans-serif; outline: none; box-sizing: border-box; min-width: 0; }
    .line-items-table input:focus { border-color: var(--section-accent, #111); }
    .totals-box { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px 16px; min-width: 220px; }
    .totals-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
    .totals-row.total { font-weight: 800; font-size: 15px; border-top: 1px solid #ddd; margin-top: 8px; padding-top: 8px; }
    .job-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.15s; }
    .job-card:hover { border-color: var(--section-accent, #111); box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .kanban { display: grid; grid-template-columns: repeat(5, minmax(200px,1fr)); gap: 18px; align-items: start; }
    .bill-pipeline { display: flex; flex-direction: column; gap: 18px; }
    .kanban-col { background: #f5f5f5; border-radius: 10px; padding: 14px; min-height: 200px; }
    .kanban-col-header { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #666; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
    .kanban-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; font-size: 12px; }
    .kanban-card:hover { border-color: var(--section-accent, #111); }

    /* ── Schedule week grid ── */
    .schedule-week-grid { display: grid; grid-template-columns: repeat(5, 1fr) minmax(0, 1fr); gap: 8px; }
    .schedule-weekend-stack { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
    .schedule-day-col { border: 1px solid #e5e5e5; border-radius: 8px; min-height: 120px; display: flex; flex-direction: column; overflow: hidden; }
    .schedule-day-col.schedule-day-compact { min-height: 0; flex: 1; }
    .schedule-day-header { padding: 6px 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .schedule-day-body { padding: 6px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .schedule-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 6px; padding: 8px 10px; cursor: grab; transition: all 0.15s; }
    .schedule-card:hover { border-color: var(--section-accent, #0891b2); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .schedule-card.dragging { opacity: 0.4; }
    .schedule-day-col.drag-over { background: #e0f7fa !important; border-color: #0891b2 !important; box-shadow: inset 0 0 0 2px rgba(8,145,178,0.2); }

    .priority-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
    .priority-high { background: #111; }
    .priority-medium { background: #777; }
    .priority-low { background: #ccc; }
    .avatar { width: 26px; height: 26px; border-radius: 50%; background: #111; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; border: 2px solid #fff; margin-left: -6px; }
    .avatar:first-child { margin-left: 0; }
    .avatar-group { display: flex; }
    .tag { display: inline-flex; padding: 2px 8px; background: #f0f0f0; color: #555; border-radius: 4px; font-size: 11px; font-weight: 600; margin: 2px; }
    .progress-bar { height: 4px; background: #e8e8e8; border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--section-accent, #111); border-radius: 2px; transition: width 0.3s; }
    .timeline { position: relative; padding-left: 24px; }
    .timeline::before { content: ''; position: absolute; left: 6px; top: 6px; bottom: 6px; width: 1px; background: #e8e8e8; }
    .timeline-item { position: relative; margin-bottom: 20px; }
    .timeline-dot { position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--section-accent, #111); border: 2px solid #fff; box-shadow: 0 0 0 1px var(--section-accent, #111); }
    .alert { padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
    .alert-info { background: #f5f5f5; border: 1px solid #e0e0e0; color: #444; }
    .alert-success { background: #f5fff5; border: 1px solid #c0e0c0; color: #2a5a2a; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
    .multi-select { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1.5px solid #e0e0e0; border-radius: 6px; min-height: 44px; }
    .multi-option { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1.5px solid #e0e0e0; color: #666; transition: all 0.1s; }
    .multi-option.selected { background: var(--section-accent, #111); color: #fff; border-color: var(--section-accent, #111); }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f0f0f0; color: #444; }

    /* ── Sidebar transition ── */
    .jm-sidebar { transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); }
    .jm-sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 99; }

    /* ── Hamburger ── */
    .jm-hamburger { display: none; align-items: center; justify-content: center; width: 38px; height: 38px; border: none; background: transparent; cursor: pointer; border-radius: 8px; color: #111; flex-shrink: 0; }
    .jm-hamburger:hover { background: #f0f0f0; }

    /* ── Bottom mobile nav ── */
    .jm-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; background: #111; z-index: 90; padding: 0; padding-bottom: env(safe-area-inset-bottom, 0px); border-top: 1px solid #222; }
    .jm-bottom-nav-inner { display: flex; align-items: stretch; }
    .jm-bottom-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px 10px; cursor: pointer; color: #666; gap: 3px; position: relative; min-width: 0; border: none; background: transparent; font-family: 'Open Sans', sans-serif; transition: color 0.15s; }
    .jm-bottom-nav-item.active { color: #fff; }
    .jm-bottom-nav-item span { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 52px; }
    .jm-bottom-nav-item .bnav-badge { position: absolute; top: 5px; right: calc(50% - 14px); background: #fff; color: #111; font-size: 8px; font-weight: 800; border-radius: 8px; padding: 1px 4px; min-width: 14px; text-align: center; }
    .jm-more-menu { position: fixed; bottom: 60px; right: 0; left: 0; background: #111; border-top: 1px solid #222; z-index: 95; padding: 8px 0; }
    .jm-more-menu-item { display: flex; align-items: center; gap: 14px; padding: 13px 24px; color: #bbb; font-size: 14px; font-weight: 600; cursor: pointer; border: none; background: transparent; font-family: 'Open Sans', sans-serif; width: 100%; text-align: left; }
    .jm-more-menu-item.active { color: #fff; background: #1e1e1e; }
    .jm-more-menu-item:hover { color: #fff; background: #1a1a1a; }
    .jm-more-badge { margin-left: auto; background: #fff; color: #111; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 7px; }

    .time-team-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    input, select, textarea { max-width: 100%; box-sizing: border-box; }

    /* ── Responsive breakpoints ── */
    @media (max-width: 1024px) {
      .jm-sidebar { transform: translateX(-100%); }
      .jm-sidebar.open { transform: translateX(0); }
      .jm-sidebar-overlay.open { display: block; }
      .jm-main { margin-left: 0 !important; }
      .jm-hamburger { display: flex; }
      .jm-sidebar-close { display: flex !important; }
    }
    @media (max-width: 767px) {
      .bill-pipeline { gap: 12px; }
      .jm-bottom-nav { display: flex; flex-direction: column; }
      .jm-content { padding: 16px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
      .jm-topbar { padding: 0 14px; padding-top: env(safe-area-inset-top, 0px); height: calc(54px + env(safe-area-inset-top, 0px)); }
      .jm-topbar-date { display: none; }
      .stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
      .stat-card { padding: 14px; }
      .stat-value { font-size: 20px; }
      .grid-2, .grid-3 { grid-template-columns: 1fr; }
      .kanban { grid-template-columns: repeat(2, minmax(160px,1fr)); overflow-x: auto; }
      .schedule-week-grid { grid-template-columns: 1fr; gap: 6px; }
      .schedule-weekend-stack { flex-direction: row; gap: 6px; }
      .schedule-weekend-stack .schedule-day-col { flex: 1; }
      .schedule-day-col { min-height: auto; flex-direction: row; align-items: stretch; }
      .schedule-day-col.schedule-day-compact { min-height: auto; }
      .schedule-day-header { padding: 8px 12px; min-width: 52px; justify-content: center; }
      .schedule-day-body { flex-direction: row; flex-wrap: wrap; padding: 8px; gap: 6px; align-items: center; }
      .schedule-card { min-width: 0; flex: 1 1 auto; }
      .dashboard-grid { grid-template-columns: 1fr !important; }
      .modal { border-radius: 16px 16px 0 0; max-height: 92vh; max-height: 92dvh; height: 92vh; height: 92dvh; }
      .modal-footer { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
      .modal-overlay { align-items: flex-end; padding: 0; }
      .modal-lg { max-width: 100%; }
      .topbar-actions-hide { display: none; }
      .line-items-table th:nth-child(3), .line-items-table td:nth-child(3) { display: none; }
      .time-team-stats { grid-template-columns: repeat(2, 1fr); }
      .form-control, input, select, textarea { font-size: 16px !important; }
      .line-items-table input, .line-items-table select { font-size: 14px !important; }
    }
    @media (min-width: 768px) and (max-width: 1024px) {
      .jm-content { padding: 20px; }
      .stat-grid { grid-template-columns: repeat(3, 1fr); }
      .kanban { grid-template-columns: repeat(3, minmax(160px,1fr)); overflow-x: auto; }
      .dashboard-grid { grid-template-columns: 1fr 1fr !important; }
      .modal .grid-2, .modal .grid-3 { grid-template-columns: 1fr; }
    }
    .bill-upload-zone { border: 2px dashed #d0d0d0; border-radius: 12px; padding: 32px 24px; text-align: center; cursor: pointer; transition: all 0.2s; color: #888; }
    .bill-upload-zone:hover { border-color: #999; background: #fafafa; }
    .bill-upload-zone.dragging { border-color: #111; background: #f5f5f5; color: #111; }
    .bill-preview-wrap { display: flex; gap: 16px; align-items: flex-start; background: #f8f8f8; border-radius: 10px; padding: 14px; }
    .bill-preview-img { width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #e0e0e0; flex-shrink: 0; }
    .bill-preview-info { flex: 1; min-width: 0; }
    .bill-extracting { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: #555; }
    .bill-spinner { width: 18px; height: 18px; border: 2.5px solid #e0e0e0; border-top-color: #111; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (min-width: 1025px) {
      .dashboard-grid { grid-template-columns: 1fr 1fr !important; }
    }
    @media (min-width: 1440px) {
      .jm-content { padding: 32px 48px; }
      .jm-topbar { padding: 0 48px; }
      .stat-grid { grid-template-columns: repeat(6, 1fr); gap: 18px; }
      .dashboard-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
      .kanban { gap: 20px; }
      .kanban-card { padding: 14px; }
      .card-body { padding: 24px; }
      .card-header { padding: 20px 24px 16px; }
      .modal-lg { max-width: 900px; }
    }
    @media (min-width: 1800px) {
      .jm-content { padding: 36px 56px; }
      .jm-topbar { padding: 0 56px; }
      .stat-grid { grid-template-columns: repeat(6, 1fr); gap: 20px; }
      .stat-value { font-size: 32px; }
      .dashboard-grid { grid-template-columns: 1fr 1fr 1fr !important; }
    }

    /* ── Section Drawers ── */
    .section-drawer-overlay { position: fixed; inset: 0; z-index: 1050; display: flex; }
    .section-drawer-backdrop { flex: 1; background: rgba(0,0,0,0.4); }
    .section-drawer { display: flex; flex-direction: column; background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,0.2); width: 100%; max-width: 640px; height: 100%; overflow: hidden; border-left: 1px solid #e8e8e8; }
    .order-drawer-overlay { position: fixed; inset: 0; z-index: 1050; display: flex; }
    .order-drawer-backdrop { flex: 1; background: rgba(0,0,0,0.4); }
    .order-drawer { display: flex; flex-direction: column; background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,0.2); width: 100%; max-width: 640px; height: 100%; overflow: hidden; border-left: 1px solid #e8e8e8; }
    .order-badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .order-progress-track { height: 6px; background: #f1f5f9; border-radius: 999px; overflow: hidden; margin-top: 8px; }
    .order-progress-fill { height: 100%; border-radius: 999px; transition: width 0.5s; }
    .order-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; }
    .order-card:hover { border-color: #93c5fd; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .order-panel { position: fixed; inset: 0; z-index: 1040; display: flex; }
    .order-panel-backdrop { flex: 1; background: rgba(0,0,0,0.3); }
    .order-panel-body { width: 100%; max-width: 480px; background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,0.2); display: flex; flex-direction: column; height: 100%; border-left: 1px solid #e8e8e8; }
    .order-email-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1060; display: flex; align-items: flex-start; justify-content: center; padding: 20px; overflow-y: auto; }
    .order-email-modal { background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); width: 100%; max-width: 640px; margin: 24px 0; overflow: hidden; }
    .order-tabs { display: flex; background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 4px; gap: 4px; }
    .order-tab { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: #64748b; border: none; background: transparent; font-family: 'Open Sans', sans-serif; white-space: nowrap; transition: all 0.15s; }
    .order-tab.active-dash { background: #111; color: #fff; }
    .order-tab.active-wo { background: #2563eb; color: #fff; }
    .order-tab.active-po { background: #059669; color: #fff; }
    .order-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (min-width: 640px) { .order-kpi-grid { grid-template-columns: repeat(4, 1fr); } }
    .order-kpi-card { border-radius: 12px; border: 1px solid #e8e8e8; padding: 16px; cursor: pointer; transition: all 0.15s; }
    .order-kpi-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .order-cards-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 640px) { .order-cards-grid { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 1024px) { .order-cards-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .order-toggle { width: 36px; height: 20px; border-radius: 10px; position: relative; cursor: pointer; transition: background 0.2s; border: none; flex-shrink: 0; }
    .order-toggle-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #fff; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s; }
    .order-toggle.on .order-toggle-knob { transform: translateX(16px); }
  `;
  document.head.appendChild(s);
};
injectStyles();



const HamburgerIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    {open
      ? <><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></>
      : <><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></>
    }
  </svg>
);

const ChangePasswordModal = ({ onClose }) => {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (pw !== confirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      await changePassword(pw);
      setSuccess(true);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "28px 32px", width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Change Password</div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>Enter a new password for your account</div>
        {success ? (
          <>
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#059669", marginBottom: 16 }}>Password updated successfully.</div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ width: "100%" }}>Close</button>
          </>
        ) : (
          <form onSubmit={save}>
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{error}</div>}
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>New Password</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" required autoFocus
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 12 }} />
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-sm" style={{ background: "#111", color: "#fff", border: "none", opacity: saving ? 0.6 : 1 }} disabled={saving}>
                {saving ? "Saving…" : "Update Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 20, maxWidth: 500, margin: "0 auto 20px" }}>{this.state.error.message}</div>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Page Loading Fallback ────────────────────────────────────────────────────
const PageLoader = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", flexDirection: "column", gap: 12 }}>
    <div style={{ width: 28, height: 28, border: "3px solid #e8e8e8", borderTopColor: "#111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <div style={{ color: "#999", fontSize: 13 }}>Loading…</div>
  </div>
);

const ROUTE_MAP = {
  dashboard: "/",
  jobs: "/jobs",
  orders: "/orders",
  clients: "/clients",
  contractors: "/contractors",
  suppliers: "/suppliers",
  schedule: "/schedule",
  quotes: "/quotes",
  time: "/time",
  bills: "/bills",
  invoices: "/invoices",
  actions: "/actions",
  reminders: "/reminders",
  activity: "/activity",
  status: "/status",
  settings: "/settings",
  files: "/files",
  calllog: "/call-log",
  assistant: "/my-assistant",
  memory: "/caller-memory",
};
const PATH_TO_ID = Object.fromEntries(
  Object.entries(ROUTE_MAP).map(([id, path]) => [path, id])
);

export default function App() {
  const auth = useAuth();
  // Update module-level CURRENT_USER from auth context
  if (auth.staff) setCURRENT_USER(auth.staff.name);

  const location = useLocation();
  const routerNavigate = useNavigate();
  const page = PATH_TO_ID[location.pathname] || "dashboard";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hoverNav, setHoverNav] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // ── Store: only what App itself needs (badge counts + loading state) ────
  const { jobs, bills, invoices, quotes, workOrders, purchaseOrders, contractors, reminders, loading, dbError, init: storeInit } = useAppStore();

  // ── Initialise store on mount ───────────────────────────────────────────
  useEffect(() => {
    const initTemplates = (() => {
      try { const saved = localStorage.getItem("fieldops_templates"); return saved ? JSON.parse(saved) : SEED_TEMPLATES; } catch { return SEED_TEMPLATES; }
    })();
    const initCompanyInfo = (() => {
      try { const saved = localStorage.getItem("fieldops_company_info"); return saved ? JSON.parse(saved) : { ...DEFAULT_COMPANY }; } catch { return { ...DEFAULT_COMPANY }; }
    })();

    storeInit({
      clients: SEED_CLIENTS,
      jobs: SEED_JOBS,
      quotes: SEED_QUOTES,
      invoices: SEED_INVOICES,
      timeEntries: SEED_TIME,
      bills: SEED_BILLS,
      schedule: SEED_SCHEDULE,
      futureSchedule: SEED_FUTURE_SCHEDULE,
      contractors: SEED_CONTRACTORS,
      suppliers: SEED_SUPPLIERS,
      staff: TEAM_DATA.map((t, i) => ({ id: i + 1, name: t.name, costRate: t.costRate, chargeRate: t.chargeRate })),
      reminders: SEED_REMINDERS,
      callLog: SEED_CALL_LOG,
      templates: initTemplates,
      companyInfo: initCompanyInfo,
      workOrders: SEED_WO,
      purchaseOrders: SEED_PO,
    });
  }, []);

  const pendingBillsCount = bills.filter(b => b.status === "inbox" || b.status === "linked" || b.status === "approved").length;
  const unpaidInvCount = invoices.filter(i => i.status !== "paid" && i.status !== "void").length;
  const activeJobsCount = jobs.filter(j => j.status === "in_progress").length;
  const ordersOverdueCount = [...workOrders, ...purchaseOrders].filter(o => !ORDER_TERMINAL.includes(o.status) && daysUntil(o.dueDate) < 0).length;
  const contractorComplianceIssues = contractors.reduce((sum, c) => sum + getContractorComplianceCount(c), 0);
  const overdueRemindersCount = reminders.filter(r => r.status === "pending" && r.dueDate < new Date().toISOString().split("T")[0]).length;
  const overdueJobsCount = jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled").length;
  const draftQuotesCount = quotes.filter(q => q.status === "draft").length;
  const woAwaitingCount = workOrders.filter(wo => wo.status === "Sent").length;
  const totalActionsCount = overdueRemindersCount + ordersOverdueCount + pendingBillsCount + unpaidInvCount + contractorComplianceIssues + overdueJobsCount + draftQuotesCount + woAwaitingCount;

  const navItems = [
    // Top (no section header) — 0..3
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "actions", label: "Actions", icon: "notification", badge: totalActionsCount || null, badgeColor: "#dc2626" },
    { id: "schedule", label: "Schedule", icon: "schedule" },
    { id: "reminders", label: "Reminders", icon: "notification", badge: overdueRemindersCount || null, badgeColor: "#dc2626" },
    { id: "assistant", label: "My Assistant", icon: "send" },
    // Main — 5..6
    { id: "jobs", label: "Jobs", icon: "jobs", badge: activeJobsCount || null },
    { id: "orders", label: "Orders", icon: "orders", badge: ordersOverdueCount || null },
    // Finance — 7..10
    { id: "time", label: "Time", icon: "time" },
    { id: "bills", label: "Bills", icon: "bills", badge: pendingBillsCount || null },
    { id: "quotes", label: "Quotes", icon: "quotes" },
    { id: "invoices", label: "Invoices", icon: "invoices", badge: unpaidInvCount || null },
    // Partners — 11..13
    { id: "clients", label: "Clients", icon: "clients" },
    { id: "contractors", label: "Contractors", icon: "contractors", badge: contractorComplianceIssues || null, badgeColor: "#dc2626" },
    { id: "suppliers", label: "Suppliers", icon: "suppliers" },
    // System — 14+
    ...((auth.isAdmin || auth.isLocalDev) ? [{ id: "settings", label: "Settings", icon: "settings" }] : []),
    { id: "files", label: "Files", icon: "quotes" },
    { id: "calllog", label: "Call Log", icon: "send" },
    { id: "memory", label: "Caller Memory", icon: "clients" },
    { id: "activity", label: "Activity", icon: "notification" },
    { id: "status", label: "System Status", icon: "activity" },
  ];

  // Bottom nav shows first 6; rest in "More"
  const bottomNavItems = navItems.slice(0, 6);
  const moreNavItems = navItems.slice(6);
  const moreIsActive = moreNavItems.some(n => n.id === page);

  const pageTitles = { dashboard: "Dashboard", jobs: "Jobs", orders: "Orders", clients: "Clients", contractors: "Contractors", suppliers: "Suppliers", schedule: "Schedule", quotes: "Quotes", time: "Time Tracking", bills: "Bills & Costs", invoices: "Invoices", actions: "Actions", reminders: "Reminders", activity: "Activity Log", status: "System Status", settings: "Settings", files: "Files", calllog: "Call Log", assistant: "My Assistant", memory: "Caller Memory" };

  const navigate = (id) => {
    routerNavigate(ROUTE_MAP[id] || "/");
    setSidebarOpen(false);
    setMoreOpen(false);
  };

  const routeElements = (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Dashboard onNav={navigate} />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/contractors" element={<Contractors />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/time" element={<TimeTracking />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/actions" element={<Actions onNav={navigate} />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/status" element={<SystemStatus />} />
          <Route path="/settings" element={(auth.isAdmin || auth.isLocalDev) ? <Settings /> : <Navigate to="/" replace />} />
          <Route path="/my-assistant" element={<MyAssistant />} />
          <Route path="/caller-memory" element={<CallerMemory />} />
          <Route path="/call-log" element={<CallLog onNav={navigate} />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/display/schedule" element={<DisplaySchedule />} />
          <Route path="/display/overview" element={<DisplayOverview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );

  // Display routes render without nav shell
  const isDisplay = location.pathname.startsWith("/display/");
  if (isDisplay) {
    return (
      <div>
        {loading ? (
          <div style={{ background: "#000", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading…</div>
        ) : routeElements}
      </div>
    );
  }

  return (
    <div className="jm-root" onClick={() => moreOpen && setMoreOpen(false)}>
      {loading && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "#fafafa", zIndex: 9999 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e8e8e8", borderTopColor: "#111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ color: "#888", fontSize: 14 }}>Loading…</div>
        </div>
      )}
      {dbError && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "#fafafa", zIndex: 9999 }}>
          <div style={{ color: "#e74c3c", fontWeight: 700 }}>Failed to connect to database</div>
          <div style={{ color: "#888", fontSize: 13 }}>{dbError}</div>
        </div>
      )}
      {!loading && !dbError && (
      <>
      {/* Overlay for mobile sidebar */}
      <div className={`jm-sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <nav className={`jm-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="jm-logo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="jm-logo-mark">FieldOps</div>
            <div className="jm-logo-sub">Job Management</div>
          </div>
          {/* Close btn visible only on mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ display: "none", background: "transparent", border: "none", color: "#666", cursor: "pointer", padding: 4 }}
            className="jm-sidebar-close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="3" x2="15" y2="15"/><line x1="15" y1="3" x2="3" y2="15"/>
            </svg>
          </button>
        </div>
        <div className="jm-nav">
          {/* Top — Dashboard, Actions, Schedule, Reminders, My Assistant (no section header) */}
          {navItems.slice(0, 5).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              onMouseEnter={() => setHoverNav(n.id)} onMouseLeave={() => setHoverNav(null)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : hoverNav === n.id ? { borderLeftColor: accent, color: '#fff', background: hexToRgba(accent, 0.10) } : undefined}>
              <Icon name={n.icon} size={15} />{n.label}
              {n.badge ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          <div className="jm-nav-section">Main</div>
          {navItems.slice(5, 7).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              onMouseEnter={() => setHoverNav(n.id)} onMouseLeave={() => setHoverNav(null)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : hoverNav === n.id ? { borderLeftColor: accent, color: '#fff', background: hexToRgba(accent, 0.10) } : undefined}>
              <Icon name={n.icon} size={15} />{n.label}
              {n.badge ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          <div className="jm-nav-section">Finance</div>
          {navItems.slice(7, 11).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              onMouseEnter={() => setHoverNav(n.id)} onMouseLeave={() => setHoverNav(null)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : hoverNav === n.id ? { borderLeftColor: accent, color: '#fff', background: hexToRgba(accent, 0.10) } : undefined}>
              <Icon name={n.icon} size={15} />{n.label}
              {n.badge ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          <div className="jm-nav-section">Partners</div>
          {navItems.slice(11, 14).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              onMouseEnter={() => setHoverNav(n.id)} onMouseLeave={() => setHoverNav(null)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : hoverNav === n.id ? { borderLeftColor: accent, color: '#fff', background: hexToRgba(accent, 0.10) } : undefined}>
              <Icon name={n.icon} size={15} />{n.label}
              {n.badge ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          <div className="jm-nav-section">System</div>
          {navItems.slice(14).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.activity)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              onMouseEnter={() => setHoverNav(n.id)} onMouseLeave={() => setHoverNav(null)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : hoverNav === n.id ? { borderLeftColor: accent, color: '#fff', background: hexToRgba(accent, 0.10) } : undefined}>
              <Icon name={n.icon} size={15} />{n.label}
              {n.badge ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
        </div>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e1e1e", position: "relative" }}>
          {/* User menu popover */}
          {showUserMenu && !auth.isLocalDev && (
            <div style={{ position: "absolute", bottom: "100%", left: 12, right: 12, background: "#1e1e1e", borderRadius: 8, border: "1px solid #333", padding: 4, marginBottom: 4, zIndex: 10 }}>
              <button onClick={() => { setShowChangePassword(true); setShowUserMenu(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: "#ccc", fontSize: 12, cursor: "pointer", borderRadius: 6, fontFamily: "'Open Sans', sans-serif", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = "#333"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                Change Password
              </button>
              <button onClick={() => { auth.signOut(); setShowUserMenu(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: "#f87171", fontSize: 12, cursor: "pointer", borderRadius: 6, fontFamily: "'Open Sans', sans-serif", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = "#333"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9"/></svg>
                Sign Out
              </button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: auth.isLocalDev ? "default" : "pointer" }} onClick={() => !auth.isLocalDev && setShowUserMenu(v => !v)}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flexShrink: 0 }}>
              {(auth.staff?.name || "AJ").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auth.staff?.name || "Alex Jones"}</div>
              <div style={{ fontSize: 10, color: "#555", textTransform: "capitalize" }}>{auth.staff?.role || "Admin"}</div>
            </div>
            {!auth.isLocalDev && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showUserMenu ? "#fff" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "transform 0.15s", transform: showUserMenu ? "rotate(180deg)" : "rotate(0)" }}>
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            )}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="jm-main">
        {/* Top bar */}
        <div className="jm-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="jm-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
              <HamburgerIcon open={sidebarOpen} />
            </button>
            <span className="jm-page-title">{pageTitles[page]}</span>
          </div>
          <div className="jm-topbar-actions">
            <button className="btn btn-ghost btn-sm" style={{ color: "#999" }}><Icon name="notification" size={16} /></button>
            <div className="topbar-actions-hide" style={{ width: 1, height: 24, background: "#e8e8e8" }} />
            <span className="topbar-actions-hide jm-topbar-date" style={{ fontSize: 12, color: "#999" }}>Mon, 9 Mar 2026</span>
          </div>
        </div>

        {/* Page content */}
        <div className="jm-content" style={{ '--section-accent': (SECTION_COLORS[page] || SECTION_COLORS.dashboard).accent }}>
          {routeElements}
        </div>
      </div>

      {/* More menu (slides up from bottom nav) */}
      {moreOpen && (
        <div className="jm-more-menu" onClick={e => e.stopPropagation()}>
          {moreNavItems.map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.activity)?.accent;
            return (
            <button key={n.id} className={`jm-more-menu-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              onMouseEnter={e => { e.currentTarget.style.background = hexToRgba(accent, 0.12); e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; }}
              style={page === n.id ? { color: '#fff', background: hexToRgba(accent, 0.15) } : undefined}>
              <Icon name={n.icon} size={16} />
              {n.id === "time" ? "Time Tracking" : n.id === "bills" ? "Bills & Costs" : n.label}
              {n.badge ? <span className="jm-more-badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </button>
            );
          })}
        </div>
      )}

      {/* Bottom navigation (mobile only) */}
      <div className="jm-bottom-nav">
        <div className="jm-bottom-nav-inner">
          {bottomNavItems.map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.dashboard)?.accent;
            return (
            <button key={n.id} className={`jm-bottom-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              style={page === n.id ? { color: accent, boxShadow: `inset 0 2px 0 ${accent}` } : undefined}>
              {n.badge ? <span className="bnav-badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
            </button>
            );
          })}
          {/* More button */}
          <button
            className={`jm-bottom-nav-item ${moreIsActive ? "active" : ""}`}
            onClick={e => { e.stopPropagation(); setMoreOpen(o => !o); }}
          >
            {(pendingBillsCount + unpaidInvCount + overdueRemindersCount) > 0 && !moreIsActive
              ? <span className="bnav-badge" style={overdueRemindersCount > 0 ? { background: "#dc2626", color: "#fff" } : undefined}>{pendingBillsCount + unpaidInvCount + overdueRemindersCount}</span>
              : null}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
            <span>More</span>
          </button>
        </div>
      </div>
      </>
      )}

      {/* Change Password Modal */}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
