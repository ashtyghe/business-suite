import { useState, useEffect, useRef, useMemo, Fragment, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { fetchAll, createCustomer, updateCustomer, deleteCustomer, createSite, updateSite, deleteSite, createJob, updateJob, deleteJob, createQuote, updateQuote, deleteQuote, createInvoice, updateInvoice, deleteInvoice, createTimeEntry, updateTimeEntry, deleteTimeEntry, createBill, updateBill, deleteBill, createScheduleEntry, updateScheduleEntry, deleteScheduleEntry, uploadFile, createAttachment, deleteAttachment, createWorkOrder, updateWorkOrder, deleteWorkOrder, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, createContractor, updateContractor, deleteContractor, createContractorDoc, updateContractorDoc, deleteContractorDoc, createPhase, updatePhase, deletePhase, createTask, updateTask, deleteTask, createNote, updateNote, deleteNote, createAuditEntry } from './lib/db';
import { useAppStore } from './lib/store';
import { supabase, extractBillFromImage, extractDocumentFromImage, sendEmail, inviteUser, updateStaffRecord, xeroOAuth, xeroSyncInvoice, xeroSyncBill, xeroSyncContact, xeroPollUpdates, xeroFetchAccounts, xeroGetMappings, xeroSaveMappings } from './lib/supabase';
import { useAuth } from './lib/AuthContext';
import { changePassword, adminResetUserPassword } from './lib/auth';
import { buildQuotePdfHtml, buildInvoicePdfHtml, buildOrderPdfHtml, htmlToPdfBase64 } from './lib/pdf';
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
// TODO: Split JobDetail into sub-components: JobOverview, JobPhases, JobTasks, JobNotes, JobFinance, JobDocuments
// DONE: Extracted seed data (~450 lines) into fixtures/seedData.jsx
// DONE: Extracted CallerMemory (~340 lines) into pages/CallerMemory.jsx
// DONE: Extracted shared helpers (~100 lines) into utils/helpers.js
// DONE: Extracted Icon component into components/Icon.jsx
//
// Phase 2 — Route-based code splitting (developer experience + bundle size):
// TODO: Extract route pages into separate files under pages/:
//       - Dashboard (~750 lines) → pages/Dashboard.jsx
//       - Jobs (~900 lines) → pages/Jobs.jsx
//       - Clients (~960 lines) → pages/Clients.jsx
//       - Contractors (~700 lines) → pages/Contractors.jsx
//       - Quotes (~670 lines) → pages/Quotes.jsx
//       - Bills (~780 lines) → pages/Bills.jsx
//       - Invoices (~390 lines) → pages/Invoices.jsx
//       - TimeTracking (~310 lines) → pages/TimeTracking.jsx
//       - Settings (~1,200 lines) → pages/Settings.jsx
// TODO: Add React.lazy() + Suspense for route-based code splitting
//       - Reduces initial bundle from ~944KB to ~200KB shell + lazy chunks
// TODO: Extract reusable components into components/:
//       - LineItemsEditor, PhotoMarkupEditor, PlanDrawingEditor
//       - OrderDrawer, OrderCard, OrderEmailModal
//
// Phase 3 — State management (performance + scalability):
// DONE: Replaced prop drilling with Zustand store (useAppStore) — all route components
//       now consume data directly from the store instead of receiving 22+ props
// TODO: Add React.memo() boundaries to prevent full-tree re-renders on any state change
// TODO: Add proper error boundaries around each major section
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
  DEFAULT_COMPANY, DEFAULT_COLUMNS, SEED_TEMPLATES, TEAM_DATA, TEAM,
  NOTE_CATEGORIES, FORM_TEMPLATES,
  ORDER_CONTRACTORS, ORDER_SUPPLIERS, ORDER_UNITS,
  ORDER_STATUSES, ORDER_TRANSITIONS, ORDER_TERMINAL, ORDER_ACTIVE,
  ORDER_STATUS_PROGRESS, ORDER_STATUS_COLORS, ORDER_BAR_COLORS,
  SECTION_COLORS, ViewField,
  SEED_WO, SEED_PO, CONTRACTOR_TRADES,
  SEED_CONTRACTORS, SEED_SUPPLIERS,
  STATUS_COLORS, STATUS_BG, STATUS_TEXT,
} from './fixtures/seedData.jsx';
import {
  fmt, calcQuoteTotal, uid, CURRENT_USER, setCURRENT_USER, nowTs, mkLog, addLog,
  genId, orderToday, orderAddDays, orderFmtDate, daysUntil, fmtFileSize,
  orderFmtTs, makeLogEntry, orderAddLog, applyTransition, orderJobDisplay,
  COMPLIANCE_DOC_TYPES, COMPLIANCE_STATUS_COLORS,
  getComplianceStatus, getDaysUntilExpiry, getContractorComplianceCount,
  calcHoursFromTimes, addMinsToTime, hexToRgba,
  ORDER_STATUS_TRIGGERS,
} from './utils/helpers';
import { Icon } from './components/Icon';
import CallerMemory from './pages/CallerMemory';
import {
  StatusBadge, XeroSyncBadge, AvatarGroup, CloseBtn,
  OrderIcon, OrderStatusBadge, DueDateChip, OrderProgressBar,
  SectionProgressBar, FileIconBadge, BillStatusBadge, BILL_CATEGORIES,
  SectionLabel, SectionDrawer, LineItemsEditor, ActivityLog,
  BILL_STATUSES, BILL_STATUS_LABELS,
} from './components/shared';
import { PhotoMarkupEditor } from './components/PhotoMarkupEditor';
import { PlanDrawingEditor } from './components/PlanDrawingEditor';
import { FormFillerModal } from './components/FormFillerModal';
import { BillModal } from './components/BillModal';
import { PdfFormFiller } from './components/PdfFormFiller';
import { OrderCard } from './components/OrderCard';
import JobDetail from './pages/JobDetail';

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


const OrderFileAttachments = ({ files, onChange, onMarkup, onLightbox }) => {
  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { onChange(prev => prev.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x)); };
        reader.readAsDataURL(m._file);
      }
    });
    onChange(prev => [...prev, ...mapped]);
    e.target.value = "";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {files.length > 0 && files.map(f => (
        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover", border: "1px solid #e2e8f0", cursor: "pointer" }} onClick={() => onLightbox && onLightbox(f.dataUrl)} />
            : <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><FileIconBadge name={f.name} /></div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmtFileSize(f.size)}</div>
          </div>
          {f.dataUrl && f.type?.startsWith("image/") && onMarkup && <button onClick={() => onMarkup(f.dataUrl, f.id)} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", fontSize: 11 }} title="Mark up">✏️</button>}
          <button onClick={() => onChange(prev => prev.filter(x => x.id !== f.id))} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }}>
            <OrderIcon name="x" size={14} />
          </button>
        </div>
      ))}
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 13, fontWeight: 500 }}>
        <OrderIcon name="upload" size={16} />
        {files.length > 0 ? "Add more files" : "Attach files — drawings, specs, photos…"}
        <input type="file" multiple style={{ display: "none" }} onChange={handleFiles} accept="*/*" />
      </label>
    </div>
  );
};

const OrderLineItems = ({ lines, onChange }) => {
  const add = () => onChange([...lines, { id: genId(), desc: "", qty: "1", unit: "ea" }]);
  const remove = (id) => onChange(lines.filter(l => l.id !== id));
  const update = (id, field, val) => onChange(lines.map(l => l.id === id ? { ...l, [field]: val } : l));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 30px", gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", padding: "0 4px" }}>
        <span>Description</span><span>Qty</span><span>Unit</span><span></span>
      </div>
      {lines.map(l => (
        <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 30px", gap: 8, alignItems: "center" }}>
          <input className="form-control" style={{ height: 36, fontSize: 13 }} placeholder="Description" value={l.desc} onChange={e => update(l.id, "desc", e.target.value)} />
          <input className="form-control" style={{ height: 36, fontSize: 13 }} type="number" min="0" placeholder="Qty" value={l.qty} onChange={e => update(l.id, "qty", e.target.value)} />
          <select className="form-control" style={{ height: 36, fontSize: 13 }} value={l.unit} onChange={e => update(l.id, "unit", e.target.value)}>
            {ORDER_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <button onClick={() => remove(l.id)} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }}><OrderIcon name="x" size={14} /></button>
        </div>
      ))}
      <button onClick={add} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#2563eb", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
        <OrderIcon name="plus" size={14} /> Add line item
      </button>
    </div>
  );
};

const OrderAuditLog = ({ log }) => {
  if (!log || log.length === 0) return <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>No activity recorded yet.</div>;
  const getColor = (action) => {
    if (action.startsWith("Created")) return { bg: "#f1f5f9", text: "#64748b" };
    if (action.startsWith("Status")) return { bg: "#dbeafe", text: "#2563eb" };
    if (action.startsWith("Emailed")) return { bg: "#ede9fe", text: "#7c3aed" };
    if (action.startsWith("Edited")) return { bg: "#fef3c7", text: "#d97706" };
    return { bg: "#f1f5f9", text: "#64748b" };
  };
  return (
    <div>
      {[...log].reverse().map((entry, i) => (
        <div key={entry.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < log.length - 1 ? "1px solid #f1f5f9" : "none" }}>
          <div style={{ width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: getColor(entry.action).bg, color: getColor(entry.action).text, flexShrink: 0 }}>
            <OrderIcon name={entry.auto ? "zap" : "activity"} size={10} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{entry.action}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {entry.auto && <span style={{ fontSize: 10, fontWeight: 600, color: "#d97706", background: "#fffbeb", padding: "1px 6px", borderRadius: 4, border: "1px solid #fcd34d" }}>auto</span>}
                <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{orderFmtTs(entry.ts)}</span>
              </div>
            </div>
            {entry.detail && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{entry.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Orders: PDF + Acceptance Page ─────────────────────────────────────────────
const printOrderPdf = (type, order, jobs) => {
  const job = jobs.find(j => j.id === order.jobId);
  const html = buildOrderPdfHtml({ type, order, job });
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups to generate PDF."); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 400);
};

// ── Orders: Email Modal ───────────────────────────────────────────────────────
const OrderEmailModal = ({ type, order, jobs, companyInfo, onClose, onSent }) => {
  const isWO = type === "wo";
  const partyEmail = isWO ? order.contractorEmail : order.supplierEmail;
  const partyName = isWO ? order.contractorName : order.supplierName;
  const partyContact = isWO ? order.contractorContact : order.supplierContact;
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const job = jobs.find(j => j.id === order.jobId);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const docType = isWO ? "work_order" : "purchase_order";
  const acceptUrl = order.acceptToken
    ? `${supabaseUrl}/functions/v1/accept-document?token=${order.acceptToken}&type=${docType}`
    : null;
  const [includeAcceptLink, setIncludeAcceptLink] = useState(true);
  const [includePdf, setIncludePdf] = useState(true);
  const [to, setTo] = useState(partyEmail || "");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(null);
  const accent = isWO ? "#2563eb" : "#059669";
  const ToggleBtn = ({ on, onChange, accentCol }) => (
    <button className={`order-toggle ${on ? "on" : ""}`} style={{ background: on ? (accentCol || accent) : "#e2e8f0" }} onClick={() => onChange(!on)}>
      <div className="order-toggle-knob" />
    </button>
  );
  const handleSend = async () => {
    if (!to) return;
    setSending(true); setSendError(null);
    try {
      // Generate PDF attachment
      let attachments = [];
      if (includePdf) {
        const pdfHtml = buildOrderPdfHtml({ type, order, job, company: companyInfo, acceptUrl: includeAcceptLink ? acceptUrl : null });
        try {
          const pdfBase64 = await htmlToPdfBase64(pdfHtml, `${order.ref}.pdf`);
          attachments.push({ filename: `${order.ref}.pdf`, content: pdfBase64 });
        } catch (e) { console.warn("PDF generation failed:", e); }
      }
      // Send via Resend
      const emailData = {
        number: order.ref,
        jobTitle: jd?.name || "",
        acceptUrl: includeAcceptLink ? acceptUrl : undefined,
        ...(isWO ? { contractorName: partyContact || partyName } : { supplierName: partyContact || partyName }),
      };
      await sendEmail(docType, to, emailData, { cc: cc || undefined, attachments });
      if (onSent) onSent(`Emailed to ${to}${cc ? ", cc: " + cc : ""}${includeAcceptLink ? " · acceptance link included" : ""}`);
      setSent(true);
    } catch (err) {
      setSendError(err.message || "Failed to send email");
    } finally { setSending(false); }
  };
  if (sent) return (
    <div className="order-email-overlay">
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxWidth: 400, width: "100%", padding: 32, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, background: "#d1fae5", borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><OrderIcon name="check" size={24} cls="" /></div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Email Sent</h3>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>{isWO ? "Work order" : "Purchase order"} {order.ref} has been sent to {to}.</p>
        <button className="btn btn-primary" style={{ background: accent }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
  return (
    <div className="order-email-overlay">
      <div className="order-email-modal">
        <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff", background: accent }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <OrderIcon name="mail" size={18} />
            <div><div style={{ fontSize: 11, fontWeight: 500, opacity: 0.75 }}>Send via Email</div><div style={{ fontWeight: 700 }}>{order.ref}</div></div>
          </div>
          <button onClick={onClose} style={{ padding: 6, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff" }}><OrderIcon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {sendError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#dc2626" }}>{sendError}</div>}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">To</label><input className="form-control" type="email" placeholder="recipient@example.com" value={to} onChange={e => setTo(e.target.value)} />{partyName && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{partyName}</div>}</div>
            <div className="form-group"><label className="form-label">CC <span style={{ fontWeight: 400, color: "#cbd5e1", textTransform: "none" }}>optional</span></label><input className="form-control" type="text" placeholder="cc@example.com" value={cc} onChange={e => setCc(e.target.value)} /></div>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#475569" }}>Email Options</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <ToggleBtn on={includePdf} onChange={v => setIncludePdf(v)} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", background: "#fef2f2", padding: "2px 6px", borderRadius: 4 }}>PDF</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Attach {order.ref}.pdf</span>
                    <button onClick={() => printOrderPdf(type, order, jobs)} style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>Preview</button>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Professional PDF with all document details attached to the email</div>
                </div>
              </div>
              {acceptUrl && (
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <ToggleBtn on={includeAcceptLink} onChange={v => setIncludeAcceptLink(v)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>✅ Accept Button</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>HTML button in email + link on PDF — recipient clicks to accept</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            <strong style={{ color: "#334155" }}>Email preview:</strong> Branded HTML email with {isWO ? "work order" : "purchase order"} details, {includePdf ? "PDF attachment" : "no attachment"}{includeAcceptLink && acceptUrl ? ", and Accept button" : ""}. Sent from <strong>FieldOps</strong> via Resend.
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ background: accent, opacity: sending ? 0.6 : 1 }} disabled={!to || sending} onClick={handleSend}>
            <OrderIcon name="send" size={14} /> {sending ? "Sending..." : `Send ${isWO ? "to Contractor" : "to Supplier"}`}
          </button>
        </div>
      </div>
    </div>
  );
};


// ── Orders: Order Drawer ──────────────────────────────────────────────────────
const OrderDrawer = ({ type, order, initialMode = "view", onSave, onClose, onTransition, jobs, presetJobId, companyInfo }) => {
  const isWO = type === "wo";
  const parties = isWO ? ORDER_CONTRACTORS : ORDER_SUPPLIERS;
  const isNew = !order;
  const baseForm = {
    id: genId(), ref: (isWO ? "WO-" : "PO-") + String(Math.floor(Math.random() * 900) + 100), status: "Draft",
    jobId: presetJobId || "", issueDate: orderToday(), dueDate: orderAddDays(orderToday(), 14), poLimit: "", notes: "", internalNotes: "",
    attachments: [], auditLog: [makeLogEntry("Created", isWO ? "Work order created" : "Purchase order created")],
  };
  const woFields = { contractorId: "", contractorName: "", contractorContact: "", contractorEmail: "", contractorPhone: "", trade: "", scopeOfWork: "" };
  const poFields = { supplierId: "", supplierName: "", supplierContact: "", supplierEmail: "", supplierAbn: "", deliveryAddress: "", lines: [{ id: genId(), desc: "", qty: "1", unit: "ea" }] };
  const [form, setForm] = useState(() => order ? { ...order } : { ...baseForm, ...(isWO ? woFields : poFields) });
  const [mode, setMode] = useState(isNew ? "edit" : initialMode);
  const [dirty, setDirty] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [markupImg, setMarkupImg] = useState(null);
  const [showPlanDrawing, setShowPlanDrawing] = useState(false);
  const [showOrderPdfFiller, setShowOrderPdfFiller] = useState(null);
  const orderPdfInputRef = useRef(null);
  const [orderEmailSending, setOrderEmailSending] = useState(false);
  const [orderEmailStatus, setOrderEmailStatus] = useState(null);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  const handleOrderPdfFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setShowOrderPdfFiller({ pdfData: ev.target.result, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleOrderPdfSave = ({ filledPdfDataUrl, thumbnail, fields: pdfFields, fileName: filledName }) => {
    const att = { id: genId(), name: filledName, size: Math.round(filledPdfDataUrl.length * 0.75), type: "application/pdf", dataUrl: filledPdfDataUrl, pdfThumbnail: thumbnail };
    setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
    setDirty(true);
    setShowOrderPdfFiller(null);
  };

  const handleDirectSendOrder = async () => {
    const recipientEmail = isWO ? form.contractorEmail : form.supplierEmail;
    const recipientName = isWO ? form.contractorName : form.supplierName;
    const emailType = isWO ? "work_order" : "purchase_order";
    if (!recipientEmail) { alert(`No ${isWO ? "contractor" : "supplier"} email address found.`); return; }
    const jobTitle = jobs.find(j => j.id === form.jobId)?.title || "";
    if (!window.confirm(`Send ${form.ref} via email to ${recipientName} (${recipientEmail})?`)) return;
    setOrderEmailSending(true); setOrderEmailStatus(null);
    try {
      await sendEmail(emailType, recipientEmail, { ...form, jobTitle, contractorName: form.contractorName, supplierName: form.supplierName });
      setOrderEmailStatus({ type: "success", msg: `Sent to ${recipientEmail}` });
      let u = form;
      u = { ...u, auditLog: [...(u.auditLog || []), { action: "Emailed via Resend", detail: `Sent to ${recipientEmail}`, ts: new Date().toISOString(), user: "System" }] };
      setForm(u); if (onSave) onSave(u);
      setTimeout(() => setOrderEmailStatus(null), 4000);
    } catch (err) {
      setOrderEmailStatus({ type: "error", msg: err.message || "Failed to send" });
    } finally { setOrderEmailSending(false); }
  };

  const saveOrderMarkup = (dataUrl) => {
    if (markupImg?.attachmentId) {
      // Replace existing attachment with marked-up version
      setForm(f => ({ ...f, attachments: f.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a) }));
      setDirty(true);
    } else {
      // Add as new attachment from lightbox markup
      const att = { id: genId(), name: "markup_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
      setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
      setDirty(true);
    }
    setMarkupImg(null);
  };

  const saveOrderPlan = (dataUrl) => {
    const att = { id: genId(), name: "plan_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
    setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
    setDirty(true);
    setShowPlanDrawing(false);
  };
  const selectParty = (id) => {
    const p = parties.find(x => x.id === id);
    if (!p) { set(isWO ? "contractorId" : "supplierId", ""); return; }
    if (isWO) setForm(f => ({ ...f, contractorId: p.id, contractorName: p.name, contractorContact: p.contact, contractorEmail: p.email, contractorPhone: p.phone, trade: p.trade }));
    else setForm(f => ({ ...f, supplierId: p.id, supplierName: p.name, supplierContact: p.contact, supplierEmail: p.email, supplierAbn: p.abn }));
    setDirty(true);
  };
  const handleTransition = (newStatus) => { const updated = applyTransition(form, newStatus); setForm(updated); setDirty(true); if (onTransition) onTransition(updated); };
  const handleSave = () => { const toSave = dirty ? orderAddLog(form, "Edited", "Order details updated") : form; onSave(toSave); setDirty(false); setMode("view"); };
  const availableTransitions = ORDER_TRANSITIONS[form.status] || [];
  const isTerminal = ORDER_TERMINAL.includes(form.status);
  const jd = orderJobDisplay(jobs.find(j => j.id === form.jobId));
  const partyId = isWO ? form.contractorId : form.supplierId;
  const partyName = isWO ? form.contractorName : form.supplierName;
  const accent = isWO ? SECTION_COLORS.wo.accent : SECTION_COLORS.po.accent;
  const lightTint = isWO ? SECTION_COLORS.wo.light : SECTION_COLORS.po.light;

  if (showEmail) return <OrderEmailModal type={type} order={form} jobs={jobs} companyInfo={companyInfo} onClose={() => setShowEmail(false)}
    onSent={(detail) => {
      let u = orderAddLog(form, "Emailed", detail, false);
      if (form.status === "Approved") u = applyTransition(u, "Sent");
      setForm(u); setDirty(false); if (onSave) onSave(u); setShowEmail(false);
    }} />;

  const statusStripEl = (
    <div style={{ padding: "12px 20px", background: lightTint, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", overflowY: "hidden" }}>
          {availableTransitions.map(s => (
            <button key={s} onClick={() => handleTransition(s)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: ORDER_STATUS_TRIGGERS[s] ? "1px solid #fcd34d" : "1px solid #cbd5e1", background: ORDER_STATUS_TRIGGERS[s] ? "#fef3c7" : "#fff", color: ORDER_STATUS_TRIGGERS[s] ? "#92400e" : "#475569", cursor: "pointer" }}>
              {ORDER_STATUS_TRIGGERS[s] && <OrderIcon name="zap" size={10} />}{s}
            </button>
          ))}
          {availableTransitions.length === 0 && isTerminal && <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>No further transitions</span>}
        </div>
        <DueDateChip dateStr={form.dueDate} isTerminal={isTerminal} />
      </div>
      <OrderProgressBar status={form.status} />
      <div style={{ display: "flex", gap: 8, marginTop: 6, overflowX: "auto" }}>
        {ORDER_STATUSES.filter(s => s !== "Cancelled").map(s => (
          <span key={s} style={{ fontSize: 11, whiteSpace: "nowrap", fontWeight: form.status === s ? 700 : 400, color: form.status === s ? "#334155" : "#cbd5e1" }}>{s}</span>
        ))}
      </div>
    </div>
  );

  const footerEl = <>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      <button className="btn btn-secondary btn-sm" onClick={() => printOrderPdf(type, form, jobs)}><OrderIcon name="file" size={14} /> PDF</button>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {mode === "edit" && dirty && <button className="btn btn-primary" style={{ background: accent }} onClick={handleSave}>Save</button>}
      {mode === "edit" && !isNew && !dirty && <button className="btn btn-secondary" onClick={() => setMode("view")}>Done editing</button>}
      {mode === "view" && <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} disabled={orderEmailSending} onClick={handleDirectSendOrder}><OrderIcon name="send" size={14} /> {orderEmailSending ? "Sending..." : `Email ${isWO ? "Contractor" : "Supplier"}`}</button>}
      {mode === "view" && <button className="btn btn-primary" style={{ background: accent }} onClick={() => setShowEmail(true)}><OrderIcon name="mail" size={14} /> Draft Email</button>}
      {isNew && <button className="btn btn-primary" style={{ background: accent }} onClick={handleSave}>Create {isWO ? "Work Order" : "Purchase Order"}</button>}
    </div>
  </>;

  return (<>
    <SectionDrawer
      accent={accent}
      icon={<OrderIcon name={isWO ? "briefcase" : "shopping"} size={16} />}
      typeLabel={isWO ? "Work Order" : "Purchase Order"}
      title={form.ref}
      statusBadge={<OrderStatusBadge status={form.status} />}
      mode={mode} setMode={setMode} isNew={isNew}
      statusStrip={statusStripEl}
      footer={footerEl}
      onClose={() => { if (!dirty) onClose(); }}
    >
      {mode === "view" ? (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {orderEmailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: orderEmailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: orderEmailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${orderEmailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{orderEmailStatus.msg}</div>}
          <div className="grid-2">
            <div>
              <div className="form-label">{isWO ? "Contractor" : "Supplier"}</div>
              <div style={{ fontWeight: 600, color: "#1e293b" }}>{partyName || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>None selected</span>}</div>
              {isWO ? <><div style={{ fontSize: 13, color: "#64748b" }}>{form.contractorContact}</div><div style={{ fontSize: 13, color: "#64748b" }}>{form.contractorEmail}</div><div style={{ fontSize: 13, color: "#64748b" }}>{form.contractorPhone}</div></> :
                <><div style={{ fontSize: 13, color: "#64748b" }}>{form.supplierContact}</div><div style={{ fontSize: 13, color: "#64748b" }}>{form.supplierEmail}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>ABN: {form.supplierAbn}</div></>}
            </div>
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              <div><span style={{ fontSize: 11, color: "#94a3b8" }}>Issue Date</span><div style={{ fontWeight: 500 }}>{orderFmtDate(form.issueDate)}</div></div>
              <div><span style={{ fontSize: 11, color: "#94a3b8" }}>{isWO ? "Due Date" : "Delivery Date"}</span><div style={{ fontWeight: 500 }}>{orderFmtDate(form.dueDate)}</div></div>
              {jd && <div><span style={{ fontSize: 11, color: "#94a3b8" }}>Linked Job</span><div style={{ fontWeight: 500 }}>{jd.ref} · {jd.name}</div></div>}
              {form.poLimit && <div><span style={{ fontSize: 11, color: "#94a3b8" }}>PO Limit</span><div style={{ fontWeight: 700, color: "#b45309" }}>${parseFloat(form.poLimit).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div></div>}
            </div>
          </div>
          {isWO && form.scopeOfWork && <div style={{ background: lightTint, borderRadius: 12, padding: 16 }}><div className="form-label" style={{ color: accent }}>Scope of Work</div><div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-line", lineHeight: 1.6 }}>{form.scopeOfWork}</div></div>}
          {!isWO && form.deliveryAddress && <div style={{ background: lightTint, borderRadius: 12, padding: 16 }}><div className="form-label" style={{ color: accent }}>Delivery Address</div><div style={{ fontSize: 13 }}>{form.deliveryAddress}</div></div>}
          {!isWO && form.lines && form.lines.length > 0 && (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "2px solid #e2e8f0" }}><th style={{ textAlign: "left", padding: "8px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8" }}>Description</th><th style={{ textAlign: "center", padding: "8px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", width: 60 }}>Qty</th><th style={{ textAlign: "center", padding: "8px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", width: 60 }}>Unit</th></tr></thead>
              <tbody>{form.lines.map(l => <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: "10px 4px" }}>{l.desc || "—"}</td><td style={{ padding: "10px 4px", textAlign: "center", color: "#475569" }}>{l.qty}</td><td style={{ padding: "10px 4px", textAlign: "center", color: "#94a3b8" }}>{l.unit}</td></tr>)}</tbody>
            </table>
          )}
          {form.notes && <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}><div className="form-label">Notes / Terms</div><div style={{ fontSize: 13, color: "#475569", whiteSpace: "pre-line" }}>{form.notes}</div></div>}
          {form.internalNotes && <div style={{ background: "#fffbeb", borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", marginBottom: 4 }}>Internal Notes</div><div style={{ fontSize: 13, color: "#92400e" }}>{form.internalNotes}</div></div>}
          {form.attachments && form.attachments.length > 0 && (
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
              <div className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><OrderIcon name="paperclip" size={11} /> Attachments ({form.attachments.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {form.attachments.map(f => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", cursor: f.dataUrl ? "pointer" : "default" }}
                    onClick={() => f.dataUrl && setLightboxImg(f.dataUrl)}>
                    {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>{fmtFileSize(f.size)}</div></div>
                    {f.dataUrl && f.type?.startsWith("image/") && <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: f.dataUrl, attachmentId: f.id }); }} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", fontSize: 11 }} title="Mark up">✏️</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
            <div className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><OrderIcon name="activity" size={11} /> Activity Log</div>
            <OrderAuditLog log={form.auditLog} />
          </div>
        </div>
      ) : (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Contractor" : "Supplier"}</label><select className="form-control" value={partyId} onChange={e => selectParty(e.target.value)}><option value="">{"— Select " + (isWO ? "contractor" : "supplier") + " —"}</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Linked Job</label><select className="form-control" value={form.jobId} onChange={e => set("jobId", e.target.value ? Number(e.target.value) : "")}><option value="">— No linked job —</option>{jobs.map(j => { const d = orderJobDisplay(j); return <option key={j.id} value={j.id}>{d.ref + " · " + d.name}</option>; })}</select></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Issue Date</label><input type="date" className="form-control" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">{isWO ? "Due Date" : "Delivery Date"}</label><input type="date" className="form-control" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></div>
          </div>
          {isWO && <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div style={{ position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>$</span><input type="number" min="0" step="0.01" className="form-control" style={{ paddingLeft: 28 }} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>}
          {isWO ? (
            <div className="form-group"><label className="form-label">Scope of Work</label><textarea rows={6} className="form-control" style={{ height: "auto" }} placeholder="Describe the full scope of work..." value={form.scopeOfWork} onChange={e => set("scopeOfWork", e.target.value)} /></div>
          ) : (
            <>
              <div className="form-group"><label className="form-label">Delivery Address</label><input type="text" className="form-control" placeholder="Site or warehouse delivery address" value={form.deliveryAddress} onChange={e => set("deliveryAddress", e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Items to Order</label><OrderLineItems lines={form.lines} onChange={v => set("lines", v)} /></div>
              <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div style={{ position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>$</span><input type="number" min="0" step="0.01" className="form-control" style={{ paddingLeft: 28 }} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>
            </>
          )}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Terms & Notes (visible to contractor)" : "Notes (visible to supplier)"}</label><textarea rows={3} className="form-control" style={{ height: "auto" }} placeholder="Payment terms, special instructions..." value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Internal Notes</label><textarea rows={3} className="form-control" style={{ height: "auto" }} placeholder="Not shown on document" value={form.internalNotes} onChange={e => set("internalNotes", e.target.value)} /></div>
          </div>
          <div className="form-group">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}><OrderIcon name="paperclip" size={12} /> Attachments</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn btn-sm" style={{ background: "#7c3aed", color: "#fff", border: "none", fontSize: 12 }} onClick={() => orderPdfInputRef.current?.click()}>📄 Fill PDF</button>
                <input ref={orderPdfInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleOrderPdfFile} />
                <button type="button" className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none", fontSize: 12 }} onClick={() => setShowPlanDrawing(true)}>📐 Draw Plan</button>
              </div>
            </div>
            <OrderFileAttachments files={form.attachments} onChange={updater => { setForm(f => ({ ...f, attachments: typeof updater === "function" ? updater(f.attachments) : updater })); setDirty(true); }}
              onMarkup={(src, attachmentId) => setMarkupImg({ src, attachmentId })}
              onLightbox={(src) => setLightboxImg(src)} />
          </div>
        </div>
      )}
    </SectionDrawer>

    {/* Lightbox */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <img src={lightboxImg} alt="Attachment" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} />
        <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: lightboxImg }); setLightboxImg(null); }}
          style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 8, background: "#0891b2", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
    )}

    {/* Photo Markup Editor */}
    {markupImg && (
      <PhotoMarkupEditor imageSrc={markupImg.src} onSave={saveOrderMarkup} onClose={() => setMarkupImg(null)} />
    )}

    {/* Plan Drawing Editor */}
    {showPlanDrawing && (
      <PlanDrawingEditor onSave={saveOrderPlan} onClose={() => setShowPlanDrawing(false)} />
    )}

    {/* PDF Form Filler */}
    {showOrderPdfFiller && (
      <PdfFormFiller
        pdfData={showOrderPdfFiller.pdfData}
        fileName={showOrderPdfFiller.fileName}
        onSave={handleOrderPdfSave}
        onClose={() => setShowOrderPdfFiller(null)}
      />
    )}
    </>
  );
};

// ── Orders: Order Card ────────────────────────────────────────────────────────

// ── Orders: Dashboard ─────────────────────────────────────────────────────────
const OrdersDashboard = ({ workOrders, purchaseOrders, onView, onEdit, onStatusChange, jobs }) => {
  const [panel, setPanel] = useState(null);
  const [localWO, setLocalWO] = useState(workOrders);
  const [localPO, setLocalPO] = useState(purchaseOrders);
  if (localWO !== workOrders && JSON.stringify(localWO.map(o=>o.id+o.status)) !== JSON.stringify(workOrders.map(o=>o.id+o.status))) setLocalWO(workOrders);
  if (localPO !== purchaseOrders && JSON.stringify(localPO.map(o=>o.id+o.status)) !== JSON.stringify(purchaseOrders.map(o=>o.id+o.status))) setLocalPO(purchaseOrders);
  const allOrders = [...localWO.map(o => ({ ...o, _type: "wo" })), ...localPO.map(o => ({ ...o, _type: "po" }))];
  const now = orderToday();
  const overdue = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status) && o.dueDate && o.dueDate < now).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const dueSoon = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status) && o.dueDate && o.dueDate >= now && daysUntil(o.dueDate) <= 7).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const active = allOrders.filter(o => ORDER_ACTIVE.includes(o.status)).sort((a,b) => (a.dueDate||"").localeCompare(b.dueDate||""));
  const openList = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status)).sort((a,b) => (a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  const openPanel = (label, orders) => setPanel({ label, orders });
  const handleDashTransition = (order, newStatus) => {
    const updated = applyTransition(order, newStatus);
    if (order._type === "wo") setLocalWO(prev => prev.map(o => o.id === updated.id ? updated : o));
    else setLocalPO(prev => prev.map(o => o.id === updated.id ? updated : o));
    onStatusChange(order._type, updated);
    setPanel(p => p ? { ...p, orders: p.orders.map(o => o.id === updated.id ? { ...updated, _type: order._type } : o) } : null);
  };
  const PanelRow = ({ order }) => {
    const isWO = order._type === "wo"; const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
    const isTerminal = ORDER_TERMINAL.includes(order.status); const transitions = ORDER_TRANSITIONS[order.status] || [];
    const pName = isWO ? order.contractorName : order.supplierName;
    return (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e8e8" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, cursor: "pointer" }} onClick={() => onView(order._type, order)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5", color: isWO ? "#2563eb" : "#059669", flexShrink: 0 }}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
            <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{pName || <span style={{ fontStyle: "italic" }}>No party</span>}</div>
            {jd && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}><OrderIcon name="link" size={9} />{jd.ref} · {jd.name}</div>}
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
            {order.poLimit && <span style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fffbeb", padding: "1px 6px", borderRadius: 4, border: "1px solid #fcd34d" }}>${parseFloat(order.poLimit).toLocaleString("en-AU")}</span>}
          </div>
        </div>
        {!isTerminal && transitions.length > 0 && (
          <div style={{ padding: "0 16px 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", marginRight: 4 }}>Move to:</span>
            {transitions.map(s => (
              <button key={s} onClick={e => { e.stopPropagation(); handleDashTransition(order, s); }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: ORDER_STATUS_TRIGGERS[s] ? "1px solid #fcd34d" : "1px solid #e2e8f0", background: ORDER_STATUS_TRIGGERS[s] ? "#fffbeb" : "#f8fafc", color: ORDER_STATUS_TRIGGERS[s] ? "#b45309" : "#475569", cursor: "pointer" }}>
                {ORDER_STATUS_TRIGGERS[s] && <OrderIcon name="zap" size={9} />}{s}
              </button>
            ))}
            <button onClick={e => { e.stopPropagation(); onEdit(order._type, order); }} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}><OrderIcon name="edit" size={11} /> Edit</button>
          </div>
        )}
      </div>
    );
  };
  const DashRow = ({ order }) => {
    const isWO = order._type === "wo"; const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
    const isTerminal = ORDER_TERMINAL.includes(order.status);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, cursor: "pointer" }} onClick={() => onView(order._type, order)}>
        <div style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5", color: isWO ? "#2563eb" : "#059669", flexShrink: 0 }}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={12} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
          <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(isWO ? order.contractorName : order.supplierName) || "—"}{jd ? " · " + jd.ref : ""}</div>
        </div>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
      </div>
    );
  };
  const StatusPipeline = ({ title, pipelineOrders, pType }) => {
    const isWO = pType === "wo";
    return (
      <div className="card"><div className="card-body">
        <h3 style={{ fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5" }}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={11} cls="" /></div>
          {title}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ORDER_STATUSES.filter(s => s !== "Cancelled").map(s => {
            const matched = pipelineOrders.filter(o => o.status === s);
            const count = matched.length; const pct = pipelineOrders.length > 0 ? (count / pipelineOrders.length) * 100 : 0;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 8, opacity: count > 0 ? 1 : 0.4, cursor: count > 0 ? "pointer" : "default" }} onClick={() => count > 0 && openPanel(s + " — " + title, matched.map(o => ({ ...o, _type: pType })))}>
                <span style={{ fontSize: 11, color: "#64748b", width: 80, flexShrink: 0 }}>{s}</span>
                <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 999, background: ORDER_BAR_COLORS[s], width: pct + "%" }} /></div>
                <span style={{ fontSize: 12, fontWeight: 700, width: 16, textAlign: "right", color: count > 0 ? "#334155" : "#cbd5e1" }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div></div>
    );
  };
  const kpis = [
    { label: "Overdue", value: overdue.length, sub: "need attention", highlight: overdue.length > 0, borderColor: overdue.length > 0 ? "#fecaca" : "#e8e8e8", bg: overdue.length > 0 ? "#fef2f2" : "#fff", textColor: overdue.length > 0 ? "#dc2626" : "#111", orders: overdue },
    { label: "Due This Week", value: dueSoon.length, sub: "upcoming", highlight: dueSoon.length > 0, borderColor: dueSoon.length > 0 ? "#fed7aa" : "#e8e8e8", bg: dueSoon.length > 0 ? "#fff7ed" : "#fff", textColor: dueSoon.length > 0 ? "#ea580c" : "#111", orders: dueSoon },
    { label: "Active", value: active.length, sub: "in progress", highlight: false, borderColor: "#e8e8e8", bg: "#fff", textColor: "#2563eb", orders: active },
    { label: "All Open", value: openList.length, sub: localWO.length + " WO · " + localPO.length + " PO", highlight: false, borderColor: "#e8e8e8", bg: "#fff", textColor: "#111", orders: openList },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="order-kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="order-kpi-card" style={{ border: `1px solid ${k.borderColor}`, background: k.bg, cursor: "pointer" }} onClick={() => openPanel(k.label, k.orders)}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.textColor, marginTop: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <StatusPipeline title="Work Orders" pipelineOrders={localWO} pType="wo" />
        <StatusPipeline title="Purchase Orders" pipelineOrders={localPO} pType="po" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {[
          { title: "Overdue", icon: "warning", iconBg: "#fef2f2", iconColor: "#dc2626", borderColor: "#fecaca", orders: overdue, empty: "No overdue orders" },
          { title: "Due This Week", icon: "clock", iconBg: "#fff7ed", iconColor: "#ea580c", borderColor: "#fed7aa", orders: dueSoon, empty: "Nothing due in 7 days" },
          { title: "Active Orders", icon: "bar", iconBg: "#eff6ff", iconColor: "#2563eb", borderColor: "#e8e8e8", orders: active, empty: "No active orders" },
        ].map(({ title, icon, iconBg, iconColor, borderColor, orders, empty }) => (
          <div key={title} className="card" style={{ borderColor }}>
            <div className="card-header" style={{ cursor: orders.length > 0 ? "pointer" : "default" }} onClick={() => orders.length > 0 && openPanel(title, orders)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: iconBg }}><OrderIcon name={icon} size={13} cls="" style={{ color: iconColor }} /></div>
                <span className="card-title">{title}</span>
                {orders.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: iconColor, padding: "1px 6px", borderRadius: 10 }}>{orders.length}</span>}
              </div>
            </div>
            <div className="card-body">
              {orders.length === 0 ? <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: 24 }}>{empty}</div>
                : <>{orders.slice(0, 5).map(o => <DashRow key={o.id} order={o} />)}{orders.length > 5 && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", cursor: "pointer", paddingTop: 8 }} onClick={() => openPanel(title, orders)}>+{orders.length - 5} more</div>}</>}
            </div>
          </div>
        ))}
      </div>
      {/* Side Panel */}
      {panel && (
        <div className="order-panel">
          <div className="order-panel-backdrop" onClick={() => setPanel(null)} />
          <div className="order-panel-body">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e8e8e8", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", flexShrink: 0 }}>
              <div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>Dashboard</div><div style={{ fontWeight: 700, fontSize: 15 }}>{panel.label}</div><div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{panel.orders.length} order{panel.orders.length !== 1 ? "s" : ""}</div></div>
              <button onClick={() => setPanel(null)} style={{ padding: 8, borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><OrderIcon name="x" size={16} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {panel.orders.length === 0 ? <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: 48 }}>No orders in this view</div>
                : panel.orders.map(o => <PanelRow key={o.id + o.status} order={o} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Orders: Orders Page ───────────────────────────────────────────────────────
const OrdersPage = () => {
  const { workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders, jobs, companyInfo } = useAppStore();
  const auth = useAuth();
  const canDeleteOrder = auth.isAdmin || auth.isLocalDev;
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("all");
  const [view, setView] = useState("grid");
  const allOrders = useMemo(() => [
    ...workOrders.map(o => ({ ...o, _type: "wo" })),
    ...purchaseOrders.map(o => ({ ...o, _type: "po" }))
  ], [workOrders, purchaseOrders]);
  const filtered = useMemo(() => {
    return allOrders.filter(o => {
      const partyName = o._type === "wo" ? o.contractorName : o.supplierName;
      const jd = orderJobDisplay(jobs.find(j => j.id === o.jobId));
      const q = search.toLowerCase();
      const matchSearch = !search || o.ref.toLowerCase().includes(q) || (partyName || "").toLowerCase().includes(q) || (jd?.name || "").toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q) || (o.notes || "").toLowerCase().includes(q) || (o.items || []).some(i => (i.description || "").toLowerCase().includes(q)) || (o.status || "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "All" || o.status === filterStatus;
      const matchType = filterType === "all" || o._type === filterType;
      return matchSearch && matchStatus && matchType;
    });
  }, [allOrders, search, filterStatus, filterType, jobs]);
  const openNew = (t) => setModal({ type: t, order: null });
  const openOrder = (type, order, mode = "view") => setModal({ type, order, mode });
  const handleSave = (order) => {
    const target = modal.type === "wo" ? setWorkOrders : setPurchaseOrders;
    target(prev => { const exists = prev.find(o => o.id === order.id); return exists ? prev.map(o => o.id === order.id ? order : o) : [...prev, order]; });
    setModal(m => m ? { ...m, order } : null);
  };
  const handleDelete = (type, id) => { if (!window.confirm("Delete this order?")) return; (type === "wo" ? setWorkOrders : setPurchaseOrders)(prev => prev.filter(o => o.id !== id)); };
  const accentColor = "#2563eb";
  const orderStatusColors = { Draft: "#888", Approved: "#7c3aed", Sent: "#2563eb", Viewed: "#0891b2", Accepted: "#16a34a", Completed: "#111", Billed: "#059669", Cancelled: "#dc2626" };
  const summaryStatuses = ORDER_STATUSES.filter(s => s !== "Cancelled");
  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 12, marginBottom: 24 }}>
        {summaryStatuses.map(status => {
          const count = allOrders.filter(o => o.status === status).length;
          const woCount = allOrders.filter(o => o.status === status && o._type === "wo").length;
          const poCount = allOrders.filter(o => o.status === status && o._type === "po").length;
          const color = orderStatusColors[status];
          return (
            <div key={status} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}`, cursor: "pointer" }}
              onClick={() => { setFilterStatus(status); setView("list"); }}>
              <div className="stat-label">{status}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{count}</div>
              <div className="stat-sub">{woCount} WO · {poCount} PO</div>
            </div>
          );
        })}
      </div>

      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120, maxWidth: 320 }}>
          <Icon name="search" size={14} />
          <input placeholder="Search orders, jobs, contractors..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: "auto", minWidth: 120 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="wo">Work Orders</option>
          <option value="po">Purchase Orders</option>
        </select>
        <select className="form-control" style={{ width: "auto", minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All Statuses</option>
          {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accentColor, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accentColor, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: accentColor, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns">
          <button className="btn btn-primary" style={{ background: "#2563eb" }} onClick={() => openNew("wo")}><OrderIcon name="plus" size={14} /> New WO</button>
          <button className="btn btn-primary" style={{ background: "#059669" }} onClick={() => openNew("po")}><OrderIcon name="plus" size={14} /> New PO</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-text">No orders found</div>
          <div className="empty-state-sub">Try adjusting your filters or create a new order</div>
        </div>
      ) : view === "kanban" ? (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${ORDER_STATUSES.filter(s => s !== "Cancelled").length}, minmax(200px,1fr))` }}>
          {ORDER_STATUSES.filter(s => s !== "Cancelled").map(col => {
            const colOrders = filtered.filter(o => o.status === col);
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{col}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colOrders.length}</span>
                </div>
                {colOrders.map(o => {
                  const jd = orderJobDisplay(jobs.find(j => j.id === o.jobId));
                  const partyName = o._type === "wo" ? o.contractorName : o.supplierName;
                  return (
                    <div key={o._type + o.id} className="kanban-card" onClick={() => openOrder(o._type, o, "view")}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: o._type === "wo" ? "#dbeafe" : "#d1fae5", color: o._type === "wo" ? "#2563eb" : "#059669" }}>{o._type === "wo" ? "WO" : "PO"}</span>
                        <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{o.ref}</span>
                      </div>
                      {partyName && <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{partyName}</div>}
                      {jd && <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{jd.ref} · {jd.name}</div>}
                      {o.dueDate && <div style={{ fontSize: 11, marginBottom: 4 }}><DueDateChip dateStr={o.dueDate} isTerminal={ORDER_TERMINAL.includes(o.status)} /></div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : view === "grid" ? (
        <div className="order-cards-grid">{filtered.map(o => <OrderCard key={o._type + o.id} type={o._type} order={o} jobs={jobs} onOpen={o => openOrder(o._type || (workOrders.find(w => w.id === o.id) ? "wo" : "po"), o, "view")} onDelete={canDeleteOrder ? (id) => handleDelete(o._type, id) : null} />)}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr>
              <th>TYPE</th>
              <th>REF</th>
              <th>CONTRACTOR / SUPPLIER</th>
              <th>JOB</th>
              <th>STATUS</th>
              <th>ISSUE DATE</th>
              <th>DUE DATE</th>
              <th></th>
            </tr></thead>
            <tbody>{filtered.map(o => {
              const jd = orderJobDisplay(jobs.find(j => j.id === o.jobId));
              const partyName = o._type === "wo" ? o.contractorName : o.supplierName;
              return (
                <tr key={o._type + o.id} style={{ cursor: "pointer" }} onClick={() => openOrder(o._type, o, "view")}>
                  <td><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: o._type === "wo" ? "#dbeafe" : "#d1fae5", color: o._type === "wo" ? "#2563eb" : "#059669" }}>{o._type === "wo" ? "WO" : "PO"}</span></td>
                  <td style={{ fontWeight: 600 }}>{o.ref}</td>
                  <td>{partyName || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>}</td>
                  <td>{jd ? jd.ref + " · " + jd.name : "—"}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td>{orderFmtDate(o.issueDate)}</td>
                  <td><DueDateChip dateStr={o.dueDate} isTerminal={ORDER_TERMINAL.includes(o.status)} /></td>
                  {canDeleteOrder && <td><button onClick={e => { e.stopPropagation(); handleDelete(o._type, o.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }} title="Delete"><Icon name="delete" size={14} /></button></td>}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {modal && <OrderDrawer type={modal.type} order={modal.order} initialMode={modal.order ? (modal.mode || "view") : "edit"} onSave={handleSave} onClose={() => setModal(null)} jobs={jobs} companyInfo={companyInfo} onTransition={(updated) => { (modal.type === "wo" ? setWorkOrders : setPurchaseOrders)(prev => prev.map(o => o.id === updated.id ? updated : o)); setModal(m => m ? { ...m, order: updated } : null); }} />}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGES
// ══════════════════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = ({ onNav }) => {
  const { jobs, clients, quotes, invoices, bills, timeEntries, schedule, workOrders, purchaseOrders, contractors, suppliers } = useAppStore();
  // ── Financial KPIs ──
  const totalQuoted = quotes.filter(q => q.status !== "declined").reduce((s, q) => s + calcQuoteTotal(q), 0);
  const revenueCollected = invoices.filter(i => i.status === "paid").reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const outstandingInv = invoices.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const outstandingInvCount = invoices.filter(i => ["sent", "overdue"].includes(i.status)).length;
  const unpostedBills = bills.filter(b => ["inbox", "linked", "approved"].includes(b.status));
  const unpostedBillsTotal = unpostedBills.reduce((s, b) => s + b.amount, 0);

  // ── Section counts & metrics ──
  const activeJobs = jobs.filter(j => j.status === "in_progress").length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const overdueJobs = jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled").length;
  const activeWOs = workOrders.filter(wo => !["Cancelled", "Billed", "Completed"].includes(wo.status)).length;
  const overdueWOs = workOrders.filter(wo => wo.dueDate && daysUntil(wo.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(wo.status)).length;
  const woAwaitingAcceptance = workOrders.filter(wo => wo.status === "Sent").length;
  const activePOs = purchaseOrders.filter(po => !["Cancelled", "Billed", "Completed"].includes(po.status)).length;
  const overduePOs = purchaseOrders.filter(po => po.dueDate && daysUntil(po.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(po.status)).length;
  const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);
  const billableHours = timeEntries.filter(t => t.billable).reduce((s, t) => s + t.hours, 0);
  const billableRatio = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;
  const pipelineQuotes = quotes.filter(q => ["draft", "sent"].includes(q.status));
  const pipelineTotal = pipelineQuotes.reduce((s, q) => s + calcQuoteTotal(q), 0);
  const quoteDrafts = quotes.filter(q => q.status === "draft").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOfWeek = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const endOfWeek = (() => { const d = new Date(startOfWeek); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();

  // ── Profit margin ──
  const totalBillsCost = bills.reduce((s, b) => s + b.amount, 0);
  const totalInvoiced = invoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const margin = totalInvoiced > 0 ? Math.round(((totalInvoiced - totalBillsCost) / totalInvoiced) * 100) : 0;

  // ── Lists ──
  const upcomingSchedule = [...schedule].filter(s => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  const todaySchedule = schedule.filter(s => s.date === todayStr);
  const recentBills = [...bills].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  const recentTime = [...timeEntries].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 4);
  const workerHours = Object.entries(
    timeEntries.reduce((acc, t) => {
      if (!acc[t.worker]) acc[t.worker] = { total: 0, billable: 0 };
      acc[t.worker].total += t.hours;
      if (t.billable) acc[t.worker].billable += t.hours;
      return acc;
    }, {})
  ).sort((a, b) => b[1].total - a[1].total);

  // ── Action items (things needing attention) ──
  const actionItems = [];
  if (overdueJobs > 0) actionItems.push({ label: `${overdueJobs} overdue job${overdueJobs > 1 ? "s" : ""}`, color: "#dc2626", section: "jobs", icon: "jobs" });
  if (quoteDrafts > 0) actionItems.push({ label: `${quoteDrafts} draft quote${quoteDrafts > 1 ? "s" : ""} to send`, color: SECTION_COLORS.quotes.accent, section: "quotes", icon: "quotes" });
  if (overdueWOs > 0) actionItems.push({ label: `${overdueWOs} overdue work order${overdueWOs > 1 ? "s" : ""}`, color: "#dc2626", section: "orders", icon: "orders" });
  if (woAwaitingAcceptance > 0) actionItems.push({ label: `${woAwaitingAcceptance} WO${woAwaitingAcceptance > 1 ? "s" : ""} awaiting acceptance`, color: SECTION_COLORS.wo.accent, section: "orders", icon: "orders" });
  const inboxBills = bills.filter(b => b.status === "inbox").length;
  if (inboxBills > 0) actionItems.push({ label: `${inboxBills} bill${inboxBills > 1 ? "s" : ""} in inbox to link`, color: SECTION_COLORS.bills.accent, section: "bills", icon: "bills" });
  if (outstandingInvCount > 0) actionItems.push({ label: `${outstandingInvCount} outstanding invoice${outstandingInvCount > 1 ? "s" : ""}`, color: "#dc2626", section: "invoices", icon: "invoices" });

  const jobStatusLabels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };
  const jobStatusColors = { draft: "#888", scheduled: "#0891b2", quoted: "#7c3aed", in_progress: "#ea580c", completed: "#16a34a" };
  const billStatusColors = { inbox: "#888", linked: "#2563eb", approved: "#059669", posted: "#111" };
  const billStatusLabels = { inbox: "Inbox", linked: "Linked", approved: "Approved", posted: "Posted" };

  // ── AI Business Insight + Chat ──
  const [aiInsight, setAiInsight] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const aiChatEndRef = useRef(null);

  const getKpiData = () => ({
    totalQuoted, revenueCollected, outstandingInv, outstandingInvCount,
    unpostedBills: unpostedBills.length, unpostedBillsTotal,
    activeJobs, completedJobs, overdueJobs,
    activeWOs, overdueWOs, woAwaitingAcceptance, activePOs, overduePOs,
    totalHours, billableHours, billableRatio, margin,
    pipelineTotal, quoteDrafts, todayScheduleCount: todaySchedule.length,
    contractorComplianceIssues: contractors.reduce((sum, c) => sum + getContractorComplianceCount(c), 0),
    actionItemsCount: actionItems.length,
    actionItemsSummary: actionItems.map(a => a.label).join(", "),
  });

  const generateInsight = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      if (!supabase) throw new Error("Supabase not configured — add VITE_SUPABASE_URL to enable AI insights");
      const { data, error } = await supabase.functions.invoke("ai-insight", {
        body: { kpis: getKpiData() },
      });
      if (error) {
        const msg = typeof error === "object" && error.context
          ? await error.context.text?.() || error.message
          : error.message;
        throw new Error(msg || "AI insight failed");
      }
      const result = typeof data === "string" ? JSON.parse(data) : data;
      const insight = result?.insight || "No insight generated.";
      setAiInsight(insight);
      // Reset chat with the initial insight as first assistant message
      setAiChatMessages([{ role: "assistant", content: insight }]);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const sendChatMessage = async () => {
    const question = aiChatInput.trim();
    if (!question || aiChatLoading) return;
    setAiChatInput("");
    setAiChatLoading(true);
    const updatedMessages = [...aiChatMessages, { role: "user", content: question }];
    setAiChatMessages(updatedMessages);
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { data, error } = await supabase.functions.invoke("ai-insight", {
        body: { kpis: getKpiData(), messages: aiChatMessages, question },
      });
      if (error) {
        const msg = typeof error === "object" && error.context
          ? await error.context.text?.() || error.message
          : error.message;
        throw new Error(msg || "AI chat failed");
      }
      const result = typeof data === "string" ? JSON.parse(data) : data;
      setAiChatMessages([...updatedMessages, { role: "assistant", content: result?.reply || "No response." }]);
    } catch (err) {
      setAiChatMessages([...updatedMessages, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setAiChatLoading(false);
    }
  };

  useEffect(() => { if (aiChatEndRef.current) aiChatEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [aiChatMessages]);
  useEffect(() => { generateInsight(); }, []);

  return (
    <div>
      {/* ── AI Business Insight + Chat ── */}
      {(() => {
        // Parse insight text into cards
        const parseInsightCards = (text) => text ? text.split(/\n/).filter(l => l.trim()).reduce((cards, line) => {
          const trimmed = line.trim();
          const bulletMatch = trimmed.match(/^[•\-\*]\s*\*?\*?(.+?)\*?\*?:\s*(.+)/) || trimmed.match(/^[•\-\*]\s*\*?\*?(.+?)\*?\*?\s*[—–-]\s*(.+)/) || trimmed.match(/^\d+\.\s*\*?\*?(.+?)\*?\*?:\s*(.+)/);
          if (bulletMatch) {
            cards.push({ heading: bulletMatch[1].replace(/\*+/g, "").trim(), detail: bulletMatch[2].replace(/\*+/g, "").trim() });
          } else if (trimmed.match(/^[•\-\*\d]/)) {
            const clean = trimmed.replace(/^[•\-\*\d.]+\s*/, "").replace(/\*+/g, "");
            const colonSplit = clean.indexOf(":") > 0 && clean.indexOf(":") < 60 ? [clean.slice(0, clean.indexOf(":")), clean.slice(clean.indexOf(":") + 1)] : null;
            if (colonSplit) cards.push({ heading: colonSplit[0].trim(), detail: colonSplit[1].trim() });
            else cards.push({ heading: clean.length > 60 ? clean.slice(0, 60) + "..." : clean, detail: clean.length > 60 ? clean : "" });
          }
          return cards;
        }, []) : [];

        const insightCards = parseInsightCards(aiInsight);
        const suggestedQuestions = [
          "How can I improve cash flow?",
          "Which jobs need attention?",
          "Break down my margins",
          "What should I focus on this week?",
        ];

        return (
          <div style={{ background: "linear-gradient(135deg, #111 0%, #1e293b 100%)", borderRadius: 12, marginBottom: 20, color: "#fff", overflow: "hidden" }}>
            {/* Header */}
            <div onClick={() => setAiExpanded(e => !e)} style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>&#10024;</span>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.03em" }}>AI Business Insight</span>
                {insightCards.length > 0 && !aiExpanded && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>{insightCards.length} insights</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={e => { e.stopPropagation(); generateInsight(); }} disabled={aiLoading} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: "#fff", cursor: "pointer", opacity: aiLoading ? 0.5 : 1, fontFamily: "'Open Sans', sans-serif" }}>
                  {aiLoading ? "Analysing..." : "Refresh"}
                </button>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: aiExpanded ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="5 8 10 13 15 8"/></svg>
              </div>
            </div>
            {/* Expandable content */}
            {aiExpanded && (
              <div style={{ padding: "0 24px 20px" }}>
                {aiLoading && !aiInsight && <div style={{ fontSize: 13, color: "#94a3b8" }}>Analysing your business data...</div>}
                {aiError && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>Failed to generate insight: {aiError}</div>}
                {/* Insight cards */}
                {insightCards.length > 0 && !aiLoading && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {insightCards.map((card, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "14px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{card.heading}</div>
                        {card.detail && <div style={{ fontSize: 12, lineHeight: 1.5, color: "#94a3b8" }}>{card.detail}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {!aiLoading && !aiError && aiInsight && insightCards.length === 0 && (
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: "#e2e8f0", whiteSpace: "pre-wrap", marginBottom: 16 }}>{aiInsight}</div>
                )}

                {/* Chat section */}
                {aiInsight && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
                    {/* Chat messages (skip the first assistant message which is shown as insight cards above) */}
                    {aiChatMessages.length > 1 && (
                      <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12, paddingRight: 4 }}>
                        {aiChatMessages.slice(1).map((msg, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                            <div style={{
                              maxWidth: "85%",
                              background: msg.role === "user" ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)",
                              border: msg.role === "user" ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.1)",
                              borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                              padding: "10px 14px",
                            }}>
                              {msg.role === "assistant" && <div style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>AI Analyst</div>}
                              <div style={{ fontSize: 13, lineHeight: 1.6, color: msg.role === "user" ? "#e2e8f0" : "#cbd5e1", whiteSpace: "pre-wrap" }}>{msg.content}</div>
                            </div>
                          </div>
                        ))}
                        {aiChatLoading && (
                          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px 12px 12px 4px", padding: "10px 14px" }}>
                              <div style={{ fontSize: 13, color: "#94a3b8" }}>Thinking...</div>
                            </div>
                          </div>
                        )}
                        <div ref={aiChatEndRef} />
                      </div>
                    )}

                    {/* Suggested questions (only show when no chat history yet) */}
                    {aiChatMessages.length <= 1 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                        {suggestedQuestions.map((q, i) => (
                          <button key={i} onClick={() => { setAiChatInput(q); }} style={{
                            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20,
                            padding: "6px 14px", fontSize: 12, color: "#94a3b8", cursor: "pointer", fontFamily: "'Open Sans', sans-serif",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { e.target.style.background = "rgba(255,255,255,0.12)"; e.target.style.color = "#e2e8f0"; }}
                          onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.06)"; e.target.style.color = "#94a3b8"; }}
                          >{q}</button>
                        ))}
                      </div>
                    )}

                    {/* Chat input */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        value={aiChatInput}
                        onChange={e => setAiChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                        placeholder="Ask a follow-up question..."
                        style={{
                          flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fff",
                          fontFamily: "'Open Sans', sans-serif", outline: "none",
                        }}
                      />
                      <button
                        onClick={sendChatMessage}
                        disabled={!aiChatInput.trim() || aiChatLoading}
                        style={{
                          background: aiChatInput.trim() && !aiChatLoading ? "#6366f1" : "rgba(255,255,255,0.08)",
                          border: "none", borderRadius: 8, padding: "10px 16px", cursor: aiChatInput.trim() && !aiChatLoading ? "pointer" : "default",
                          transition: "all 0.15s", display: "flex", alignItems: "center",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={aiChatInput.trim() && !aiChatLoading ? "#fff" : "#666"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ROW 1: Financial Hero Strip (full width) ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 24 }}>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.quotes.accent}`, cursor: "pointer" }} onClick={() => onNav("quotes")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="quotes" size={13} /><div className="stat-label">Total Quoted</div></div>
          <div className="stat-value">{fmt(totalQuoted)}</div>
          <div className="stat-sub">{quotes.filter(q => q.status !== "declined").length} quotes in pipeline</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.invoices.accent}`, cursor: "pointer" }} onClick={() => onNav("invoices")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="invoices" size={13} /><div className="stat-label">Revenue Collected</div></div>
          <div className="stat-value">{fmt(revenueCollected)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: totalQuoted > 0 ? `${Math.min(100, Math.round((revenueCollected / totalQuoted) * 100))}%` : "0%", background: SECTION_COLORS.invoices.accent, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{totalQuoted > 0 ? Math.round((revenueCollected / totalQuoted) * 100) : 0}%</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${outstandingInvCount > 0 ? "#dc2626" : "#e5e5e5"}`, cursor: "pointer" }} onClick={() => onNav("invoices")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="invoices" size={13} /><div className="stat-label">Outstanding</div></div>
          <div className="stat-value" style={{ color: outstandingInvCount > 0 ? "#dc2626" : undefined }}>{fmt(outstandingInv)}</div>
          <div className="stat-sub">{outstandingInvCount > 0 ? `${outstandingInvCount} unpaid — action needed` : "All invoices paid ✓"}</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.bills.accent}`, cursor: "pointer" }} onClick={() => onNav("bills")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="bills" size={13} /><div className="stat-label">Costs to Process</div></div>
          <div className="stat-value">{fmt(unpostedBillsTotal)}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {["inbox", "linked", "approved"].map(st => {
              const c = bills.filter(b => b.status === st).length;
              return c > 0 ? <span key={st} style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: billStatusColors[st], color: "#fff" }}>{c} {billStatusLabels[st]}</span> : null;
            })}
          </div>
        </div>
      </div>

      {/* ── ROW 2: Operational KPI Cards (5 cards with progress/actions) ── */}
      <SectionLabel>Operations</SectionLabel>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 24 }}>
        {/* Active Jobs */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.jobs.accent}`, cursor: "pointer" }} onClick={() => onNav("jobs")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="jobs" size={13} /><div className="stat-label">Active Jobs</div></div>
          <div className="stat-value">{activeJobs}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: jobs.length > 0 ? `${Math.round((completedJobs / jobs.length) * 100)}%` : "0%", background: "#16a34a", borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{completedJobs}/{jobs.length}</span>
          </div>
          {overdueJobs > 0 && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 4 }}>⚠ {overdueJobs} overdue</div>}
        </div>

        {/* Work Orders */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.wo.accent}`, cursor: "pointer" }} onClick={() => onNav("orders")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="orders" size={13} /><div className="stat-label">Work Orders</div></div>
          <div className="stat-value">{activeWOs}</div>
          <div className="stat-sub">{workOrders.length} total · {fmt(workOrders.reduce((s, wo) => s + (parseFloat(wo.poLimit) || 0), 0))}</div>
          {woAwaitingAcceptance > 0 && <div style={{ fontSize: 11, color: SECTION_COLORS.wo.accent, fontWeight: 600, marginTop: 2 }}>{woAwaitingAcceptance} awaiting acceptance</div>}
          {overdueWOs > 0 && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 2 }}>⚠ {overdueWOs} overdue</div>}
        </div>

        {/* Purchase Orders */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.po.accent}`, cursor: "pointer" }} onClick={() => onNav("orders")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="orders" size={13} /><div className="stat-label">Purchase Orders</div></div>
          <div className="stat-value">{activePOs}</div>
          <div className="stat-sub">{purchaseOrders.length} total</div>
          {overduePOs > 0 && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 2 }}>⚠ {overduePOs} overdue</div>}
        </div>

        {/* Hours Logged */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.time.accent}`, cursor: "pointer" }} onClick={() => onNav("time")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="time" size={13} /><div className="stat-label">Hours Logged</div></div>
          <div className="stat-value">{totalHours}h</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${billableRatio}%`, background: SECTION_COLORS.time.accent, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{billableRatio}%</span>
          </div>
          <div className="stat-sub">{billableHours}h billable</div>
        </div>

        {/* Open Quotes */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.quotes.accent}`, cursor: "pointer" }} onClick={() => onNav("quotes")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="quotes" size={13} /><div className="stat-label">Open Quotes</div></div>
          <div className="stat-value">{pipelineQuotes.length}</div>
          <div className="stat-sub">{fmt(pipelineTotal)} pending</div>
          {quoteDrafts > 0 && <div style={{ fontSize: 11, color: SECTION_COLORS.quotes.accent, fontWeight: 600, marginTop: 2 }}>{quoteDrafts} draft{quoteDrafts > 1 ? "s" : ""} to send</div>}
        </div>
      </div>

      {/* ── ROW 3: This Week Schedule (full width, week grid) ── */}
      {(() => {
        const schAccent = SECTION_COLORS.schedule.accent;
        const getMonday = (d) => { const dt = new Date(d + "T12:00:00"); const day = dt.getDay(); const diff = day === 0 ? -6 : 1 - day; dt.setDate(dt.getDate() + diff); return dt.toISOString().slice(0, 10); };
        const mon = getMonday(todayStr);
        const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const weekdays = weekDays.slice(0, 5);
        const weekend = weekDays.slice(5);
        const weekEntries = schedule.filter(s => s.date >= weekDays[0] && s.date <= weekDays[6]);
        const thisWeekTotal = weekEntries.length;

        const DashDayCol = ({ dateStr, dayName, isCompact }) => {
          const d = new Date(dateStr + "T12:00:00");
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          const isWeekend = dayName === "Sat" || dayName === "Sun";
          const dayEntries = weekEntries.filter(e => e.date === dateStr);
          return (
            <div className={`schedule-day-col${isCompact ? " schedule-day-compact" : ""}`} style={{ background: isToday ? "#ecfeff" : isWeekend ? "#fafafa" : "#fff", borderColor: isToday ? schAccent : "#e5e5e5", cursor: "pointer" }} onClick={() => onNav("schedule")}>
              <div className="schedule-day-header" style={{ background: isToday ? schAccent : isPast ? "#e0e0e0" : "#f5f5f5", color: isToday ? "#fff" : isPast ? "#999" : "#333" }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{dayName}</span>
                <span style={{ fontSize: isCompact ? 13 : 16, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</span>
              </div>
              <div className="schedule-day-body">
                {dayEntries.length === 0 && <div style={{ fontSize: 11, color: "#ccc", textAlign: "center", padding: isCompact ? "6px 0" : "12px 0" }}>—</div>}
                {dayEntries.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  return (
                    <div key={entry.id} className="schedule-card" style={{ borderLeft: `3px solid ${isPast ? "#ddd" : schAccent}` }}>
                      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, lineHeight: 1.3 }}>{entry.title}</div>
                      {entry.startTime && <div style={{ fontSize: 10, color: "#aaa" }}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
                      {(entry.assignedTo || []).length > 0 && (
                        <div style={{ marginTop: 4 }}><AvatarGroup names={entry.assignedTo} max={2} /></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        };

        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="schedule" size={16} /> This Week
                {todaySchedule.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: schAccent, color: "#fff" }}>{todaySchedule.length} today</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>{thisWeekTotal} task{thisWeekTotal !== 1 ? "s" : ""}</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav("schedule")}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div className="schedule-week-grid">
                {weekdays.map((dateStr, i) => (
                  <DashDayCol key={dateStr} dateStr={dateStr} dayName={dayNames[i]} />
                ))}
                <div className="schedule-weekend-stack">
                  {weekend.map((dateStr, i) => (
                    <DashDayCol key={dateStr} dateStr={dateStr} dayName={dayNames[5 + i]} isCompact />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Action Items Banner (if any) ── */}
      {actionItems.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {actionItems.map((item, i) => (
            <div key={i} onClick={() => onNav(item.section)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "#fff", border: `1px solid ${item.color}30`, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = item.color + "10"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
              <Icon name={item.icon} size={12} />
              <span style={{ fontSize: 12, fontWeight: 600, color: item.color }}>{item.label}</span>
              <Icon name="arrow_right" size={10} />
            </div>
          ))}
        </div>
      )}

      {/* ── ROW 4: Detail Panels (2-col grid) ── */}
      <div className="dashboard-grid" style={{ display: "grid", gap: 20 }}>

        {/* Panel 1: Jobs by Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Jobs by Status</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("jobs")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {["draft","scheduled","quoted","in_progress","completed"].map(s => {
              const count = jobs.filter(j => j.status === s).length;
              const pct = jobs.length ? (count / jobs.length) * 100 : 0;
              return (
                <div key={s} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: jobStatusColors[s], display: "inline-block" }} />
                      {jobStatusLabels[s]}
                    </span>
                    <span style={{ color: "#999" }}>{count} job{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: jobStatusColors[s] }} />
                  </div>
                </div>
              );
            })}
            {/* Job completion rate */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Completion Rate</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: jobs.length > 0 ? "#16a34a" : "#999" }}>{jobs.length > 0 ? Math.round((completedJobs / jobs.length) * 100) : 0}%</span>
            </div>
          </div>
        </div>

        {/* Panel 2: Quote & Invoice Pipeline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Quote & Invoice Pipeline</span>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <SectionLabel>Quotes</SectionLabel>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav("quotes")} style={{ marginTop: -4 }}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            {quotes.map(q => {
              const job = jobs.find(j => j.id === q.jobId);
              return (
                <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{q.number}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{job?.title}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(calcQuoteTotal(q))}</div>
                    <StatusBadge status={q.status} />
                  </div>
                </div>
              );
            })}
            {/* Quote conversion rate */}
            {quotes.length > 0 && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Conversion Rate</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>{Math.round((quotes.filter(q => q.status === "accepted").length / quotes.length) * 100)}%</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 8 }}>
              <SectionLabel>Invoices</SectionLabel>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav("invoices")} style={{ marginTop: -4 }}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            {invoices.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No invoices yet</div>}
            {invoices.map(inv => {
              const job = jobs.find(j => j.id === inv.jobId);
              const overdue = inv.dueDate && daysUntil(inv.dueDate) < 0 && inv.status !== "paid";
              return (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{inv.number}</div>
                    <div style={{ fontSize: 12, color: overdue ? "#dc2626" : "#999" }}>{job?.title}{inv.dueDate ? ` · Due ${inv.dueDate}` : ""}{overdue ? " — OVERDUE" : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(calcQuoteTotal(inv))}</div>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel 3: Bills & Cost Tracking */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Bills & Cost Tracking</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("bills")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {/* Bill workflow pipeline */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
              {["inbox", "linked", "approved", "posted"].map((st, i) => {
                const count = bills.filter(b => b.status === st).length;
                return (
                  <Fragment key={st}>
                    <div style={{ flex: 1, textAlign: "center", padding: "6px 4px", borderRadius: 6, background: count > 0 ? billStatusColors[st] + "15" : "#f5f5f5", border: `1px solid ${count > 0 ? billStatusColors[st] + "40" : "#e5e5e5"}` }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: count > 0 ? billStatusColors[st] : "#ccc" }}>{count}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: count > 0 ? billStatusColors[st] : "#bbb", letterSpacing: "0.04em" }}>{billStatusLabels[st]}</div>
                    </div>
                    {i < 3 && <span style={{ color: "#ccc", fontSize: 12 }}>→</span>}
                  </Fragment>
                );
              })}
            </div>
            {recentBills.map(b => {
              const job = jobs.find(j => j.id === b.jobId);
              return (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{b.invoiceNo}{job ? ` · ${job.title}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(b.amount)}</div>
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              );
            })}
            {/* Margin indicator */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Gross Margin</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
            </div>
          </div>
        </div>

        {/* Panel 4: Orders Snapshot */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Orders</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("orders")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            <SectionLabel>Work Orders</SectionLabel>
            {workOrders.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No work orders</div>}
            {workOrders.map(wo => {
              const overdue = wo.dueDate && daysUntil(wo.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(wo.status);
              const dueSoon = wo.dueDate && daysUntil(wo.dueDate) >= 0 && daysUntil(wo.dueDate) <= 3 && !["Cancelled", "Billed", "Completed"].includes(wo.status);
              return (
                <div key={wo.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{wo.ref}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{wo.contractorName}{wo.trade ? ` · ${wo.trade}` : ""}{wo.dueDate ? ` · Due ${wo.dueDate}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626" }}>OVERDUE</span>}
                    {dueSoon && !overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706" }}>DUE SOON</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: (ORDER_STATUS_COLORS[wo.status] || {}).bg || "#f0f0f0", color: (ORDER_STATUS_COLORS[wo.status] || {}).text || "#666" }}>{wo.status}</span>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 14 }}><SectionLabel>Purchase Orders</SectionLabel></div>
            {purchaseOrders.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No purchase orders</div>}
            {purchaseOrders.map(po => {
              const overdue = po.dueDate && daysUntil(po.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(po.status);
              const dueSoon = po.dueDate && daysUntil(po.dueDate) >= 0 && daysUntil(po.dueDate) <= 3 && !["Cancelled", "Billed", "Completed"].includes(po.status);
              return (
                <div key={po.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{po.ref}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{po.supplierName}{po.dueDate ? ` · Due ${po.dueDate}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626" }}>OVERDUE</span>}
                    {dueSoon && !overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706" }}>DUE SOON</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: (ORDER_STATUS_COLORS[po.status] || {}).bg || "#f0f0f0", color: (ORDER_STATUS_COLORS[po.status] || {}).text || "#666" }}>{po.status}</span>
                  </div>
                </div>
              );
            })}
            {/* Order value summary */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Total Committed</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#333" }}>{fmt(workOrders.reduce((s, wo) => s + (parseFloat(wo.poLimit) || 0), 0) + purchaseOrders.reduce((s, po) => s + ((po.lines || []).reduce((ls, l) => ls + (l.qty || 0) * (l.rate || 0), 0)), 0))}</span>
            </div>
          </div>
        </div>

        {/* Panel 5: Team & Time */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Team & Time</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("time")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            <SectionLabel>Team Utilisation</SectionLabel>
            {workerHours.map(([name, hrs]) => {
              const ratio = hrs.total > 0 ? (hrs.billable / hrs.total) * 100 : 0;
              return (
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#111", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{name.split(" ").map(n => n[0]).join("")}</span>
                      {name}
                    </span>
                    <span style={{ color: "#999" }}>{hrs.total}h <span style={{ color: ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : "#dc2626", fontWeight: 700 }}>({Math.round(ratio)}%)</span></span>
                  </div>
                  <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${ratio}%`, background: ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : SECTION_COLORS.time.accent, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
            {workerHours.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No time entries</div>}
            <div style={{ marginTop: 14 }}><SectionLabel>Recent Entries</SectionLabel></div>
            {recentTime.map(t => {
              const job = jobs.find(j => j.id === t.jobId);
              return (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t.worker}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{job?.title} · {t.date}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.hours}h</div>
                    {t.billable && <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>BILLABLE</span>}
                    {!t.billable && <span style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>NON-BILL</span>}
                  </div>
                </div>
              );
            })}
            {/* Overall billable rate */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Billable Rate</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: billableRatio >= 80 ? "#16a34a" : billableRatio >= 50 ? "#d97706" : "#dc2626" }}>{billableRatio}%</span>
            </div>
          </div>
        </div>

        {/* Panel 6: Profitability by Job */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Job Profitability</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("jobs")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {jobs.map(job => {
              const jobQuotes = quotes.filter(q => q.jobId === job.id);
              const jobInvoices = invoices.filter(inv => inv.jobId === job.id);
              const jobBills = bills.filter(b => b.jobId === job.id);
              const quoted = jobQuotes.reduce((s, q) => s + calcQuoteTotal(q), 0);
              const invoiced = jobInvoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
              const costs = jobBills.reduce((s, b) => s + b.amount, 0);
              const jobMargin = invoiced > 0 ? Math.round(((invoiced - costs) / invoiced) * 100) : (quoted > 0 ? Math.round(((quoted - costs) / quoted) * 100) : null);
              const costPct = quoted > 0 ? Math.min(100, Math.round((costs / quoted) * 100)) : 0;
              return (
                <div key={job.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {job.title}
                      <StatusBadge status={job.status} />
                    </span>
                    {jobMargin !== null && <span style={{ fontWeight: 700, color: jobMargin >= 20 ? "#16a34a" : jobMargin >= 0 ? "#d97706" : "#dc2626" }}>{jobMargin}% margin</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                      <div style={{ position: "absolute", height: "100%", width: `${costPct}%`, background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#16a34a", borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#999", minWidth: 80, textAlign: "right" }}>{fmt(costs)} / {fmt(quoted || invoiced)}</span>
                  </div>
                </div>
              );
            })}
            {/* Total margin */}
            <div style={{ marginTop: 4, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Overall Margin</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};




// ── Jobs ──────────────────────────────────────────────────────────────────────
const Jobs = () => {
  const { jobs, setJobs, clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders } = useAppStore();
  const auth = useAuth();
  const canDeleteJob = auth.isAdmin || auth.isLocalDev;
  const canEditJob = (j) => auth.isAdmin || auth.isLocalDev || (j.assignedTo || []).includes(auth.currentUserName);
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [jobMode, setJobMode] = useState("edit");
  const [detailJob, setDetailJob] = useState(null);
  const [form, setForm] = useState({ title: "", clientId: "", status: "draft", priority: "medium", description: "", startDate: "", dueDate: "", assignedTo: [], tags: "", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 } });

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const client = clients.find(c => c.id === j.clientId);
    const sites = client?.sites || [];
    const matchSearch = !search ||
      j.title.toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (j.description || "").toLowerCase().includes(q) ||
      (j.status || "").toLowerCase().includes(q) ||
      (j.priority || "").toLowerCase().includes(q) ||
      (j.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (j.assignedTo || []).some(n => n.toLowerCase().includes(q)) ||
      (client?.address || "").toLowerCase().includes(q) ||
      sites.some(s => (s.name || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q));
    return (filterStatus === "all" || j.status === filterStatus) && matchSearch;
  });

  const openNew = () => { setEditJob(null); setJobMode("edit"); setForm({ title: "", clientId: clients[0]?.id || "", siteId: null, status: "draft", priority: "medium", description: "", startDate: "", dueDate: "", assignedTo: [], tags: "", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setShowModal(true); };
  const openEdit = (j) => { setEditJob(j); setJobMode("view"); setForm({ ...j, siteId: j.siteId || null, tags: j.tags.join(", "), estimate: j.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setShowModal(true); };
  const openDetail = (j) => setDetailJob(j);
  const save = async () => {
    const data = { ...form, clientId: form.clientId, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), estimate: form.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } };
    try {
      if (editJob) {
        const changes = [];
        if (editJob.title !== data.title) changes.push(`Title changed to "${data.title}"`);
        if (editJob.status !== data.status) changes.push(`Status → ${data.status.replace("_"," ")}`);
        if (editJob.priority !== data.priority) changes.push(`Priority → ${data.priority}`);
        if (String(editJob.clientId) !== String(data.clientId)) changes.push(`Client changed`);
        if ((editJob.siteId||null) !== (data.siteId||null)) changes.push(`Site changed`);
        const msg = changes.length ? changes.join(" · ") : "Job updated";
        const saved = await updateJob(editJob.id, data);
        setJobs(js => js.map(j => j.id === editJob.id ? { ...saved, activityLog: addLog(j.activityLog, msg) } : j));
      } else {
        const saved = await createJob(data);
        setJobs(js => [...js, { ...saved, activityLog: [mkLog("Job created")] }]);
      }
    } catch (err) {
      console.error('Failed to save job:', err);
    }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteJob(id);
      setJobs(js => js.filter(j => j.id !== id));
      if (detailJob?.id === id) setDetailJob(null);
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  };

  const STATUSES = ["all","draft","scheduled","quoted","in_progress","completed","cancelled"];
  const kanbanCols = ["draft","scheduled","quoted","in_progress","completed"];

  // Relationship counts per job
  const jobStats = (jobId) => ({
    quotes: quotes.filter(q => q.jobId === jobId).length,
    invoices: invoices.filter(i => i.jobId === jobId).length,
    hours: timeEntries.filter(t => t.jobId === jobId).reduce((s,t) => s + t.hours, 0),
  });

  const jobStatusColors = { draft: "#888", scheduled: "#0891b2", quoted: "#7c3aed", in_progress: "#d97706", completed: "#16a34a", cancelled: "#dc2626" };
  const jobStatusLabels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        {Object.entries(jobStatusLabels).map(([key, label]) => {
          const count = jobs.filter(j => j.status === key).length;
          const color = jobStatusColors[key];
          return (
            <div key={key} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}`, cursor: "pointer" }}
              onClick={() => { setFilterStatus(key); setView("list"); }}>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{count}</div>
              <div className="stat-sub">{count === 1 ? "job" : "jobs"}</div>
            </div>
          );
        })}
      </div>

      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.jobs.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.jobs.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.jobs.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns">
          {(auth.isAdmin || auth.isLocalDev) && <button className="btn btn-primary" style={{ background: SECTION_COLORS.jobs.accent }} onClick={openNew}><Icon name="plus" size={14} />New Job</button>}
        </div>
      </div>

      {view === "grid" ? (
        <div className="order-cards-grid">
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">🔧</div><div className="empty-state-text">No jobs found</div></div>}
          {filtered.map(job => {
            const client = clients.find(c => c.id === job.clientId);
            const site = client?.sites?.find(s => s.id === job.siteId);
            const stats = jobStats(job.id);
            const priorityColors = { high: "#111", medium: "#777", low: "#ccc" };
            return (
              <div key={job.id} className="order-card" onClick={() => openDetail(job)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: SECTION_COLORS.jobs.light, color: SECTION_COLORS.jobs.accent }}>
                      <Icon name="jobs" size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{job.title}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{job.startDate || "No start date"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusBadge status={job.status} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {client?.name || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>No client</span>}
                </div>
                {site && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>📍 {site.name}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: priorityColors[job.priority], background: "#f5f5f5", padding: "2px 8px", borderRadius: 12 }}>
                    <span className={`priority-dot priority-${job.priority}`} /> {job.priority}
                  </span>
                  {stats.quotes > 0 && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{stats.quotes} quote{stats.quotes !== 1 ? "s" : ""}</span>}
                  {stats.invoices > 0 && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{stats.invoices} inv</span>}
                  {stats.hours > 0 && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{stats.hours}h</span>}
                </div>
                {(job.assignedTo || []).length > 0 && <div style={{ marginBottom: 4 }}><AvatarGroup names={job.assignedTo} max={4} /></div>}
                <SectionProgressBar status={job.status} section="jobs" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: job.dueDate ? "#334155" : "#ccc" }}>{job.dueDate ? `Due ${job.dueDate}` : "No due date"}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    {canEditJob(job) && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(job)}><Icon name="edit" size={12} /></button>}
                    {canDeleteJob && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(job.id)}><Icon name="trash" size={12} /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "list" ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Job</th><th>Client</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Assigned</th><th>Links</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">🔧</div><div className="empty-state-text">No jobs found</div></div></td></tr>}
                {filtered.map(job => {
                  const client = clients.find(c => c.id === job.clientId);
                  const stats = jobStats(job.id);
                  return (
                    <tr key={job.id} style={{ cursor: "pointer" }} onClick={() => openDetail(job)}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{job.title}</div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{job.description?.slice(0, 55)}{job.description?.length > 55 ? "…" : ""}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>{client?.name}</div>
                        {(() => { const s = client?.sites?.find(x => x.id === job.siteId); return s ? <div style={{ fontSize: 11, color: "#aaa" }}>📍 {s.name}</div> : null; })()}
                      </td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className={`priority-dot priority-${job.priority}`} />
                          <span style={{ fontSize: 12, textTransform: "capitalize" }}>{job.priority}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize: 12, color: job.dueDate ? "#111" : "#ccc" }}>{job.dueDate || "—"}</span></td>
                      <td onClick={e => e.stopPropagation()}><AvatarGroup names={job.assignedTo} max={3} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {stats.quotes > 0 && <span className="chip"><Icon name="quotes" size={10} />{stats.quotes}</span>}
                          {stats.invoices > 0 && <span className="chip"><Icon name="invoices" size={10} />{stats.invoices}</span>}
                          {stats.hours > 0 && <span className="chip"><Icon name="time" size={10} />{stats.hours}h</span>}
                        </div>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {canEditJob(job) && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(job)}><Icon name="edit" size={12} /></button>}
                          {canDeleteJob && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(job.id)}><Icon name="trash" size={12} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="kanban">
          {kanbanCols.map(col => {
            const colJobs = filtered.filter(j => j.status === col);
            const labels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colJobs.length}</span>
                </div>
                {colJobs.map(job => {
                  const client = clients.find(c => c.id === job.clientId);
                  const stats = jobStats(job.id);
                  return (
                    <div key={job.id} className="kanban-card" onClick={() => openDetail(job)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span className={`priority-dot priority-${job.priority}`} />
                        <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{job.title}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{client?.name}</div>
                      {job.dueDate && <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Due: {job.dueDate}</div>}
                      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                        {stats.quotes > 0 && <span className="chip" style={{ fontSize: 10 }}><Icon name="quotes" size={9} />{stats.quotes} quote{stats.quotes>1?"s":""}</span>}
                        {stats.invoices > 0 && <span className="chip" style={{ fontSize: 10 }}><Icon name="invoices" size={9} />{stats.invoices} inv</span>}
                        {stats.hours > 0 && <span className="chip" style={{ fontSize: 10 }}><Icon name="time" size={9} />{stats.hours}h</span>}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>{job.tags.slice(0,2).map((t, i) => <span key={i} className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>{t}</span>)}</div>
                        <AvatarGroup names={job.assignedTo} max={2} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Job detail drawer */}
      {detailJob && (
        <JobDetail
          job={jobs.find(j => j.id === detailJob.id) || detailJob}
          onClose={() => setDetailJob(null)}
          onEdit={() => { openEdit(jobs.find(j => j.id === detailJob.id) || detailJob); setDetailJob(null); }}
        />
      )}

      {/* Edit / New Job drawer */}
      {showModal && (() => {
        const isNewJob = !editJob;
        const jobClient = clients.find(c => String(c.id) === String(form.clientId));
        const jobSite = jobClient?.sites?.find(s => String(s.id) === String(form.siteId));
        return (
        <SectionDrawer
          accent={SECTION_COLORS.jobs.accent}
          icon={<Icon name="jobs" size={16} />}
          typeLabel="Job"
          title={editJob ? editJob.title : "New Job"}
          statusBadge={editJob ? <StatusBadge status={form.status} /> : null}
          mode={jobMode} setMode={setJobMode}
          showToggle={!isNewJob}
          isNew={isNewJob}
          footer={jobMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.jobs.accent, color: "#fff", border: "none" }} onClick={() => setJobMode("edit")}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editJob ? setJobMode("view") : setShowModal(false)}>{editJob ? "Cancel" : "Cancel"}</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.jobs.accent, color: "#fff", border: "none" }} onClick={() => { save(); if (editJob) setJobMode("view"); }} disabled={!form.title || (isNewJob && ((form.estimate?.labour || 0) + (form.estimate?.materials || 0) + (form.estimate?.subcontractors || 0) + (form.estimate?.other || 0)) === 0)}>
              <Icon name="check" size={13} /> {isNewJob ? "Create Job" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {jobMode === "view" ? (
            <div style={{ padding: "20px 24px" }}>
              <ViewField label="Job Title" value={form.title} />
              <div className="grid-2">
                <ViewField label="Client" value={jobClient?.name} />
                <ViewField label="Site" value={jobSite?.name || "No specific site"} />
              </div>
              <div className="grid-3">
                <ViewField label="Status" value={form.status?.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())} />
                <ViewField label="Priority" value={form.priority?.charAt(0).toUpperCase() + form.priority?.slice(1)} />
                <ViewField label="Tags" value={form.tags || "—"} />
              </div>
              <div className="grid-2">
                <ViewField label="Start Date" value={form.startDate || "—"} />
                <ViewField label="Due Date" value={form.dueDate || "—"} />
              </div>
              {(form.assignedTo || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>Assigned Team</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {form.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {form.description && <ViewField label="Description" value={form.description} />}
              {(() => {
                const est = form.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 };
                const totalEst = (est.labour || 0) + (est.materials || 0) + (est.subcontractors || 0) + (est.other || 0);
                const acceptedTotal = quotes.filter(q => q.jobId === (editJob?.id) && q.status === "accepted").reduce((s, q) => s + calcQuoteTotal(q), 0);
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Estimate</div>
                    <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
                        <div><div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Labour</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(est.labour || 0)}</div></div>
                        <div><div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Materials</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(est.materials || 0)}</div></div>
                        <div><div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Subcontractors</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(est.subcontractors || 0)}</div></div>
                        <div><div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Other</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(est.other || 0)}</div></div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>Total Estimate: {fmt(totalEst)}</div>
                        {acceptedTotal > 0 && <div style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>Accepted Quotes: {fmt(acceptedTotal)}</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="form-group">
              <label className="form-label">Job Title *</label>
              <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Fitout – Level 3" />
            </div>
            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">Client *</label>
                <select className="form-control" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value, siteId: "" }))}>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Site</label>
                <select className="form-control" value={form.siteId || ""} onChange={e => setForm(f => ({ ...f, siteId: e.target.value || null }))}>
                  <option value="">— No specific site —</option>
                  {(clients.find(c => String(c.id) === String(form.clientId))?.sites || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","scheduled","quoted","in_progress","completed","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-control" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {["high","medium","low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tags (comma separated)</label>
                <input className="form-control" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="fitout, commercial, urgent" />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input type="date" className="form-control" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned Team Members</label>
              <div className="multi-select">
                {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                  <span key={t} className={`multi-option ${form.assignedTo.includes(t) ? "selected" : ""}`}
                    onClick={() => setForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Estimate *</div>
              <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
                <div className="grid-2" style={{ marginBottom: 8 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Labour ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.labour || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, labour: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Materials ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.materials || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, materials: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Subcontractors ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.subcontractors || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, subcontractors: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Other ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.other || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, other: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                </div>
                {(() => {
                  const t = (form.estimate?.labour || 0) + (form.estimate?.materials || 0) + (form.estimate?.subcontractors || 0) + (form.estimate?.other || 0);
                  return <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 13, fontWeight: 800 }}>Total: {fmt(t)}</div>;
                })()}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

// ── Clients ───────────────────────────────────────────────────────────────────
const Clients = () => {
  const { clients, setClients, jobs, templates } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [clientMode, setClientMode] = useState("edit");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", sites: [], mainContact: { name: "", phone: "", email: "" }, accountsContact: { name: "", phone: "", email: "" }, rates: { labourRate: 0, materialMargin: 0, subcontractorMargin: 0 } });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [view, setView] = useState("grid");
  const [expandedSites, setExpandedSites] = useState({});
  // Site sub-modal
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editSite, setEditSite] = useState(null);
  const [siteClientId, setSiteClientId] = useState(null);
  const [siteForm, setSiteForm] = useState({ name: "", address: "", contactName: "", contactPhone: "", contactEmail: "" });

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const sites = c.sites || [];
    const matchSearch = !search ||
      c.name.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q) ||
      (c.mainContact?.name || "").toLowerCase().includes(q) ||
      (c.mainContact?.phone || "").toLowerCase().includes(q) ||
      (c.mainContact?.email || "").toLowerCase().includes(q) ||
      (c.accountsContact?.name || "").toLowerCase().includes(q) ||
      (c.accountsContact?.email || "").toLowerCase().includes(q) ||
      sites.some(s => (s.name || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q) || (s.contactName || "").toLowerCase().includes(q) || (s.contactPhone || "").toLowerCase().includes(q));
    const clientJobs = jobs.filter(j => j.clientId === c.id);
    const isActive = clientJobs.some(j => ["in_progress", "scheduled", "quoted", "draft"].includes(j.status));
    const matchStatus = filterStatus === "all" || (filterStatus === "active" ? isActive : !isActive);
    return matchSearch && matchStatus;
  });

  const openNew = () => {
    setEditClient(null);
    setClientMode("edit");
    setForm({ name: "", email: "", phone: "", address: "", sites: [], mainContact: { name: "", phone: "", email: "" }, accountsContact: { name: "", phone: "", email: "" }, rates: { labourRate: 0, materialMargin: 0, subcontractorMargin: 0 } });
    setShowModal(true);
  };
  const openEdit = (c) => {
    setEditClient(c);
    setClientMode("view");
    setForm({ ...c, sites: c.sites || [], mainContact: c.mainContact || { name: "", phone: "", email: "" }, accountsContact: c.accountsContact || { name: "", phone: "", email: "" }, rates: c.rates || { labourRate: 0, materialMargin: 0, subcontractorMargin: 0 } });
    setShowModal(true);
  };
  const save = async () => {
    try {
      if (editClient) {
        await updateCustomer(editClient.id, form);
        setClients(cs => cs.map(c => c.id === editClient.id ? { ...c, ...form } : c));
      } else {
        const saved = await createCustomer(form);
        setClients(cs => [...cs, { ...saved, sites: [] }]);
      }
    } catch (err) {
      console.error('Failed to save client:', err);
    }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteCustomer(id);
      setClients(cs => cs.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete client:', err);
    }
  };

  const toggleSites = (id) => setExpandedSites(s => ({ ...s, [id]: !s[id] }));

  // Site modal helpers
  const openNewSite = (clientId) => {
    setSiteClientId(clientId);
    setEditSite(null);
    setSiteForm({ name: "", address: "", contactName: "", contactPhone: "", contactEmail: "" });
    setShowSiteModal(true);
  };
  const openEditSite = (clientId, site) => {
    setSiteClientId(clientId);
    setEditSite(site);
    setSiteForm({ ...site });
    setShowSiteModal(true);
  };
  const saveSite = async () => {
    try {
      if (editSite) {
        const saved = await updateSite(editSite.id, siteForm);
        setClients(cs => cs.map(c => {
          if (c.id !== siteClientId) return c;
          return { ...c, sites: (c.sites || []).map(s => s.id === editSite.id ? saved : s) };
        }));
      } else {
        const saved = await createSite(siteClientId, siteForm);
        setClients(cs => cs.map(c => {
          if (c.id !== siteClientId) return c;
          return { ...c, sites: [...(c.sites || []), saved] };
        }));
      }
    } catch (err) {
      console.error('Failed to save site:', err);
    }
    setShowSiteModal(false);
  };
  const delSite = async (clientId, siteId) => {
    try {
      await deleteSite(siteId);
      setClients(cs => cs.map(c => c.id === clientId ? { ...c, sites: (c.sites||[]).filter(s => s.id !== siteId) } : c));
    } catch (err) {
      console.error('Failed to delete site:', err);
    }
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Clients</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.clients.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.clients.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.clients.accent }} onClick={openNew}><Icon name="plus" size={14} />New Client</button></div>
      </div>

      {view === "list" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Sites</th><th>Jobs</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">No clients found</div></div></td></tr>}
                {filtered.map(client => {
                  const clientJobs = jobs.filter(j => j.clientId === client.id);
                  const active = clientJobs.filter(j => j.status === "in_progress").length;
                  return (
                    <tr key={client.id} onClick={() => openEdit(client)} style={{ cursor: "pointer" }}>
                      <td style={{ fontWeight: 600 }}>{client.name}</td>
                      <td style={{ fontSize: 12, color: "#555" }}>{client.mainContact?.name || "—"}</td>
                      <td style={{ fontSize: 12, color: "#666" }}>{client.email || "—"}</td>
                      <td style={{ fontSize: 12, color: "#666" }}>{client.phone || "—"}</td>
                      <td>{(client.sites || []).length}</td>
                      <td>{clientJobs.length}</td>
                      <td>{active > 0 ? <span className="chip" style={{ background: "#111", color: "#fff" }}>{active}</span> : "—"}</td>
                      <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(client.id)}><Icon name="trash" size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filtered.map(client => {
          const clientJobs = jobs.filter(j => j.clientId === client.id);
          const active = clientJobs.filter(j => j.status === "in_progress").length;
          const sites = client.sites || [];
          const sitesOpen = expandedSites[client.id];
          return (
            <div key={client.id} className="card">
              {/* Client header */}
              <div onClick={() => openEdit(client)} style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", transition: "background 0.15s" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                    {client.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{client.name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {client.email  && <span style={{ fontSize: 12, color: "#666" }}>📧 {client.email}</span>}
                      {client.phone  && <span style={{ fontSize: 12, color: "#666" }}>📞 {client.phone}</span>}
                      {client.address && <span style={{ fontSize: 12, color: "#666" }}>📍 {client.address}</span>}
                    </div>
                    {client.mainContact?.name && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>👤 {client.mainContact.name} — Main Contact</div>}
                    {client.rates?.labourRate > 0 && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>${client.rates.labourRate}/hr labour rate</div>}
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <span className="chip">{clientJobs.length} jobs</span>
                      {active > 0 && <span className="chip" style={{ background: "#111", color: "#fff" }}>{active} active</span>}
                      <span className="chip">🏢 {sites.length} site{sites.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 12 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(client.id)}><Icon name="trash" size={12} /></button>
                </div>
              </div>

              {/* Sites accordion toggle */}
              <div
                style={{ borderTop: "1px solid #f0f0f0", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: sitesOpen ? "#fafafa" : "transparent" }}
                onClick={() => toggleSites(client.id)}
              >
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>
                  Sites &amp; Contacts ({sites.length})
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-ghost btn-xs" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={e => { e.stopPropagation(); openNewSite(client.id); }}>
                    <Icon name="plus" size={10} /> Add Site
                  </button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: sitesOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "#aaa" }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* Sites list */}
              {sitesOpen && (
                <div style={{ borderTop: "1px solid #f5f5f5" }}>
                  {sites.length === 0 ? (
                    <div style={{ padding: "16px 20px", fontSize: 13, color: "#bbb", textAlign: "center" }}>
                      No sites added yet. Click "+ Add Site" to add one.
                    </div>
                  ) : (
                    sites.map((site, si) => (
                      <div key={site.id} style={{ padding: "14px 20px", borderBottom: si < sites.length - 1 ? "1px solid #f5f5f5" : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>🏢</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{site.name}</div>
                          {site.address && <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>📍 {site.address}</div>}
                          {(site.contactName || site.contactPhone || site.contactEmail) && (
                            <div style={{ display: "flex", gap: "4px 14px", flexWrap: "wrap", marginTop: 4 }}>
                              {site.contactName  && <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>👤 {site.contactName}</span>}
                              {site.contactPhone && <span style={{ fontSize: 12, color: "#555" }}>📞 {site.contactPhone}</span>}
                              {site.contactEmail && <span style={{ fontSize: 12, color: "#555" }}>✉ {site.contactEmail}</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEditSite(client.id, site)}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delSite(client.id, site.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Recent jobs */}
              {clientJobs.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f0", padding: "12px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Recent Jobs</div>
                  {clientJobs.slice(0, 2).map(j => (
                    <div key={j.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{j.title}</span>
                      <StatusBadge status={j.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>}

      {/* Client edit/new drawer */}
      {showModal && (() => {
        const isNewClient = !editClient;
        const clientSites = editClient ? (clients.find(c => c.id === editClient.id)?.sites || []) : [];
        const clientJobCount = editClient ? jobs.filter(j => j.clientId === editClient.id).length : 0;
        return (
        <SectionDrawer
          accent={SECTION_COLORS.clients.accent}
          icon={<Icon name="clients" size={16} />}
          typeLabel="Client"
          title={editClient ? editClient.name : "New Client"}
          mode={clientMode} setMode={setClientMode}
          showToggle={!isNewClient}
          isNew={isNewClient}
          footer={clientMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.clients.accent, color: "#fff", border: "none" }} onClick={() => setClientMode("edit")}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editClient ? setClientMode("view") : setShowModal(false)}>{editClient ? "Cancel" : "Cancel"}</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.clients.accent, color: "#fff", border: "none" }} onClick={() => { save(); if (editClient) setClientMode("view"); }} disabled={!form.name}>
              <Icon name="check" size={13} /> {isNewClient ? "Add Client" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {clientMode === "view" ? (
            <div style={{ padding: "20px 24px" }}>
              <ViewField label="Company / Client Name" value={form.name} />
              <div className="grid-2">
                <ViewField label="Email" value={form.email} />
                <ViewField label="Phone" value={form.phone} />
              </div>
              <ViewField label="Address" value={form.address} />
              {/* Contact cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                {form.mainContact?.name && (
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Main Contact</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{form.mainContact.name}</div>
                    {form.mainContact.phone && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>📞 {form.mainContact.phone}</div>}
                    {form.mainContact.email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>✉ {form.mainContact.email}</div>}
                  </div>
                )}
                {form.accountsContact?.name && (
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Accounts Contact</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{form.accountsContact.name}</div>
                    {form.accountsContact.phone && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>📞 {form.accountsContact.phone}</div>}
                    {form.accountsContact.email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>✉ {form.accountsContact.email}</div>}
                  </div>
                )}
              </div>
              {/* Rates */}
              {(form.rates?.labourRate || form.rates?.materialMargin || form.rates?.subcontractorMargin) ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                  <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>Labour Rate</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>${form.rates.labourRate || 0}/hr</div>
                  </div>
                  <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>Materials Margin</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>{form.rates.materialMargin || 0}%</div>
                  </div>
                  <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>Subcontractor Margin</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>{form.rates.subcontractorMargin || 0}%</div>
                  </div>
                </div>
              ) : null}
              {/* Template Preferences */}
              <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12, marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Template Preferences</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[{ key: "quote", label: "Quotes" }, { key: "invoice", label: "Invoices" }, { key: "work_order", label: "Work Orders" }, { key: "purchase_order", label: "Purchase Orders" }].map(dt => {
                    const opts = templates.filter(t => t.type === dt.key);
                    const currentVal = form.templatePreferences?.[dt.key] || opts.find(t => t.isDefault)?.id || "";
                    return (
                      <div key={dt.key}>
                        <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{dt.label}</label>
                        <select value={currentVal} onChange={e => setForm(f => ({ ...f, templatePreferences: { ...(f.templatePreferences || {}), [dt.key]: Number(e.target.value) } }))} style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }}>
                          {opts.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (Default)" : ""}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <span className="chip">{clientJobCount} jobs</span>
                  <span className="chip">🏢 {clientSites.length} site{clientSites.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {clientSites.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Sites</div>
                  {clientSites.map(s => (
                    <div key={s.id} style={{ padding: "10px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                      {s.address && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{s.address}</div>}
                      {s.contactName && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>👤 {s.contactName}{s.contactPhone ? ` · ${s.contactPhone}` : ""}{s.contactEmail ? ` · ${s.contactEmail}` : ""}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="form-group"><label className="form-label">Company / Client Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            {/* Main Contact */}
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Main Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Name</label><input className="form-control" value={form.mainContact?.name || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, name: e.target.value } }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.mainContact?.phone || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, phone: e.target.value } }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.mainContact?.email || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, email: e.target.value } }))} placeholder="email@company.com" /></div>
              </div>
            </div>
            {/* Accounts Contact */}
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Accounts Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Name</label><input className="form-control" value={form.accountsContact?.name || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, name: e.target.value } }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.accountsContact?.phone || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, phone: e.target.value } }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.accountsContact?.email || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, email: e.target.value } }))} placeholder="email@company.com" /></div>
              </div>
            </div>
            {/* Rates */}
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Rates &amp; Margins</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Labour Rate ($/hr)</label><input type="number" className="form-control" value={form.rates?.labourRate || ""} onChange={e => setForm(f => ({ ...f, rates: { ...f.rates, labourRate: parseFloat(e.target.value) || 0 } }))} placeholder="0" /></div>
                <div className="form-group"><label className="form-label">Materials Margin (%)</label><input type="number" className="form-control" value={form.rates?.materialMargin || ""} onChange={e => setForm(f => ({ ...f, rates: { ...f.rates, materialMargin: parseFloat(e.target.value) || 0 } }))} placeholder="0" /></div>
                <div className="form-group"><label className="form-label">Subcontractor Margin (%)</label><input type="number" className="form-control" value={form.rates?.subcontractorMargin || ""} onChange={e => setForm(f => ({ ...f, rates: { ...f.rates, subcontractorMargin: parseFloat(e.target.value) || 0 } }))} placeholder="0" /></div>
              </div>
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}

      {/* Site add/edit drawer */}
      {showSiteModal && (
        <SectionDrawer
          accent={SECTION_COLORS.clients.accent}
          icon={<span style={{ fontSize: 16 }}>🏢</span>}
          typeLabel="Site"
          title={editSite ? editSite.name : "Add Site"}
          mode="edit" setMode={() => {}}
          showToggle={false}
          footer={<>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSiteModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.clients.accent, color: "#fff", border: "none" }} onClick={saveSite} disabled={!siteForm.name}>
              <Icon name="check" size={13} /> {editSite ? "Save Changes" : "Add Site"}
            </button>
          </>}
          onClose={() => setShowSiteModal(false)}
          zIndex={1060}
        >
          <div style={{ padding: "20px 24px" }}>
            <div className="form-group"><label className="form-label">Site Name *</label><input className="form-control" value={siteForm.name} onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Head Office, Warehouse, Site A" /></div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={siteForm.address} onChange={e => setSiteForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical address" /></div>
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Site Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Contact Name</label><input className="form-control" value={siteForm.contactName} onChange={e => setSiteForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Contact Phone</label><input className="form-control" value={siteForm.contactPhone} onChange={e => setSiteForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Contact Email</label><input type="email" className="form-control" value={siteForm.contactEmail || ""} onChange={e => setSiteForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="email@company.com" /></div>
              </div>
            </div>
          </div>
        </SectionDrawer>
      )}
    </div>
  );
};

// ── Contractors ───────────────────────────────────────────────────────────────
const Contractors = () => {
  const { contractors, setContractors, workOrders, bills } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mode, setMode] = useState("edit");
  const [form, setForm] = useState({ name: "", contact: "", email: "", phone: "", trade: "Other", abn: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState("all");
  const [filterCompliance, setFilterCompliance] = useState("all");
  const [view, setView] = useState("list");
  const [showDocForm, setShowDocForm] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [docForm, setDocForm] = useState({ type: "workers_comp" });
  const [docImagePreview, setDocImagePreview] = useState(null);
  const [docExtracting, setDocExtracting] = useState(false);
  const [docExtractError, setDocExtractError] = useState(null);
  const [compEmailSending, setCompEmailSending] = useState(null);
  const [compEmailStatus, setCompEmailStatus] = useState(null);
  const docFileRef = useRef(null);

  const handleSendComplianceReminder = async (contractor, doc, docType) => {
    if (!contractor.email) { alert("No email address for this contractor. Please add one first."); return; }
    const days = doc?.expiryDate ? getDaysUntilExpiry(doc.expiryDate) : null;
    if (!window.confirm(`Send compliance reminder to ${contractor.name} (${contractor.email}) about ${docType.label}?`)) return;
    setCompEmailSending(doc.id); setCompEmailStatus(null);
    try {
      await sendEmail("compliance_expiry", contractor.email, { contractorName: contractor.name, docType: docType.label, expiryDate: doc.expiryDate, daysUntil: days });
      setCompEmailStatus({ type: "success", msg: `Reminder sent to ${contractor.email}`, docId: doc.id });
      setTimeout(() => setCompEmailStatus(null), 4000);
    } catch (err) {
      setCompEmailStatus({ type: "error", msg: err.message || "Failed to send", docId: doc.id });
    } finally { setCompEmailSending(null); }
  };

  const filtered = contractors.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search || c.name.toLowerCase().includes(q) || (c.contact || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.trade || "").toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q) || (c.abn || "").toLowerCase().includes(q) || (c.notes || "").toLowerCase().includes(q) || (c.complianceDocs || []).some(d => (d.name || d.type || "").toLowerCase().includes(q));
    const matchTrade = filterTrade === "all" || c.trade === filterTrade;
    if (!matchSearch || !matchTrade) return false;
    if (filterCompliance === "all") return true;
    const issues = getContractorComplianceCount(c);
    if (filterCompliance === "compliant") return issues === 0;
    if (filterCompliance === "issues") return issues > 0;
    return true;
  });
  const trades = [...new Set(contractors.map(c => c.trade).filter(Boolean))].sort();

  const openNew = () => { setEditItem(null); setMode("edit"); setForm({ name: "", contact: "", email: "", phone: "", trade: "Other", abn: "", notes: "" }); setShowDocForm(false); setShowModal(true); };
  const openEdit = (c) => { setEditItem(c); setMode("view"); setForm(c); setShowDocForm(false); setShowModal(true); };
  const save = () => {
    if (editItem) {
      setContractors(cs => cs.map(c => c.id === editItem.id ? { ...c, ...form } : c));
    } else {
      setContractors(cs => [...cs, { ...form, id: "c" + Date.now(), documents: [] }]);
    }
    setShowModal(false);
  };
  const del = (id) => { if (window.confirm("Delete this contractor?")) setContractors(cs => cs.filter(c => c.id !== id)); };
  const accent = SECTION_COLORS.contractors.accent;

  const getWOCount = (c) => workOrders.filter(wo => wo.contractorName === c.name || wo.contractorId === c.id).length;
  const getActiveWOs = (c) => workOrders.filter(wo => (wo.contractorName === c.name || wo.contractorId === c.id) && !ORDER_TERMINAL.includes(wo.status));
  const getContractorBills = (c) => bills.filter(b => b.supplier === c.name);
  const getBillTotal = (c) => getContractorBills(c).reduce((s, b) => s + (b.amount || 0), 0);

  // Document management
  const openDocForm = (docType, existingDoc) => {
    if (existingDoc) {
      setEditDoc(existingDoc);
      setDocForm({ ...existingDoc });
    } else {
      setEditDoc(null);
      setDocForm({ type: docType });
    }
    setDocImagePreview(null);
    setDocExtractError(null);
    setShowDocForm(true);
  };

  const saveDoc = () => {
    const contractorId = editItem?.id;
    if (!contractorId) return;
    setContractors(cs => cs.map(c => {
      if (c.id !== contractorId) return c;
      const docs = [...(c.documents || [])];
      if (editDoc) {
        const idx = docs.findIndex(d => d.id === editDoc.id);
        if (idx >= 0) docs[idx] = { ...docForm, id: editDoc.id };
      } else {
        docs.push({ ...docForm, id: "d" + Date.now(), uploadedAt: new Date().toISOString().slice(0, 10) });
      }
      const updated = { ...c, documents: docs };
      setEditItem(updated);
      setForm(updated);
      return updated;
    }));
    setShowDocForm(false);
  };

  const deleteDoc = (docId) => {
    if (!editItem || !window.confirm("Delete this document?")) return;
    setContractors(cs => cs.map(c => {
      if (c.id !== editItem.id) return c;
      const updated = { ...c, documents: (c.documents || []).filter(d => d.id !== docId) };
      setEditItem(updated);
      setForm(updated);
      return updated;
    }));
  };

  const handleDocFile = async (file) => {
    if (!file) return;
    setDocExtractError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setDocImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setDocExtracting(true);
      try {
        const data = await extractDocumentFromImage(base64, mimeType, docForm.type);
        if (data) {
          setDocForm(f => ({ ...f, ...data }));
        } else {
          setDocExtractError("AI extraction not available — fill in manually.");
        }
      } catch (err) {
        setDocExtractError(err.message || "Extraction failed — fill in manually.");
      } finally {
        setDocExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const ComplianceBadge = ({ contractor }) => {
    const issues = getContractorComplianceCount(contractor);
    if (issues === 0) return <span className="badge" style={{ background: "#ecfdf5", color: "#059669", fontSize: 10 }}>Compliant</span>;
    return <span className="badge" style={{ background: "#fef2f2", color: "#dc2626", fontSize: 10 }}>{issues} issue{issues > 1 ? "s" : ""}</span>;
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contractors..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterTrade} onChange={e => setFilterTrade(e.target.value)}>
          <option value="all">All Trades</option>
          {CONTRACTOR_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="form-control" style={{ width: "auto" }} value={filterCompliance} onChange={e => setFilterCompliance(e.target.value)}>
          <option value="all">All Compliance</option>
          <option value="compliant">Compliant</option>
          <option value="issues">Has Issues</option>
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: accent }} onClick={openNew}><Icon name="plus" size={14} />New Contractor</button></div>
      </div>

      {view === "list" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Trade</th><th>Compliance</th><th>Active WOs</th><th>Bills</th><th>Bill Total</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">🏗️</div><div className="empty-state-text">No contractors found</div></div></td></tr>}
                {filtered.map(c => {
                  const billCount = getContractorBills(c).length;
                  const billTotal = getBillTotal(c);
                  const compIssues = getContractorComplianceCount(c);
                  return (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => openEdit(c)}>
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td>{c.contact || "—"}<div style={{ fontSize: 11, color: "#999" }}>{c.phone}</div></td>
                    <td><span className="chip" style={{ fontSize: 10 }}>{c.trade}</span></td>
                    <td><ComplianceBadge contractor={c} /></td>
                    <td><span style={{ fontWeight: 600, color: getActiveWOs(c).length > 0 ? accent : "#ccc" }}>{getActiveWOs(c).length}</span></td>
                    <td><span style={{ fontWeight: 600, color: billCount > 0 ? SECTION_COLORS.bills.accent : "#ccc" }}>{billCount}</span></td>
                    <td style={{ fontWeight: billTotal > 0 ? 600 : 400, color: billTotal > 0 ? "#111" : "#ccc" }}>{billTotal > 0 ? fmt(billTotal) : "—"}</td>
                    <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(c.id)}><Icon name="trash" size={12} /></button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">🏗️</div><div className="empty-state-text">No contractors found</div></div>}
          {filtered.map(c => {
            const activeWOs = getActiveWOs(c);
            const billCount = getContractorBills(c).length;
            const billTotal = getBillTotal(c);
            return (
              <div key={c.id} className="card" onClick={() => openEdit(c)} style={{ cursor: "pointer", padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <ComplianceBadge contractor={c} />
                    <span className="chip" style={{ fontSize: 10, background: hexToRgba(accent, 0.12), color: accent }}>{c.trade}</span>
                  </div>
                </div>
                {c.contact && <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{c.contact}</div>}
                {c.email && <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{c.email}</div>}
                {c.phone && <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>{c.phone}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: billCount > 0 ? 8 : 0 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className="chip" style={{ fontSize: 10 }}>{getWOCount(c)} WO{getWOCount(c) !== 1 ? "s" : ""} · {activeWOs.length} active</span>
                    {billCount > 0 && <span className="chip" style={{ fontSize: 10 }}>{billCount} bill{billCount !== 1 ? "s" : ""}</span>}
                  </div>
                  <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={e => { e.stopPropagation(); del(c.id); }}><Icon name="trash" size={12} /></button>
                </div>
                {billTotal > 0 && <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>Bills total: <span style={{ color: "#111" }}>{fmt(billTotal)}</span></div>}
              </div>
            );
          })}
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${trades.length || 1}, minmax(200px,1fr))` }}>
          {(trades.length > 0 ? trades : ["Other"]).map(trade => {
            const colItems = filtered.filter(c => c.trade === trade);
            return (
              <div key={trade} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{trade}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colItems.length}</span>
                </div>
                {colItems.map(c => {
                  const activeWOs = getActiveWOs(c);
                  const billCount = getContractorBills(c).length;
                  return (
                    <div key={c.id} className="kanban-card" onClick={() => openEdit(c)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{c.name}</div>
                        <ComplianceBadge contractor={c} />
                      </div>
                      {c.contact && <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{c.contact}</div>}
                      {c.phone && <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{c.phone}</div>}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {activeWOs.length > 0 && <span className="chip" style={{ fontSize: 10 }}>{activeWOs.length} active WO{activeWOs.length > 1 ? "s" : ""}</span>}
                        {billCount > 0 && <span className="chip" style={{ fontSize: 10 }}>{billCount} bill{billCount > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (() => {
        const isNew = !editItem;
        const linkedWOs = editItem ? workOrders.filter(wo => wo.contractorName === editItem.name || wo.contractorId === editItem.id) : [];
        const linkedBills = editItem ? bills.filter(b => b.supplier === editItem.name) : [];
        const linkedBillTotal = linkedBills.reduce((s, b) => s + (b.amount || 0), 0);
        const docs = editItem?.documents || [];
        return (
          <SectionDrawer
            accent={accent}
            icon={<Icon name="contractors" size={16} />}
            typeLabel="Contractor"
            title={editItem ? editItem.name : "New Contractor"}
            mode={mode} setMode={setMode}
            showToggle={!isNew} isNew={isNew}
            onClose={() => { setShowModal(false); setShowDocForm(false); }}
            footer={
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {mode === "edit" && <button className="btn btn-primary" style={{ background: accent }} onClick={save}><Icon name="check" size={14} />{isNew ? "Create" : "Save"}</button>}
              </div>
            }
          >
            <div style={{ padding: 20 }}>
              {mode === "view" ? (
                <>
                  <ViewField label="Name" value={form.name} />
                  <ViewField label="Contact Person" value={form.contact} />
                  <ViewField label="Email" value={form.email} />
                  <ViewField label="Phone" value={form.phone} />
                  <ViewField label="Trade" value={form.trade} />
                  <ViewField label="ABN" value={form.abn} />
                  <ViewField label="Notes" value={form.notes} />

                  {linkedWOs.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Linked Work Orders</div>
                      {linkedWOs.map(wo => (
                        <div key={wo.id} style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ fontWeight: 700 }}>{wo.ref}</span>
                          <OrderStatusBadge status={wo.status} />
                          {wo.dueDate && <span style={{ float: "right", color: "#888" }}>{wo.dueDate}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {linkedBills.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Bills</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{fmt(linkedBillTotal)}</span>
                      </div>
                      {linkedBills.map(b => {
                        const bsc = BILL_STATUS_COLORS[b.status] || { bg: "#f0f0f0", text: "#666" };
                        return (
                        <div key={b.id} style={{ padding: "10px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <div>
                              <span style={{ fontWeight: 700 }}>{b.supplier}</span>
                              {b.invoiceNo && <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: 11, marginLeft: 8 }}>{b.invoiceNo}</span>}
                            </div>
                            <span style={{ fontWeight: 700 }}>{fmt(b.amount)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span className="badge" style={{ background: bsc.bg, color: bsc.text, fontSize: 10 }}>{BILL_STATUS_LABELS[b.status] || b.status}</span>
                              <span className="chip" style={{ fontSize: 10 }}>{b.category}</span>
                            </div>
                            <span style={{ fontSize: 11, color: "#999" }}>{b.date}</span>
                          </div>
                          {b.description && <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>{b.description}</div>}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Compliance Documents */}
                  <div style={{ marginTop: 24 }}>
                    {compEmailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600, background: compEmailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: compEmailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${compEmailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{compEmailStatus.msg}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Compliance Documents</div>
                      <ComplianceBadge contractor={editItem} />
                    </div>
                    {COMPLIANCE_DOC_TYPES.map(dt => {
                      const doc = docs.find(d => d.type === dt.id);
                      const status = getComplianceStatus(doc);
                      const sc = COMPLIANCE_STATUS_COLORS[status];
                      const days = doc?.expiryDate ? getDaysUntilExpiry(doc.expiryDate) : null;
                      return (
                        <div key={dt.id} style={{ padding: "12px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 8, borderLeft: `3px solid ${sc.text}`, cursor: "pointer" }} onClick={() => openDocForm(dt.id, doc)}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: doc ? 6 : 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{dt.label}</span>
                              <span className="badge" style={{ background: sc.bg, color: sc.text, fontSize: 10 }}>{sc.label}</span>
                            </div>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              {doc && (status === "expired" || status === "expiring_soon") && <button className="btn btn-ghost btn-xs" style={{ color: "#d97706" }} disabled={compEmailSending === doc.id} onClick={e => { e.stopPropagation(); handleSendComplianceReminder(editItem, doc, dt); }} title="Send Reminder"><Icon name="send" size={10} />{compEmailSending === doc.id ? "..." : ""}</button>}
                              {doc && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }}><Icon name="trash" size={10} /></button>}
                            </div>
                          </div>
                          {doc && (
                            <div style={{ fontSize: 11, color: "#666" }}>
                              {doc.policyNumber && <div>Policy: <span style={{ fontWeight: 600, color: "#333" }}>{doc.policyNumber}</span></div>}
                              {doc.licenseNumber && <div>License: <span style={{ fontWeight: 600, color: "#333" }}>{doc.licenseNumber}</span></div>}
                              {doc.cardNumber && <div>Card: <span style={{ fontWeight: 600, color: "#333" }}>{doc.cardNumber}</span></div>}
                              {doc.insurer && <div>Insurer: {doc.insurer}</div>}
                              {doc.coverAmount && <div>Cover: {doc.coverAmount}</div>}
                              {doc.licenseClass && <div>Class: {doc.licenseClass}</div>}
                              {doc.issuingBody && <div>Issued by: {doc.issuingBody}</div>}
                              {doc.holderName && <div>Holder: {doc.holderName}</div>}
                              {doc.title && <div>Title: {doc.title}</div>}
                              {doc.revision && <div>Revision: {doc.revision}</div>}
                              {doc.approvedBy && <div>Approved by: {doc.approvedBy}</div>}
                              {doc.expiryDate && (
                                <div style={{ marginTop: 4, fontWeight: 600, color: status === "expired" ? "#dc2626" : status === "expiring_soon" ? "#d97706" : "#059669" }}>
                                  Expires: {doc.expiryDate} {days !== null && `(${days < 0 ? Math.abs(days) + "d overdue" : days + "d remaining"})`}
                                </div>
                              )}
                              {doc.periodFrom && doc.periodTo && <div>Period: {doc.periodFrom} to {doc.periodTo}</div>}
                              {doc.issueDate && <div>Issued: {doc.issueDate}</div>}
                              {doc.approvalDate && <div>Approved: {doc.approvalDate}</div>}
                            </div>
                          )}
                          {!doc && <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>Not uploaded</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="form-group"><label>Contact Person</label><input className="form-control" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
                  <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="form-group"><label>Trade</label><select className="form-control" value={form.trade} onChange={e => setForm(f => ({ ...f, trade: e.target.value }))}>{CONTRACTOR_TRADES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div className="form-group"><label>ABN</label><input className="form-control" value={form.abn} onChange={e => setForm(f => ({ ...f, abn: e.target.value }))} /></div>
                  <div className="form-group"><label>Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                </>
              )}
            </div>
          </SectionDrawer>
        );
      })()}

      {/* Document Add/Edit Modal */}
      {showDocForm && (() => {
        const dt = COMPLIANCE_DOC_TYPES.find(t => t.id === docForm.type);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowDocForm(false)}>
            <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{editDoc ? "Edit" : "Add"} {dt?.label || "Document"}</span>
                <button className="btn btn-ghost btn-xs" onClick={() => setShowDocForm(false)}><Icon name="close" size={14} /></button>
              </div>
              <div style={{ padding: 20 }}>
                {/* AI Capture */}
                <div style={{ marginBottom: 16, padding: 16, border: "2px dashed #d0d0d0", borderRadius: 8, textAlign: "center", background: "#fafafa", cursor: "pointer" }}
                  onClick={() => docFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && (f.type.startsWith("image/") || f.type === "application/pdf")) handleDocFile(f); }}
                >
                  <input ref={docFileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(f); }} />
                  {docExtracting ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 12 }}>
                      <div style={{ width: 24, height: 24, border: "3px solid #e8e8e8", borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      <span style={{ fontSize: 12, color: "#888" }}>Extracting document details...</span>
                    </div>
                  ) : docImagePreview ? (
                    <div>
                      <img src={docImagePreview} alt="Document" style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 6, marginBottom: 8 }} />
                      <div style={{ fontSize: 11, color: "#888" }}>Tap to replace</div>
                    </div>
                  ) : (
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
                      <div style={{ fontSize: 12, color: "#888" }}>Take photo or upload document</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>AI will extract key details</div>
                    </div>
                  )}
                </div>
                {docExtractError && <div style={{ fontSize: 11, color: "#d97706", background: "#fffbeb", padding: "6px 10px", borderRadius: 6, marginBottom: 12 }}>{docExtractError}</div>}

                {/* Document type selector (only for new) */}
                {!editDoc && (
                  <div className="form-group">
                    <label>Document Type</label>
                    <select className="form-control" value={docForm.type} onChange={e => setDocForm(f => ({ ...f, type: e.target.value }))}>
                      {COMPLIANCE_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                )}

                {/* Dynamic fields based on doc type */}
                {(docForm.type === "workers_comp" || docForm.type === "public_liability") && (
                  <>
                    <div className="form-group"><label>Policy Number</label><input className="form-control" value={docForm.policyNumber || ""} onChange={e => setDocForm(f => ({ ...f, policyNumber: e.target.value }))} /></div>
                    <div className="form-group"><label>Insurer</label><input className="form-control" value={docForm.insurer || ""} onChange={e => setDocForm(f => ({ ...f, insurer: e.target.value }))} /></div>
                    {docForm.type === "public_liability" && (
                      <div className="form-group"><label>Cover Amount</label><input className="form-control" value={docForm.coverAmount || ""} onChange={e => setDocForm(f => ({ ...f, coverAmount: e.target.value }))} /></div>
                    )}
                    <div className="form-group"><label>Expiry Date</label><input className="form-control" type="date" value={docForm.expiryDate || ""} onChange={e => setDocForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "white_card" && (
                  <>
                    <div className="form-group"><label>Card Number</label><input className="form-control" value={docForm.cardNumber || ""} onChange={e => setDocForm(f => ({ ...f, cardNumber: e.target.value }))} /></div>
                    <div className="form-group"><label>Holder Name</label><input className="form-control" value={docForm.holderName || ""} onChange={e => setDocForm(f => ({ ...f, holderName: e.target.value }))} /></div>
                    <div className="form-group"><label>Issue Date</label><input className="form-control" type="date" value={docForm.issueDate || ""} onChange={e => setDocForm(f => ({ ...f, issueDate: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "trade_license" && (
                  <>
                    <div className="form-group"><label>License Number</label><input className="form-control" value={docForm.licenseNumber || ""} onChange={e => setDocForm(f => ({ ...f, licenseNumber: e.target.value }))} /></div>
                    <div className="form-group"><label>License Class</label><input className="form-control" value={docForm.licenseClass || ""} onChange={e => setDocForm(f => ({ ...f, licenseClass: e.target.value }))} /></div>
                    <div className="form-group"><label>Issuing Body</label><input className="form-control" value={docForm.issuingBody || ""} onChange={e => setDocForm(f => ({ ...f, issuingBody: e.target.value }))} /></div>
                    <div className="form-group"><label>Expiry Date</label><input className="form-control" type="date" value={docForm.expiryDate || ""} onChange={e => setDocForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "subcontractor_statement" && (
                  <>
                    <div className="form-group"><label>Period From</label><input className="form-control" type="date" value={docForm.periodFrom || ""} onChange={e => setDocForm(f => ({ ...f, periodFrom: e.target.value }))} /></div>
                    <div className="form-group"><label>Period To</label><input className="form-control" type="date" value={docForm.periodTo || ""} onChange={e => setDocForm(f => ({ ...f, periodTo: e.target.value }))} /></div>
                    <div className="form-group"><label>ABN</label><input className="form-control" value={docForm.abn || ""} onChange={e => setDocForm(f => ({ ...f, abn: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "swms" && (
                  <>
                    <div className="form-group"><label>Title</label><input className="form-control" value={docForm.title || ""} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} /></div>
                    <div className="form-group"><label>Revision</label><input className="form-control" value={docForm.revision || ""} onChange={e => setDocForm(f => ({ ...f, revision: e.target.value }))} /></div>
                    <div className="form-group"><label>Approved By</label><input className="form-control" value={docForm.approvedBy || ""} onChange={e => setDocForm(f => ({ ...f, approvedBy: e.target.value }))} /></div>
                    <div className="form-group"><label>Approval Date</label><input className="form-control" type="date" value={docForm.approvalDate || ""} onChange={e => setDocForm(f => ({ ...f, approvalDate: e.target.value }))} /></div>
                  </>
                )}
              </div>
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowDocForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{ background: accent }} onClick={saveDoc}><Icon name="check" size={14} />{editDoc ? "Update" : "Add"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ── Suppliers ─────────────────────────────────────────────────────────────────
const Suppliers = () => {
  const { suppliers, setSuppliers, purchaseOrders, bills } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mode, setMode] = useState("edit");
  const [form, setForm] = useState({ name: "", contact: "", email: "", phone: "", abn: "", notes: "" });
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    return !search || s.name.toLowerCase().includes(q) || (s.contact || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q) || (s.phone || "").toLowerCase().includes(q) || (s.abn || "").toLowerCase().includes(q) || (s.notes || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q);
  });

  const openNew = () => { setEditItem(null); setMode("edit"); setForm({ name: "", contact: "", email: "", phone: "", abn: "", notes: "" }); setShowModal(true); };
  const openEdit = (s) => { setEditItem(s); setMode("view"); setForm(s); setShowModal(true); };
  const save = () => {
    if (editItem) {
      setSuppliers(ss => ss.map(s => s.id === editItem.id ? { ...s, ...form } : s));
    } else {
      setSuppliers(ss => [...ss, { ...form, id: "s" + Date.now() }]);
    }
    setShowModal(false);
  };
  const del = (id) => { if (window.confirm("Delete this supplier?")) setSuppliers(ss => ss.filter(s => s.id !== id)); };
  const accent = SECTION_COLORS.suppliers.accent;

  const getPOCount = (s) => purchaseOrders.filter(po => po.supplierName === s.name || po.supplierId === s.id).length;
  const getActivePOs = (s) => purchaseOrders.filter(po => (po.supplierName === s.name || po.supplierId === s.id) && !ORDER_TERMINAL.includes(po.status));
  const getBillCount = (s) => bills.filter(b => b.supplier === s.name).length;

  const kanbanGroups = useMemo(() => {
    const groups = { "Active POs": [], "Bills Only": [], "Inactive": [] };
    filtered.forEach(s => {
      if (getActivePOs(s).length > 0) groups["Active POs"].push(s);
      else if (getBillCount(s) > 0) groups["Bills Only"].push(s);
      else groups["Inactive"].push(s);
    });
    return groups;
  }, [filtered, purchaseOrders, bills]);

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..." />
        </div>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: accent }} onClick={openNew}><Icon name="plus" size={14} />New Supplier</button></div>
      </div>

      {view === "list" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>ABN</th><th>Phone</th><th>POs</th><th>Bills</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">📦</div><div className="empty-state-text">No suppliers found</div></div></td></tr>}
                {filtered.map(s => (
                  <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => openEdit(s)}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td>{s.contact || "—"}</td>
                    <td style={{ color: "#666" }}>{s.email || "—"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "#888" }}>{s.abn || "—"}</td>
                    <td style={{ color: "#666" }}>{s.phone || "—"}</td>
                    <td><span style={{ fontWeight: 600, color: getActivePOs(s).length > 0 ? accent : "#ccc" }}>{getPOCount(s)}</span></td>
                    <td><span style={{ fontWeight: 600, color: getBillCount(s) > 0 ? "#dc2626" : "#ccc" }}>{getBillCount(s)}</span></td>
                    <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(s.id)}><Icon name="trash" size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">📦</div><div className="empty-state-text">No suppliers found</div></div>}
          {filtered.map(s => (
            <div key={s.id} className="card" onClick={() => openEdit(s)} style={{ cursor: "pointer", padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{s.name}</div>
              {s.contact && <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{s.contact}</div>}
              {s.email && <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{s.email}</div>}
              {s.phone && <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{s.phone}</div>}
              {s.abn && <div style={{ fontSize: 11, color: "#bbb", fontFamily: "monospace", marginBottom: 8 }}>ABN {s.abn}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className="chip" style={{ fontSize: 10 }}>{getPOCount(s)} PO{getPOCount(s) !== 1 ? "s" : ""}</span>
                  <span className="chip" style={{ fontSize: 10 }}>{getBillCount(s)} bill{getBillCount(s) !== 1 ? "s" : ""}</span>
                </div>
                <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={e => { e.stopPropagation(); del(s.id); }}><Icon name="trash" size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(3, minmax(200px,1fr))" }}>
          {Object.entries(kanbanGroups).map(([group, items]) => (
            <div key={group} className="kanban-col">
              <div className="kanban-col-header">
                <span>{group}</span>
                <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{items.length}</span>
              </div>
              {items.map(s => (
                <div key={s.id} className="kanban-card" onClick={() => openEdit(s)}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{s.name}</div>
                  {s.contact && <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{s.contact}</div>}
                  <div style={{ display: "flex", gap: 4 }}>
                    {getPOCount(s) > 0 && <span className="chip" style={{ fontSize: 10 }}>{getPOCount(s)} PO{getPOCount(s) > 1 ? "s" : ""}</span>}
                    {getBillCount(s) > 0 && <span className="chip" style={{ fontSize: 10 }}>{getBillCount(s)} bill{getBillCount(s) > 1 ? "s" : ""}</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {showModal && (() => {
        const isNew = !editItem;
        const linkedPOs = editItem ? purchaseOrders.filter(po => po.supplierName === editItem.name || po.supplierId === editItem.id) : [];
        const linkedBills = editItem ? bills.filter(b => b.supplier === editItem.name) : [];
        return (
          <SectionDrawer
            accent={accent}
            icon={<Icon name="suppliers" size={16} />}
            typeLabel="Supplier"
            title={editItem ? editItem.name : "New Supplier"}
            mode={mode} setMode={setMode}
            showToggle={!isNew} isNew={isNew}
            onClose={() => setShowModal(false)}
            footer={
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {mode === "edit" && <button className="btn btn-primary" style={{ background: accent }} onClick={save}><Icon name="check" size={14} />{isNew ? "Create" : "Save"}</button>}
              </div>
            }
          >
            <div style={{ padding: 20 }}>
              {mode === "view" ? (
                <>
                  <ViewField label="Name" value={form.name} />
                  <ViewField label="Contact" value={form.contact} />
                  <ViewField label="Email" value={form.email} />
                  <ViewField label="Phone" value={form.phone} />
                  <ViewField label="ABN" value={form.abn} />
                  <ViewField label="Notes" value={form.notes} />
                  {linkedPOs.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Purchase Orders</div>
                      {linkedPOs.map(po => (
                        <div key={po.id} style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ fontWeight: 700 }}>{po.ref}</span>
                          <OrderStatusBadge status={po.status} />
                          {po.poLimit && <span style={{ float: "right", color: "#888" }}>${parseFloat(po.poLimit).toLocaleString()}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {linkedBills.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Bills</div>
                      {linkedBills.map(b => (
                        <div key={b.id} style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ fontWeight: 700 }}>{b.supplier}</span>
                          {b.invoiceNo && <span style={{ color: "#999", marginLeft: 8 }}>{b.invoiceNo}</span>}
                          <span style={{ float: "right", fontWeight: 600 }}>{fmt(b.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="form-group"><label>Contact</label><input className="form-control" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
                  <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="form-group"><label>ABN</label><input className="form-control" value={form.abn} onChange={e => setForm(f => ({ ...f, abn: e.target.value }))} /></div>
                  <div className="form-group"><label>Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                </>
              )}
            </div>
          </SectionDrawer>
        );
      })()}
    </div>
  );
};

// ── Form Filler Modal ────────────────────────────────────────────────────────

// ── Schedule ──────────────────────────────────────────────────────────────────
const Schedule = () => {
  const { schedule, setSchedule, futureSchedule, setFutureSchedule, jobs, clients, staff } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [schedMode, setSchedMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", date: new Date().toISOString().slice(0,10), assignedTo: [], notes: "" });
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grouped");
  const dragEntryRef = useRef(null);
  const [showFutureModal, setShowFutureModal] = useState(false);
  const [editFutureEntry, setEditFutureEntry] = useState(null);
  const [futureMode, setFutureMode] = useState("edit");
  const [futureForm, setFutureForm] = useState({ jobId: "", weekStart: "", title: "", assignedTo: [], notes: "" });
  const dragFutureRef = useRef(null);

  // Weather data for Coffs Harbour NSW (-30.2963, 153.1157)
  const [weather, setWeather] = useState({});
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-30.2963&longitude=153.1157&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Australia%2FSydney&forecast_days=14");
        const data = await res.json();
        if (data.daily) {
          const w = {};
          data.daily.time.forEach((date, i) => {
            w[date] = {
              maxTemp: data.daily.temperature_2m_max[i],
              minTemp: data.daily.temperature_2m_min[i],
              rain: data.daily.precipitation_sum[i],
              rainChance: data.daily.precipitation_probability_max[i],
            };
          });
          setWeather(w);
        }
      } catch (err) { console.error("Weather fetch failed:", err); }
    };
    fetchWeather();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...schedule].sort((a, b) => a.date > b.date ? 1 : -1);
  const displayed = sorted.filter(e => {
    const matchDate = !filterDate || e.date === filterDate;
    if (!matchDate) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const job = jobs.find(j => j.id === e.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    const site = job?.siteId ? (client?.sites || []).find(s => s.id === job.siteId) : null;
    return (job?.title || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q) ||
      (e.assignedTo || []).some(n => n.toLowerCase().includes(q)) ||
      (site?.name || "").toLowerCase().includes(q) ||
      (site?.address || "").toLowerCase().includes(q) ||
      (client?.address || "").toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditEntry(null);
    setSchedMode("edit");
    setForm({ jobId: jobs[0]?.id || "", date: today, assignedTo: [], notes: "" });
    setShowModal(true);
  };
  const openEdit = (s) => {
    setEditEntry(s);
    setSchedMode("view");
    setForm({ jobId: s.jobId, date: s.date, assignedTo: s.assignedTo || [], notes: s.notes || "" });
    setShowModal(true);
  };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editEntry) {
        const saved = await updateScheduleEntry(editEntry.id, data);
        setSchedule(s => s.map(e => e.id === editEntry.id ? saved : e));
      } else {
        const saved = await createScheduleEntry(data);
        setSchedule(s => [...s, saved]);
      }
    } catch (err) { console.error('Failed to save schedule entry:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteScheduleEntry(id);
      setSchedule(s => s.filter(e => e.id !== id));
    } catch (err) { console.error('Failed to delete schedule entry:', err); }
  };

  const grouped = displayed.reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});

  // Week helpers for kanban view
  const getMonday = (d) => { const dt = new Date(d + "T12:00:00"); const day = dt.getDay(); const diff = day === 0 ? -6 : 1 - day; dt.setDate(dt.getDate() + diff); return dt.toISOString().slice(0, 10); };
  const todayMon = getMonday(today);
  const nextMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const weekDays = (mon) => Array.from({ length: 7 }, (_, i) => { const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const thisWeekDays = weekDays(todayMon);
  const nextWeekDays = weekDays(nextMon);
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const accent = SECTION_COLORS.schedule.accent;

  const handleDrop = async (dateStr, e) => {
    e.preventDefault();
    // Clear all drag-over highlights
    document.querySelectorAll(".schedule-day-col.drag-over").forEach(el => el.classList.remove("drag-over"));
    const entryId = dragEntryRef.current;
    if (!entryId) return;
    const entry = schedule.find(s => s.id === entryId);
    dragEntryRef.current = null;
    if (!entry || entry.date === dateStr) return;
    // Update locally first for instant feedback
    const movedEntry = { ...entry, date: dateStr };
    setSchedule(s => s.map(x => x.id === entry.id ? movedEntry : x));
    try {
      const saved = await updateScheduleEntry(entry.id, movedEntry);
      setSchedule(s => s.map(x => x.id === entry.id ? saved : x));
    } catch (err) { console.error('Failed to persist schedule move:', err); }
  };

  const DayCol = ({ dateStr, dayName, allEntries, isCompact }) => {
    const d = new Date(dateStr + "T12:00:00");
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const isWeekend = dayName === "Sat" || dayName === "Sun";
    const dayEntries = allEntries.filter(e => e.date === dateStr);
    const counterRef = useRef(0);
    const w = weather[dateStr];
    return (
      <div className={`schedule-day-col${isCompact ? " schedule-day-compact" : ""}`}
        style={{ background: isToday ? "#ecfeff" : isWeekend ? "#fafafa" : "#fff", borderColor: isToday ? accent : "#e5e5e5" }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDragEnter={e => { e.preventDefault(); counterRef.current++; e.currentTarget.classList.add("drag-over"); }}
        onDragLeave={e => { counterRef.current--; if (counterRef.current <= 0) { counterRef.current = 0; e.currentTarget.classList.remove("drag-over"); } }}
        onDrop={e => { counterRef.current = 0; handleDrop(dateStr, e); }}
      >
        <div className="schedule-day-header" style={{ background: isToday ? accent : isPast ? "#e0e0e0" : "#f5f5f5", color: isToday ? "#fff" : isPast ? "#999" : "#333", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{dayName}</span>
            <span style={{ fontSize: isCompact ? 13 : 16, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</span>
          </div>
          {w && !isCompact && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, fontSize: 10, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#bbb" : "#666" }}>
              <span title="Temperature" style={{ fontWeight: 600 }}>{Math.round(w.minTemp)}–{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span title="Chance of rain" style={{ color: isToday ? "rgba(255,255,255,0.85)" : w.rainChance >= 50 ? "#2563eb" : "#888" }}>💧{w.rainChance}%{w.rain > 0 ? ` ${w.rain}mm` : ""}</span>}
            </div>
          )}
          {w && isCompact && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0, fontSize: 9, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#bbb" : "#666" }}>
              <span>{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span>💧{w.rainChance}%</span>}
            </div>
          )}
        </div>
        <div className="schedule-day-body">
          {dayEntries.length === 0 && <div style={{ fontSize: 11, color: "#ccc", textAlign: "center", padding: isCompact ? "6px 0" : "12px 0" }}>—</div>}
          {dayEntries.map(entry => {
            const job = jobs.find(j => j.id === entry.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            return (
              <div key={entry.id} className="schedule-card"
                draggable="true"
                onDragStart={e => {
                  dragEntryRef.current = entry.id;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", entry.id);
                  requestAnimationFrame(() => e.target.classList.add("dragging"));
                }}
                onDragEnd={e => { dragEntryRef.current = null; e.target.classList.remove("dragging"); document.querySelectorAll(".schedule-day-col.drag-over").forEach(el => el.classList.remove("drag-over")); }}
                onClick={() => { if (!dragEntryRef.current) openEdit(entry); }}
                style={{ borderLeft: `3px solid ${isPast ? "#ddd" : accent}` }}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, lineHeight: 1.3 }}>{entry.title || job?.title || "Unknown"}</div>
                {client && <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{client.name}</div>}
                {entry.startTime && <div style={{ fontSize: 10, color: "#aaa" }}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
                {(entry.assignedTo || []).length > 0 && (
                  <div style={{ marginTop: 4 }}><AvatarGroup names={entry.assignedTo} max={2} /></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const WeekRow = ({ label, days, entries: allEntries }) => {
    const weekdays = days.slice(0, 5);
    const weekend = days.slice(5);
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div className="schedule-week-grid">
          {weekdays.map((dateStr, i) => (
            <DayCol key={dateStr} dateStr={dateStr} dayName={DAY_NAMES[i]} allEntries={allEntries} />
          ))}
          <div className="schedule-weekend-stack">
            {weekend.map((dateStr, i) => (
              <DayCol key={dateStr} dateStr={dateStr} dayName={DAY_NAMES[5 + i]} allEntries={allEntries} isCompact />
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Future schedule (weeks 3–8 from current Monday) ──
  const futureWeeks = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(todayMon + "T12:00:00");
    d.setDate(d.getDate() + (i + 2) * 7);
    return d.toISOString().slice(0, 10);
  });

  // Auto-clean: filter out future entries whose weekStart is now this/next week
  const activeFuture = (futureSchedule || []).filter(e => e.weekStart >= futureWeeks[0]);

  const openFutureNew = (weekStart) => {
    setEditFutureEntry(null);
    setFutureMode("edit");
    setFutureForm({ jobId: jobs[0]?.id || "", weekStart, title: "", assignedTo: [], notes: "" });
    setShowFutureModal(true);
  };
  const openFutureEdit = (entry) => {
    setEditFutureEntry(entry);
    setFutureMode("view");
    setFutureForm({ jobId: entry.jobId, weekStart: entry.weekStart, title: entry.title || "", assignedTo: entry.assignedTo || [], notes: entry.notes || "" });
    setShowFutureModal(true);
  };
  const saveFuture = () => {
    const data = { ...futureForm };
    if (editFutureEntry) {
      setFutureSchedule(fs => fs.map(e => e.id === editFutureEntry.id ? { ...editFutureEntry, ...data } : e));
    } else {
      const newId = Math.max(0, ...(futureSchedule || []).map(e => e.id)) + 1;
      setFutureSchedule(fs => [...fs, { id: newId, ...data }]);
    }
    setShowFutureModal(false);
  };
  const delFuture = (id) => {
    setFutureSchedule(fs => fs.filter(e => e.id !== id));
  };

  const formatWeekLabel = (mon) => {
    const d = new Date(mon + "T12:00:00");
    const end = new Date(d); end.setDate(end.getDate() + 6);
    const mShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()} ${mShort[d.getMonth()]} – ${end.getDate()} ${mShort[end.getMonth()]}`;
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, team..." />
        </div>
        <input type="date" className="form-control" style={{ width: "auto" }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        {filterDate && <button className="btn btn-ghost btn-sm" onClick={() => setFilterDate("")} style={{ fontSize: 12 }}>Clear</button>}
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grouped" ? "" : "btn-ghost"}`} style={view === "grouped" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grouped")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: accent }} onClick={openNew}><Icon name="plus" size={14} />Schedule Job</button></div>
      </div>

      {displayed.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No schedule entries{filterDate ? " for this date" : ""}</div></div>
      )}

      {view === "list" && displayed.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Job</th><th>Client</th><th>Assigned</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {displayed.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  return (
                    <tr key={entry.id} onClick={() => openEdit(entry)} style={{ cursor: "pointer" }}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{entry.date}</td>
                      <td>{job?.title || "Unknown Job"}</td>
                      <td style={{ fontSize: 12, color: "#666" }}>{client?.name || "—"}</td>
                      <td>{(entry.assignedTo || []).length > 0 ? <AvatarGroup names={entry.assignedTo} max={3} /> : "—"}</td>
                      <td style={{ fontSize: 12, color: "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.notes || "—"}</td>
                      <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grouped" && (
        <>
          <WeekRow label="This Week" days={thisWeekDays} entries={displayed} />
          <WeekRow label="Next Week" days={nextWeekDays} entries={displayed} />

          {/* Future Schedule — 6 weeks */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Future Schedule</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {futureWeeks.map(weekMon => {
                const weekEntries = activeFuture.filter(e => e.weekStart === weekMon);
                const counterRef = { current: 0 };
                return (
                  <div key={weekMon} className="future-week-col"
                    style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, minHeight: 160, display: "flex", flexDirection: "column", overflow: "hidden", transition: "border-color 0.15s, box-shadow 0.15s" }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDragEnter={e => { e.preventDefault(); counterRef.current++; e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}33`; }}
                    onDragLeave={e => { counterRef.current--; if (counterRef.current <= 0) { counterRef.current = 0; e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; } }}
                    onDrop={e => { e.preventDefault(); counterRef.current = 0; e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; const entryId = dragFutureRef.current; dragFutureRef.current = null; if (!entryId) return; setFutureSchedule(fs => fs.map(x => x.id === entryId ? { ...x, weekStart: weekMon } : x)); }}
                  >
                    <div style={{ background: "#f5f5f5", padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e5e5" }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#888", letterSpacing: "0.04em" }}>Week of</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{formatWeekLabel(weekMon)}</div>
                      </div>
                      <button className="btn btn-ghost btn-xs" style={{ padding: "2px 6px" }} onClick={() => openFutureNew(weekMon)}>
                        <Icon name="plus" size={11} />
                      </button>
                    </div>
                    <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {weekEntries.length === 0 && <div style={{ fontSize: 11, color: "#ccc", textAlign: "center", padding: "16px 0" }}>No plans yet</div>}
                      {weekEntries.map(entry => {
                        const job = jobs.find(j => j.id === entry.jobId);
                        const client = clients.find(c => c.id === job?.clientId);
                        return (
                          <div key={entry.id}
                            draggable="true"
                            onDragStart={e => { dragFutureRef.current = entry.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(entry.id)); requestAnimationFrame(() => e.target.style.opacity = "0.4"); }}
                            onDragEnd={e => { dragFutureRef.current = null; e.target.style.opacity = "1"; document.querySelectorAll('.future-week-col').forEach(el => { el.style.borderColor = "#e5e5e5"; el.style.boxShadow = "none"; }); }}
                            style={{ background: "#f8f8f8", borderRadius: 8, padding: "8px 10px", borderLeft: `3px solid ${accent}`, cursor: "grab" }}
                            onClick={() => { if (!dragFutureRef.current) openFutureEdit(entry); }}>
                            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, lineHeight: 1.3 }}>{entry.title || job?.title || "Unknown"}</div>
                            {client && <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{client.name}</div>}
                            {(entry.assignedTo || []).length > 0 && (
                              <div style={{ marginTop: 3 }}><AvatarGroup names={entry.assignedTo} max={3} /></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {showModal && (() => {
        const schedJobName = jobs.find(j => String(j.id) === String(form.jobId))?.title || "Unknown Job";
        const isNewSched = !editEntry;
        return (
        <SectionDrawer
          accent={SECTION_COLORS.schedule.accent}
          icon={<Icon name="schedule" size={16} />}
          typeLabel="Schedule"
          title={editEntry ? `${form.date} · ${schedJobName}` : "Schedule a Job"}
          mode={schedMode} setMode={setSchedMode}
          showToggle={!isNewSched}
          isNew={isNewSched}
          footer={schedMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.schedule.accent, color: "#fff", border: "none" }} onClick={() => setSchedMode("edit")}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editEntry ? setSchedMode("view") : setShowModal(false)}>{editEntry ? "Cancel" : "Cancel"}</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.schedule.accent, color: "#fff", border: "none" }} onClick={() => { save(); if (editEntry) setSchedMode("view"); }} disabled={!form.jobId || !form.date}>
              <Icon name="check" size={13} /> {isNewSched ? "Add to Schedule" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {schedMode === "view" ? (
            <div style={{ padding: "20px 24px" }}>
              <ViewField label="Job" value={schedJobName} />
              <ViewField label="Date" value={form.date} />
              {(form.assignedTo || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>Assigned To</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {form.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {form.notes && <ViewField label="Notes" value={form.notes} />}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Job *</label>
                <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned To</label>
              <div className="multi-select">
                {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                  <span key={t} className={`multi-option ${form.assignedTo.includes(t) ? "selected" : ""}`}
                    onClick={() => setForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Access instructions, special requirements..." />
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}

      {showFutureModal && (() => {
        const futJobName = jobs.find(j => String(j.id) === String(futureForm.jobId))?.title || "Unknown Job";
        const isNewFuture = !editFutureEntry;
        return (
        <SectionDrawer
          accent={accent}
          icon={<Icon name="schedule" size={16} />}
          typeLabel="Future Plan"
          title={editFutureEntry ? `${futureForm.title || futJobName}` : "Plan Future Week"}
          mode={futureMode} setMode={setFutureMode}
          showToggle={!isNewFuture}
          isNew={isNewFuture}
          footer={futureMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFutureModal(false)}>Close</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" style={{ color: "#c00" }} onClick={() => { delFuture(editFutureEntry.id); setShowFutureModal(false); }}>
                <Icon name="trash" size={13} /> Delete
              </button>
              <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={() => setFutureMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editFutureEntry ? setFutureMode("view") : setShowFutureModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={() => { saveFuture(); if (editFutureEntry) setFutureMode("view"); }} disabled={!futureForm.jobId}>
              <Icon name="check" size={13} /> {isNewFuture ? "Add Plan" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowFutureModal(false)}
        >
          {futureMode === "view" ? (
            <div style={{ padding: "20px 24px" }}>
              <ViewField label="Job" value={futJobName} />
              <ViewField label="Week" value={formatWeekLabel(futureForm.weekStart)} />
              {futureForm.title && <ViewField label="Title" value={futureForm.title} />}
              {(futureForm.assignedTo || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>Assigned To</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {futureForm.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {futureForm.notes && <ViewField label="Notes" value={futureForm.notes} />}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="form-group">
              <label className="form-label">Job *</label>
              <select className="form-control" value={futureForm.jobId} onChange={e => setFutureForm(f => ({ ...f, jobId: e.target.value }))}>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-control" value={futureForm.title} onChange={e => setFutureForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Painting & Touch-ups" />
            </div>
            <div className="form-group">
              <label className="form-label">Week</label>
              <select className="form-control" value={futureForm.weekStart} onChange={e => setFutureForm(f => ({ ...f, weekStart: e.target.value }))}>
                {futureWeeks.map(w => <option key={w} value={w}>{formatWeekLabel(w)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned To</label>
              <div className="multi-select">
                {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                  <span key={t} className={`multi-option ${futureForm.assignedTo.includes(t) ? "selected" : ""}`}
                    onClick={() => setFutureForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={futureForm.notes} onChange={e => setFutureForm(f => ({ ...f, notes: e.target.value }))} placeholder="Planning notes, requirements..." />
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

// ── Quotes ────────────────────────────────────────────────────────────────────
const QUOTE_STATUSES = ["all", "draft", "sent", "accepted", "declined"];
const Quotes = () => {
  const { quotes, setQuotes, jobs, clients, invoices } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editQuote, setEditQuote] = useState(null);
  const [quoteMode, setQuoteMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [view, setView] = useState("list");
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  const filtered = quotes.filter(q => {
    const job = jobs.find(j => j.id === q.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    const query = search.toLowerCase();
    const matchSearch = !search ||
      (q.number || "").toLowerCase().includes(query) ||
      (job?.title || "").toLowerCase().includes(query) ||
      (client?.name || "").toLowerCase().includes(query) ||
      (q.notes || "").toLowerCase().includes(query) ||
      (q.items || []).some(i => (i.description || "").toLowerCase().includes(query)) ||
      String(q.total || "").includes(query);
    const matchStatus = filterStatus === "all" || q.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleSendQuoteEmail = async (q) => {
    const job = jobs.find(j => j.id === q.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    if (!client?.email) { alert("No client email address found. Please add an email to the client record."); return; }
    if (!window.confirm(`Send quote ${q.number} to ${client.name} (${client.email})?`)) return;
    setEmailSending(true); setEmailStatus(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const acceptUrl = q.acceptToken ? `${supabaseUrl}/functions/v1/accept-document?token=${q.acceptToken}&type=quote` : undefined;
      const tpl = templates.find(t => t.type === "quote" && t.isDefault) || templates.find(t => t.type === "quote");
      // Generate PDF
      const pdfHtml = buildQuotePdfHtml({ quote: q, job, client, company: companyInfo, template: tpl, acceptUrl });
      let pdfBase64;
      try { pdfBase64 = await htmlToPdfBase64(pdfHtml, `${q.number}.pdf`); } catch (e) { console.warn("PDF generation failed:", e); }
      const attachments = pdfBase64 ? [{ filename: `${q.number}.pdf`, content: pdfBase64 }] : [];
      await sendEmail("quote", client.email, { ...q, clientName: client.name, jobTitle: job?.title, jobReference: job?.title, acceptUrl }, { attachments });
      setEmailStatus({ type: "success", msg: `Quote sent to ${client.email}` });
      setTimeout(() => setEmailStatus(null), 4000);
    } catch (err) {
      setEmailStatus({ type: "error", msg: err.message || "Failed to send email" });
    } finally { setEmailSending(false); }
  };

  const openNew = () => { setEditQuote(null); setQuoteMode("edit"); setForm({ jobId: jobs[0]?.id || "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" }); setShowModal(true); };
  const openEdit = (q) => { setEditQuote(q); setQuoteMode("view"); setForm(q); setShowModal(true); };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editQuote) {
        const saved = await updateQuote(editQuote.id, data);
        setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
      } else {
        const saved = await createQuote(data);
        setQuotes(qs => [...qs, saved]);
      }
    } catch (err) { console.error('Failed to save quote:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteQuote(id);
      setQuotes(qs => qs.filter(q => q.id !== id));
    } catch (err) { console.error('Failed to delete quote:', err); }
  };
  const duplicate = async (q) => {
    try {
      const saved = await createQuote({ ...q, status: "draft" });
      setQuotes(qs => [...qs, saved]);
    } catch (err) { console.error('Failed to duplicate quote:', err); }
  };

  const quoteStatusColors = { draft: "#888", sent: "#2563eb", accepted: "#16a34a", declined: "#dc2626" };
  const quoteStatusLabels = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
        {Object.entries(quoteStatusLabels).map(([key, label]) => {
          const statusQuotes = quotes.filter(q => q.status === key);
          const count = statusQuotes.length;
          const total = statusQuotes.reduce((s, q) => s + calcQuoteTotal(q), 0);
          const color = quoteStatusColors[key];
          return (
            <div key={key} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}`, cursor: "pointer" }}
              onClick={() => { setFilterStatus(key); setView("list"); }}>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{count}</div>
              <div className="stat-sub">{fmt(total)}</div>
            </div>
          );
        })}
      </div>

      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotes, jobs, clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.quotes.accent }} onClick={openNew}><Icon name="plus" size={14} />New Quote</button></div>
      </div>

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(4, minmax(200px,1fr))" }}>
          {["draft", "sent", "accepted", "declined"].map(col => {
            const colQuotes = filtered.filter(q => q.status === col);
            const labels = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colQuotes.length}</span>
                </div>
                {colQuotes.map(q => {
                  const job = jobs.find(j => j.id === q.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                  return (
                    <div key={q.id} className="kanban-card" onClick={() => openEdit(q)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{q.number}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{job?.title || "—"}</div>
                      <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{client?.name || "—"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(sub * (1 + q.tax / 100))}</span>
                        <span style={{ fontSize: 10, color: "#bbb" }}>{q.createdAt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "grid" && (
        <div className="order-cards-grid">
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">📋</div><div className="empty-state-text">No quotes found</div></div>}
          {filtered.map(q => {
            const job = jobs.find(j => j.id === q.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            const total = calcQuoteTotal(q);
            const lineCount = q.lineItems.length;
            return (
              <div key={q.id} className="order-card" onClick={() => openEdit(q)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: SECTION_COLORS.quotes.light, color: SECTION_COLORS.quotes.accent }}>
                      <Icon name="quotes" size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{q.number}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{q.createdAt}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusBadge status={q.status} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job?.title || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>No job</span>}
                </div>
                {client && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{client.name}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{fmt(total)}</span>
                  <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
                  {q.tax > 0 && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{q.tax}% GST</span>}
                </div>
                <SectionProgressBar status={q.status} section="quotes" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{lineCount} line item{lineCount !== 1 ? "s" : ""}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-xs" onClick={() => duplicate(q)} title="Duplicate"><Icon name="copy" size={12} /></button>
                    <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(q.id)}><Icon name="trash" size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Job</th><th>Client</th><th>Status</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9}><div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No quotes found</div></div></td></tr>}
              {filtered.map(q => {
                const job = jobs.find(j => j.id === q.jobId);
                const client = clients.find(c => c.id === job?.clientId);
                const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                const linkedInv = invoices.filter(i => i.fromQuoteId === q.id);
                return (
                  <tr key={q.id} style={{ cursor: "pointer" }} onClick={() => openEdit(q)}>
                    <td><span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{q.number}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{job?.title}</div>
                      {linkedInv.length > 0 && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>→ {linkedInv.map(i=>i.number).join(", ")}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: "#666" }}>{client?.name}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(sub * q.tax / 100)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(sub * (1 + q.tax / 100))}</td>
                    <td style={{ fontSize: 12, color: "#999" }}>{q.createdAt}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => duplicate(q)} title="Duplicate"><Icon name="copy" size={12} /></button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(q.id)}><Icon name="trash" size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {showModal && (() => {
        const isNewQ = !editQuote;
        const qJob = jobs.find(j => String(j.id) === String(form.jobId));
        const qClient = clients.find(c => c.id === qJob?.clientId);
        const qSub = (form.lineItems || []).reduce((s, l) => s + l.qty * l.rate, 0);
        const qTax = qSub * (form.tax || 10) / 100;
        const qTotal = qSub + qTax;
        return (
        <SectionDrawer
          accent={SECTION_COLORS.quotes.accent}
          icon={<Icon name="quotes" size={16} />}
          typeLabel="Quote"
          title={editQuote ? editQuote.number : "New Quote"}
          statusBadge={editQuote ? <StatusBadge status={form.status} /> : null}
          mode={quoteMode} setMode={setQuoteMode}
          showToggle={!isNewQ}
          isNew={isNewQ}
          footer={quoteMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} disabled={emailSending} onClick={() => handleSendQuoteEmail(form)}>
                <Icon name="send" size={13} /> {emailSending ? "Sending..." : "Send to Client"}
              </button>
              <button className="btn btn-sm" style={{ background: SECTION_COLORS.quotes.accent, color: "#fff", border: "none" }} onClick={() => setQuoteMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editQuote ? setQuoteMode("view") : setShowModal(false)}>{editQuote ? "Cancel" : "Cancel"}</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.quotes.accent, color: "#fff", border: "none" }} onClick={() => { save(); if (editQuote) setQuoteMode("view"); }}>
              <Icon name="check" size={13} /> {isNewQ ? "Create Quote" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {quoteMode === "view" ? (
            <div style={{ padding: "20px 24px" }}>
              {emailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, background: emailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: emailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${emailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{emailStatus.msg}</div>}
              <div className="grid-2">
                <ViewField label="Job" value={qJob?.title} />
                <ViewField label="Client" value={qClient?.name} />
              </div>
              <ViewField label="Status" value={form.status?.charAt(0).toUpperCase() + form.status?.slice(1)} />
              <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Line Items</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr><th style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", borderBottom: "1px solid #f0f0f0" }}>Description</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#999", borderBottom: "1px solid #f0f0f0" }}>Qty</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#999", borderBottom: "1px solid #f0f0f0" }}>Rate</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#999", borderBottom: "1px solid #f0f0f0" }}>Total</th></tr></thead>
                  <tbody>
                    {(form.lineItems || []).map((l, i) => (
                      <tr key={i}><td style={{ padding: "8px" }}>{l.desc || "—"}</td><td style={{ textAlign: "right", padding: "8px" }}>{l.qty} {l.unit}</td><td style={{ textAlign: "right", padding: "8px" }}>{fmt(l.rate)}</td><td style={{ textAlign: "right", padding: "8px", fontWeight: 600 }}>{fmt(l.qty * l.rate)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="totals-box" style={{ marginLeft: "auto", maxWidth: 260 }}>
                <div className="totals-row"><span>Subtotal</span><span>{fmt(qSub)}</span></div>
                <div className="totals-row"><span>GST ({form.tax}%)</span><span>{fmt(qTax)}</span></div>
                <div className="totals-row total"><span>Total</span><span>{fmt(qTotal)}</span></div>
              </div>
              {form.notes && <div style={{ marginTop: 16 }}><ViewField label="Notes / Terms" value={form.notes} /></div>}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Job</label>
                <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","sent","accepted","declined"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Line Items</label>
              <LineItemsEditor items={form.lineItems} onChange={items => setForm(f => ({ ...f, lineItems: items }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes / Terms</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, inclusions/exclusions, validity period..." />
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

// ── Time Tracking ─────────────────────────────────────────────────────────────

// Hour presets matching the reference timesheet app
const TIME_PRESETS = [
  { label:"30m", mins:30 }, { label:"1h", mins:60 }, { label:"1.5h", mins:90 },
  { label:"2h", mins:120 }, { label:"2.5h", mins:150 }, { label:"3h", mins:180 },
  { label:"3.5h", mins:210 }, { label:"4h", mins:240 }, { label:"4.5h", mins:270 },
  { label:"5h", mins:300 }, { label:"5.5h", mins:330 }, { label:"6h", mins:360 },
  { label:"6.5h", mins:390 }, { label:"7h", mins:420 }, { label:"8h", mins:480 },
];

// Colour thresholds per day
const DAY_THR = { orange: 4, green: 6 };


function dayColour(hours) {
  if (hours === 0) return "#ccc";
  if (hours >= DAY_THR.green) return "#27ae60";
  if (hours >= DAY_THR.orange) return "#e67e22";
  return "#e74c3c";
}

// ── Log Time Modal ────────────────────────────────────────────────────────────
const LogTimeModal = ({ jobs, onSave, onClose, editEntry = null, staff }) => {
  const auth = useAuth();
  const staffNames = (staff && staff.length > 0) ? staff.map(s => s.name) : TEAM;
  const isStaffRole = !auth.isAdmin && !auth.isLocalDev;
  const defaultWorker = isStaffRole ? auth.currentUserName : (staffNames[0] || "");
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => {
    if (editEntry) return {
      jobId: String(editEntry.jobId),
      worker: editEntry.worker,
      date: editEntry.date,
      startTime: editEntry.startTime || "09:00",
      endTime: editEntry.endTime || addMinsToTime("09:00", editEntry.hours * 60),
      description: editEntry.description,
      billable: editEntry.billable,
    };
    return { jobId: String(jobs[0]?.id || ""), worker: defaultWorker, date: today, startTime: "", endTime: "", description: "", billable: true };
  });
  const isNewTime = !editEntry;
  const [mode, setMode] = useState(isNewTime ? "edit" : "view");
  const [activePreset, setActivePreset] = useState(null);
  const [endTouched, setEndTouched] = useState(!!editEntry);

  const hours = calcHoursFromTimes(form.startTime, form.endTime);

  const onStartChange = (val) => {
    setForm(f => {
      const next = { ...f, startTime: val };
      if (!endTouched && val) next.endTime = addMinsToTime(val, 60);
      return next;
    });
    setActivePreset(null);
  };

  const applyPreset = (mins, label) => {
    const start = form.startTime || "09:00";
    setForm(f => ({ ...f, startTime: start, endTime: addMinsToTime(start, mins) }));
    setActivePreset(label);
    setEndTouched(true);
  };

  const save = () => {
    if (!form.startTime || !form.endTime) return;
    if (hours <= 0) return;
    if (!form.jobId) return;
    onSave({
      ...form,
      jobId: form.jobId,
      hours,
    });
    if (!isNewTime) setMode("view");
  };

  const jobName = jobs.find(j => String(j.id) === String(form.jobId))?.title || "Time Entry";

  return (
    <SectionDrawer
      accent={SECTION_COLORS.time.accent}
      icon={<Icon name="time" size={16} />}
      typeLabel="Time Entry"
      title={editEntry ? `${form.date} · ${jobName}` : "Log Time"}
      mode={mode} setMode={setMode}
      showToggle={!isNewTime}
      isNew={isNewTime}
      footer={mode === "view" ? <>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.time.accent, color: "#fff", border: "none" }} onClick={() => setMode("edit")}>
          <Icon name="edit" size={13} /> Edit
        </button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => editEntry ? setMode("view") : onClose()}>{editEntry ? "Cancel" : "Cancel"}</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.time.accent, color: "#fff", border: "none" }} onClick={save} disabled={hours <= 0 || !form.jobId}>
          <Icon name="check" size={13} /> {isNewTime ? "Log Time" : "Save Changes"}
        </button>
      </>}
      onClose={onClose}
    >
      {mode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div className="grid-2">
            <ViewField label="Job" value={jobName} />
            <ViewField label="Worker" value={form.worker} />
          </div>
          <ViewField label="Date" value={form.date} />
          <div className="grid-2">
            <ViewField label="Start Time" value={form.startTime} />
            <ViewField label="End Time" value={form.endTime} />
          </div>
          <div style={{ textAlign: "center", padding: "12px 16px", background: SECTION_COLORS.time.light, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", color: SECTION_COLORS.time.accent, lineHeight: 1 }}>
              {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
            </div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>hours logged</div>
          </div>
          {form.description && <ViewField label="Description" value={form.description} />}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: form.billable ? "#ecfdf5" : "#f5f5f5", color: form.billable ? "#059669" : "#888" }}>
            {form.billable ? "Billable" : "Non-billable"}
          </div>
        </div>
      ) : (
      <div style={{ padding: "20px 24px" }}>
        {/* Job + Worker */}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Job</label>
            <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Worker</label>
            {isStaffRole ? (
              <input className="form-control" value={auth.currentUserName} disabled style={{ background: "#f5f5f5" }} />
            ) : (
              <select className="form-control" value={form.worker} onChange={e => setForm(f => ({ ...f, worker: e.target.value }))}>
                {staffNames.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Date */}
        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" className="form-control" value={form.date} max={today} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>

        {/* Start / End */}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input type="time" className="form-control" value={form.startTime}
              onChange={e => onStartChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Time</label>
            <input type="time" className="form-control" value={form.endTime}
              onChange={e => { setEndTouched(true); setForm(f => ({ ...f, endTime: e.target.value })); setActivePreset(null); }} />
          </div>
        </div>

        {/* Hours display */}
        <div style={{ textAlign: "center", padding: "12px 16px", background: SECTION_COLORS.time.light, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", color: hours > 0 ? SECTION_COLORS.time.accent : "#ccc", lineHeight: 1 }}>
            {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
          </div>
          <div style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>hours logged</div>
        </div>

        {/* Quick-select presets */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Quick Select</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 16 }}>
          {TIME_PRESETS.map(p => (
            <button key={p.label}
              onClick={() => applyPreset(p.mins, p.label)}
              style={{
                padding: "7px 4px", borderRadius: 20, fontSize: 12, fontWeight: 600, textAlign: "center",
                border: activePreset === p.label ? `2px solid ${SECTION_COLORS.time.accent}` : "2px solid #e0e0e0",
                background: activePreset === p.label ? SECTION_COLORS.time.accent : "#f5f5f5",
                color: activePreset === p.label ? "#fff" : "#555",
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-control" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What was done on this job?" />
        </div>

        {/* Billable */}
        <label className="checkbox-label">
          <input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} />
          <span>Billable to client</span>
        </label>
      </div>
      )}
    </SectionDrawer>
  );
};

// ── Mini calendar ─────────────────────────────────────────────────────────────
const TimeCalendar = ({ timeEntries, selectedWorker, onDayClick, calMonth, setCalMonth }) => {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + calMonth, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const today = new Date().toISOString().slice(0, 10);
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = viewDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  // Build day→hours map
  const dayHrs = {};
  timeEntries
    .filter(t => !selectedWorker || t.worker === selectedWorker)
    .filter(t => t.date.startsWith(monthStr))
    .forEach(t => { dayHrs[t.date] = (dayHrs[t.date] || 0) + t.hours; });

  const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthStr}-${String(d).padStart(2,"0")}`;
    const hrs = dayHrs[iso] || 0;
    const isFuture = iso > today;
    const isToday = iso === today;
    const clr = dayColour(hrs);
    cells.push(
      <div key={iso}
        onClick={() => hrs > 0 && onDayClick(iso)}
        style={{
          background: "#fff", borderRadius: 8, padding: "6px 4px", minHeight: 48, textAlign: "center",
          boxShadow: isToday ? "0 0 0 2px #111" : "0 1px 4px rgba(0,0,0,0.06)",
          opacity: isFuture ? 0.4 : 1,
          cursor: hrs > 0 ? "pointer" : "default",
          transition: "box-shadow 0.15s",
        }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#999", marginBottom: 3 }}>{d}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: hrs > 0 ? clr : "#ddd", lineHeight: 1 }}>
          {hrs > 0 ? `${hrs.toFixed(1)}h` : "·"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setCalMonth(m => m - 1)} style={{ padding: "4px 10px", fontSize: 18 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{monthLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setCalMonth(m => m + 1)} style={{ padding: "4px 10px", fontSize: 18 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 6 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0" }}>{d}</div>)}
        {cells}
      </div>
    </div>
  );
};

// ── Week strip ────────────────────────────────────────────────────────────────
const WeekStrip = ({ timeEntries, selectedWorker, weekOffset, setWeekOffset, selectedDay, setSelectedDay }) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const weekLabel = `${days[0].toLocaleDateString("en-AU", { day:"numeric", month:"short" })} – ${days[6].toLocaleDateString("en-AU", { day:"numeric", month:"short" })}`;

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "12px 16px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)} style={{ fontSize: 20, padding: "2px 10px" }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>{weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)} style={{ fontSize: 20, padding: "2px 10px" }}>›</button>
      </div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 1 }}>
        {days.map(d => {
          const iso = d.toISOString().slice(0, 10);
          const hrs = timeEntries
            .filter(t => t.date === iso && (!selectedWorker || t.worker === selectedWorker))
            .reduce((s, t) => s + t.hours, 0);
          const isToday = iso === today;
          const isPast = iso <= today;
          const isActive = iso === selectedDay;
          const clr = isPast && hrs === 0 ? "#e74c3c" : dayColour(hrs);
          const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          return (
            <div key={iso}
              onClick={() => setSelectedDay(iso)}
              style={{
                flex: 1, minWidth: 40, textAlign: "center", padding: "8px 2px 10px",
                borderRadius: "8px 8px 0 0", cursor: "pointer",
                background: isActive ? "#f5f5f5" : "transparent",
                borderBottom: isActive ? "3px solid #111" : "3px solid transparent",
                transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: isActive ? "#111" : "#aaa", marginBottom: 3 }}>
                {DAYS[d.getDay()]}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#111" : "#444", marginBottom: 2 }}>{d.getDate()}</div>
              <div style={{ fontSize: 10, fontWeight: 700, height: 14, color: hrs > 0 || isPast ? clr : "transparent" }}>
                {hrs > 0 ? `${hrs.toFixed(1)}h` : isPast ? "" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main TimeTracking component ───────────────────────────────────────────────
const TimeTracking = () => {
  const { timeEntries, setTimeEntries, jobs, setJobs, clients, staff } = useAppStore();
  const auth = useAuth();
  const isOwn = (entry) => entry.worker === auth.currentUserName;
  const canEditEntry = (entry) => auth.isAdmin || auth.isLocalDev || isOwn(entry);
  const canDeleteEntry = (entry) => auth.isAdmin || auth.isLocalDev || isOwn(entry);
  const today = new Date().toISOString().slice(0, 10);
  const [tsTab, setTsTab] = useState("week");           // "week" | "team" | "calendar"
  const [selectedWorker, setSelectedWorker] = useState("all");
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calMonth, setCalMonth] = useState(0);
  const [showLogModal, setShowLogModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [calDrillDay, setCalDrillDay] = useState(null);
  const [search, setSearch] = useState("");

  // Stats — filtered to selected worker and search
  const searchFilter = (t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const job = jobs.find(j => j.id === t.jobId);
    const client = job ? clients.find(c => c.id === job.clientId) : null;
    return (t.description || "").toLowerCase().includes(q) ||
      (t.worker || "").toLowerCase().includes(q) ||
      (job?.title || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (t.date || "").includes(q);
  };
  const workerEntries = (selectedWorker === "all" ? timeEntries : timeEntries.filter(t => t.worker === selectedWorker)).filter(searchFilter);
  const now = new Date();
  const todayHrs   = workerEntries.filter(t => t.date === today).reduce((s,t) => s+t.hours, 0);
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monISO = (() => { const d = new Date(now); d.setDate(now.getDate() - dow); return d.toISOString().slice(0,10); })();
  const weekHrs  = workerEntries.filter(t => t.date >= monISO).reduce((s,t) => s+t.hours, 0);
  const monthHrs = workerEntries.filter(t => t.date.startsWith(today.slice(0,7))).reduce((s,t) => s+t.hours, 0);

  // Day entries for week view
  const dayEntries = timeEntries
    .filter(t => t.date === selectedDay && (selectedWorker === "all" || t.worker === selectedWorker))
    .filter(searchFilter)
    .sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));

  const saveEntry = async (data) => {
    try {
      const staffMember = staff ? staff.find(s => s.name === data.worker) : null;
      const staffId = staffMember?.id;
      if (editEntry) {
        const saved = await updateTimeEntry(editEntry.id, data, staffId);
        setTimeEntries(ts => ts.map(t => t.id === editEntry.id ? saved : t));
        setJobs && setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `${data.worker} updated time entry (${data.hours}h)`) } : j));
      } else {
        const saved = await createTimeEntry(data, staffId);
        setTimeEntries(ts => [...ts, saved]);
        setJobs && setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `${data.worker} logged ${data.hours}h`) } : j));
      }
    } catch (err) { console.error('Failed to save time entry:', err); }
    setShowLogModal(false);
    setEditEntry(null);
  };

  const del = async (id) => {
    try {
      await deleteTimeEntry(id);
      setTimeEntries(ts => ts.filter(t => t.id !== id));
    } catch (err) { console.error('Failed to delete time entry:', err); }
  };
  const openEdit = (entry) => { setEditEntry(entry); setShowLogModal(true); };
  const openNew = () => { setEditEntry(null); setShowLogModal(true); };

  // Team summary — derive worker list from staff prop (or fall back to unique names in entries)
  const staffNames = (staff && staff.length > 0) ? staff.map(s => s.name) : [...new Set(timeEntries.map(t => t.worker).filter(Boolean))];
  const byWorker = staffNames.map(w => {
    const wEntries = timeEntries.filter(t => t.worker === w);
    return {
      name: w,
      total: wEntries.reduce((s,t) => s+t.hours, 0),
      today: wEntries.filter(t => t.date === today).reduce((s,t) => s+t.hours, 0),
      week: wEntries.filter(t => t.date >= monISO).reduce((s,t) => s+t.hours, 0),
      billable: wEntries.filter(t => t.billable).reduce((s,t) => s+t.hours, 0),
      count: wEntries.length,
    };
  }).filter(w => w.total > 0).sort((a,b) => b.total - a.total);

  const statClr = (h, o, g) => h >= g ? "#27ae60" : h >= o ? "#e67e22" : h > 0 ? "#e74c3c" : "#aaa";

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Today", val: todayHrs, o: DAY_THR.orange, g: DAY_THR.green },
          { label: "This Week", val: weekHrs, o: DAY_THR.orange * 5, g: DAY_THR.green * 5 },
          { label: "This Month", val: monthHrs, o: DAY_THR.orange * 20, g: DAY_THR.green * 20 },
        ].map(s => {
          const color = statClr(s.val, s.o, s.g);
          return (
            <div key={s.label} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}` }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{s.val.toFixed(1)}h</div>
              <div className="stat-sub">{s.val > 0 ? `${(s.val / s.g * 100).toFixed(0)}% of target` : "No hours logged"}</div>
            </div>
          );
        })}
      </div>
      {/* Controls row */}
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries, jobs..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}>
          <option value="all">All Team</option>
          {staffNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="section-action-btns"><button className="btn btn-primary" onClick={openNew} style={{ whiteSpace: "nowrap", background: SECTION_COLORS.time.accent }}><Icon name="plus" size={14} />Log Time</button></div>
      </div>

      {/* Sub-tabs */}
      <div className="tabs" style={{ marginBottom: 0 }}>
        {[["week","Week View"],["team","Team"],["calendar","Calendar"]].map(([id,label]) => (
          <div key={id} className={`tab ${tsTab === id ? "active" : ""}`} onClick={() => setTsTab(id)}>{label}</div>
        ))}
      </div>

      {/* ── Week View ── */}
      {tsTab === "week" && (
        <div style={{ background: "#fafafa", borderRadius: "0 0 10px 10px", border: "1px solid #e8e8e8", borderTop: "none", marginBottom: 20 }}>
          <WeekStrip timeEntries={timeEntries} selectedWorker={selectedWorker === "all" ? null : selectedWorker}
            weekOffset={weekOffset} setWeekOffset={setWeekOffset}
            selectedDay={selectedDay} setSelectedDay={setSelectedDay} />

          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}
              <span style={{ color: dayColour(dayEntries.reduce((s,t) => s+t.hours, 0)) }}>
                {dayEntries.reduce((s,t) => s+t.hours, 0).toFixed(1)}h
              </span>
            </div>

            {dayEntries.length === 0 ? (
              <div className="empty-state" style={{ padding: "28px 0" }}>
                <div className="empty-state-icon">⏱</div>
                <div className="empty-state-text">No entries for this day</div>
                <div className="empty-state-sub">Click "Log Time" to add one</div>
              </div>
            ) : (
              dayEntries.map(entry => {
                const job = jobs.find(j => j.id === entry.jobId);
                const clr = dayColour(entry.hours);
                return (
                  <div key={entry.id} onClick={() => canEditEntry(entry) ? openEdit(entry) : null} style={{
                    background: "#fff", borderRadius: 10, padding: 14, marginBottom: 10,
                    border: "1px solid #e8e8e8", borderLeft: `4px solid ${clr}`,
                    display: "flex", gap: 14, alignItems: "flex-start", cursor: canEditEntry(entry) ? "pointer" : "default", transition: "border-color 0.15s",
                  }}>
                    <div style={{ minWidth: 56, textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: clr, lineHeight: 1 }}>{entry.hours.toFixed(1)}h</div>
                      {entry.startTime && <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{entry.startTime}–{entry.endTime}</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <div className="avatar" style={{ width: 22, height: 22, fontSize: 9, margin: 0, flexShrink: 0 }}>
                          {entry.worker.split(" ").map(w=>w[0]).join("")}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{entry.worker}</span>
                        <span className="badge" style={{ background: entry.billable ? "#111" : "#f0f0f0", color: entry.billable ? "#fff" : "#999", fontSize: 10 }}>
                          {entry.billable ? "Billable" : "Non-bill"}
                        </span>
                      </div>
                      {job && <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>{job.title}</div>}
                      {entry.description && <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{entry.description}</div>}
                    </div>
                    {canDeleteEntry(entry) && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>
                    </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Team View ── */}
      {tsTab === "team" && (
        <div style={{ marginTop: 16 }}>
          {byWorker.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">No time logged yet</div></div>
          ) : (
            byWorker.map(w => (
              <div key={w.name} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="avatar" style={{ width: 36, height: 36, fontSize: 13, margin: 0 }}>{w.name.split(" ").map(p=>p[0]).join("")}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{w.count} entries</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: dayColour(w.total / 20) }}>{w.total.toFixed(1)}h</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>all time</div>
                  </div>
                </div>
                <div className="time-team-stats">
                  {[
                    { label: "Today", val: w.today, clr: dayColour(w.today) },
                    { label: "This Week", val: w.week, clr: dayColour(w.week / 5) },
                    { label: "Billable", val: w.billable, clr: "#27ae60" },
                    { label: "Non-Bill", val: w.total - w.billable, clr: "#e67e22" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "#f8f8f8", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.clr }}>{s.val.toFixed(1)}h</div>
                      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div className="progress-fill" style={{ width: `${(w.billable / (w.total || 1)) * 100}%`, background: "#27ae60" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
                    {w.total > 0 ? Math.round((w.billable/w.total)*100) : 0}% billable
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Calendar View ── */}
      {tsTab === "calendar" && (
        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <TimeCalendar
              timeEntries={timeEntries}
              selectedWorker={selectedWorker === "all" ? null : selectedWorker}
              calMonth={calMonth} setCalMonth={setCalMonth}
              onDayClick={(iso) => setCalDrillDay(calDrillDay === iso ? null : iso)}
            />
            {/* Colour legend */}
            <div style={{ display: "flex", gap: 14, marginTop: 10, justifyContent: "center" }}>
              {[["#e74c3c",`< ${DAY_THR.orange}h`],["#e67e22",`${DAY_THR.orange}–${DAY_THR.green}h`],["#27ae60",`≥ ${DAY_THR.green}h`]].map(([c,l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Day drill-down */}
          {calDrillDay && (() => {
            const dayE = timeEntries
              .filter(t => t.date === calDrillDay && (selectedWorker === "all" || t.worker === selectedWorker))
              .sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));
            const dayTotal = dayE.reduce((s,t)=>s+t.hours, 0);
            const d = new Date(calDrillDay + "T12:00:00");
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {d.toLocaleDateString("en-AU", { weekday:"long", day:"numeric", month:"long" })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: dayColour(dayTotal) }}>{dayTotal.toFixed(1)}h</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => setCalDrillDay(null)}>✕</button>
                  </div>
                </div>
                {dayE.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: 20 }}>No entries</div>
                ) : dayE.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  return (
                    <div key={entry.id} style={{ background: "#fff", border: "1px solid #e8e8e8", borderLeft: `4px solid ${dayColour(entry.hours)}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: dayColour(entry.hours), minWidth: 44 }}>{entry.hours.toFixed(1)}h</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.worker}</div>
                        {job && <div style={{ fontSize: 12, color: "#888" }}>{job.title}</div>}
                        {entry.description && <div style={{ fontSize: 11, color: "#aaa" }}>{entry.description}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {canEditEntry(entry) && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(entry)}><Icon name="edit" size={12} /></button>}
                        {canDeleteEntry(entry) && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Log / Edit modal */}
      {showLogModal && (
        <LogTimeModal
          jobs={jobs}
          editEntry={editEntry}
          onSave={saveEntry}
          onClose={() => { setShowLogModal(false); setEditEntry(null); }}
          staff={staff}
        />
      )}
    </div>
  );
};

// ── Bills ─────────────────────────────────────────────────────────────────────
// Bills module: two-stage pipeline  Inbox → Linked → Approved → Posted
// "Inbox"  = receipt captured, no job assigned yet
// "Linked" = bill matched to a job, pending approval
// "Approved" = manager has signed off, ready to post as job cost
// "Posted" = converted to an approved cost entry on the job


// ── Post to Job Modal ─────────────────────────────────────────────────────────
const PostToJobModal = ({ bill, jobs, onPost, onClose }) => {
  const [jobId, setJobId]     = useState(bill.jobId ? String(bill.jobId) : "");
  const [category, setCategory] = useState(bill.category || "Materials");
  const [markup, setMarkup]   = useState(bill.markup || 0);

  const exGst = bill.hasGst ? bill.amount / 1.1 : bill.amount;
  const withMarkup = exGst * (1 + (parseFloat(markup) || 0) / 100);

  return (
    <SectionDrawer
      accent={SECTION_COLORS.bills.accent}
      icon={<Icon name="bills" size={16} />}
      typeLabel="Post to Job"
      title={bill.supplier}
      mode="edit" setMode={() => {}}
      showToggle={false}
      footer={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.bills.accent, color: "#fff", border: "none" }} onClick={() => onPost(jobId, category, parseFloat(markup)||0)} disabled={!jobId}>
          <Icon name="check" size={13} /> Post to Job
        </button>
      </>}
      onClose={onClose}
      zIndex={1060}
    >
      <div style={{ padding: "20px 24px" }}>
        <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{bill.supplier}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{bill.invoiceNo && `${bill.invoiceNo} · `}{bill.description}</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{fmt(bill.amount)} <span style={{ fontSize: 11, fontWeight: 400, color: "#aaa" }}>inc. GST</span></div>
        </div>

        <div className="form-group">
          <label className="form-label">Post to Job *</label>
          <select className="form-control" value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Cost Category</label>
          <select className="form-control" value={category} onChange={e => setCategory(e.target.value)}>
            {BILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Markup %</label>
          <div style={{ position: "relative" }}>
            <input type="number" className="form-control" style={{ paddingRight: 32 }} value={markup}
              onChange={e => setMarkup(e.target.value)} min="0" max="200" placeholder="0" />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>%</span>
          </div>
        </div>

        {/* Cost summary */}
        <div style={{ background: "#111", color: "#fff", borderRadius: 8, padding: "14px 16px", marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#666", marginBottom: 10 }}>Cost Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Ex-GST cost</span><span>{fmt(exGst)}</span>
            </div>
            {parseFloat(markup) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Markup ({markup}%)</span><span>+ {fmt(exGst * (parseFloat(markup)||0) / 100)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #2a2a2a", paddingTop: 6, marginTop: 2, fontWeight: 800, fontSize: 15 }}>
              <span>On-charge to client</span><span>{fmt(withMarkup)}</span>
            </div>
          </div>
        </div>
      </div>
    </SectionDrawer>
  );
};

// ── Main Bills Component ───────────────────────────────────────────────────────
const Bills = () => {
  const { bills, setBills, jobs, setJobs, clients } = useAppStore();
  const auth = useAuth();
  const canApprove = auth.isAdmin || auth.isLocalDev;
  const canDelete = auth.isAdmin || auth.isLocalDev;
  const [tab, setTab] = useState("kanban");
  const [showBillModal, setShowBillModal] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [postBill, setPostBill] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterJob, setFilterJob] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  // ── Stats
  const inbox    = bills.filter(b => b.status === "inbox");
  const linked   = bills.filter(b => b.status === "linked");
  const approved = bills.filter(b => b.status === "approved");
  const posted   = bills.filter(b => b.status === "posted");
  const totalAll = bills.reduce((s,b) => s + (b.amount||0), 0);
  const totalPending = [...inbox, ...linked, ...approved].reduce((s,b) => s + (b.amount||0), 0);
  const totalPosted  = posted.reduce((s,b) => s + (b.amount||0), 0);

  // ── Filtered list view
  const filtered = bills.filter(b => {
    const job = jobs.find(j => j.id === b.jobId);
    const q = search.toLowerCase();
    const matchSearch = !search ||
      b.supplier.toLowerCase().includes(q) ||
      (b.invoiceNo||"").toLowerCase().includes(q) ||
      (b.description||"").toLowerCase().includes(q) ||
      (job?.title||"").toLowerCase().includes(q) ||
      (b.notes||"").toLowerCase().includes(q) ||
      (b.category||"").toLowerCase().includes(q) ||
      (b.lineItems || []).some(i => (i.description || "").toLowerCase().includes(q)) ||
      String(b.amount || "").includes(q);
    const matchStatus   = filterStatus === "all"   || b.status === filterStatus;
    const matchCategory = filterCategory === "all" || b.category === filterCategory;
    const matchJob      = filterJob === "all"      || String(b.jobId) === filterJob;
    return matchSearch && matchStatus && matchCategory && matchJob;
  });

  // ── Actions
  const openNew  = () => { setEditBill(null); setShowBillModal(true); };
  const openEdit = (b) => { setEditBill(b); setShowBillModal(true); };

  const saveBill = async (data) => {
    try {
      if (editBill) {
        const saved = await updateBill(editBill.id, data);
        setBills(bs => bs.map(b => b.id === editBill.id ? saved : b));
      } else {
        const saved = await createBill(data);
        setBills(bs => [...bs, saved]);
        if (data.jobId) {
          setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `Bill captured: ${data.supplier} ${fmt(data.amount)}`) } : j));
        }
      }
    } catch (err) { console.error('Failed to save bill:', err); }
    setShowBillModal(false);
  };

  const del = async (id) => {
    try {
      await deleteBill(id);
      setBills(bs => bs.filter(b => b.id !== id));
    } catch (err) { console.error('Failed to delete bill:', err); }
  };

  const setStatus = async (id, status) => {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    try {
      const saved = await updateBill(id, { ...bill, status });
      setBills(bs => bs.map(b => b.id === saved.id ? saved : b));
      // Auto-sync to Xero when bill is approved or posted
      if ((status === "approved" || status === "posted") && !saved.xeroBillId) {
        xeroSyncBill("push", id).catch(() => {});
      }
    } catch (err) { console.error('Failed to update bill status:', err); }
  };

  const approveSelected = async () => {
    try {
      const toApprove = bills.filter(b => selectedIds.includes(b.id) && (b.status === "inbox" || b.status === "linked"));
      await Promise.all(toApprove.map(b => updateBill(b.id, { ...b, status: "approved" })));
      setBills(bs => bs.map(b => selectedIds.includes(b.id) && (b.status === "inbox" || b.status === "linked") ? { ...b, status: "approved" } : b));
      setSelectedIds([]);
    } catch (err) { console.error('Failed to approve bills:', err); }
  };

  const handlePost = async (billId, jobId, category, markup) => {
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;
    const exGst = bill.hasGst ? bill.amount / 1.1 : bill.amount;
    const onCharge = exGst * (1 + markup / 100);
    try {
      const saved = await updateBill(billId, { ...bill, status: "posted", jobId, category, markup });
      setBills(bs => bs.map(b => b.id === billId ? saved : b));
      setJobs(js => js.map(j => j.id === jobId ? { ...j, activityLog: addLog(j.activityLog, `Bill posted: ${bill.supplier} ${fmt(onCharge)} (ex-GST + ${markup}% markup)`) } : j));
      // Auto-sync to Xero
      if (!saved.xeroBillId) {
        xeroSyncBill("push", billId).catch(() => {});
      }
    } catch (err) { console.error('Failed to post bill:', err); }
    setPostBill(null);
  };

  const toggleSelect = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelectedIds(s => s.length === filtered.length ? [] : filtered.map(b => b.id));

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Inbox",    count: inbox.length,    total: inbox.reduce((s,b)=>s+b.amount,0),    color: "#888" },
          { label: "Linked",   count: linked.length,   total: linked.reduce((s,b)=>s+b.amount,0),   color: "#2c5fa8" },
          { label: "Approved", count: approved.length, total: approved.reduce((s,b)=>s+b.amount,0), color: "#1e7e34" },
          { label: "Posted",   count: posted.length,   total: posted.reduce((s,b)=>s+b.amount,0),   color: "#111" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${s.color}`, cursor: "pointer" }}
            onClick={() => { setFilterStatus(s.label.toLowerCase()); setTab("list"); }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22, color: s.color }}>{s.count}</div>
            <div className="stat-sub">{fmt(s.total)}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar */}
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier, invoice, description…" />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {BILL_STATUSES.map(s => <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>)}
        </select>
        <select className="form-control" style={{ width: "auto" }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${tab === "list" ? "" : "btn-ghost"}`} style={tab === "list" ? { background: SECTION_COLORS.bills.accent, color: '#fff' } : undefined} onClick={() => setTab("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${tab === "grid" ? "" : "btn-ghost"}`} style={tab === "grid" ? { background: SECTION_COLORS.bills.accent, color: '#fff' } : undefined} onClick={() => setTab("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${tab === "kanban" ? "" : "btn-ghost"}`} style={tab === "kanban" ? { background: SECTION_COLORS.bills.accent, color: '#fff' } : undefined} onClick={() => setTab("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns">
          {canApprove && selectedIds.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={approveSelected}>
              <Icon name="check" size={12} />Approve {selectedIds.length}
            </button>
          )}
          <button className="btn btn-primary" style={{ background: SECTION_COLORS.bills.accent }} onClick={openNew}><Icon name="plus" size={14} />Capture Bill</button>
        </div>
      </div>

      {/* ══ GRID VIEW ══ */}
      {tab === "grid" && (
        <div className="order-cards-grid">
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills found</div></div>}
          {filtered.map(b => {
            const job = jobs.find(j => j.id === b.jobId);
            const sc = BILL_STATUS_COLORS[b.status];
            return (
              <div key={b.id} className="order-card" onClick={() => openEdit(b)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: SECTION_COLORS.bills.light, color: SECTION_COLORS.bills.accent }}>
                      <Icon name="bills" size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier}</div>
                      {b.invoiceNo && <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{b.invoiceNo}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: sc.bg, color: sc.text }}>{BILL_STATUS_LABELS[b.status]}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.description || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>No description</span>}
                </div>
                {job && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><Icon name="jobs" size={10} /> {job.title}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{fmt(b.amount)}</span>
                  <span className="chip" style={{ fontSize: 10 }}>{b.category}</span>
                  {b.hasGst && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>incl. GST</span>}
                </div>
                <SectionProgressBar status={b.status} section="bills" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{b.date}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    {b.status === "inbox" && <button className="btn btn-secondary btn-xs" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}>Link →</button>}
                    {canApprove && b.status === "linked" && <button className="btn btn-secondary btn-xs" style={{ color: "#1e7e34" }} onClick={() => setStatus(b.id, "approved")}>✓</button>}
                    {canApprove && b.status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setPostBill(b)}>Post →</button>}
                    {canDelete && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={12} /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ KANBAN VIEW ══ */}
      {tab === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(4, minmax(200px,1fr))" }}>
          {BILL_STATUSES.map(status => {
            const stageBills = filtered.filter(b => b.status === status);
            const sc = BILL_STATUS_COLORS[status];
            return (
              <div key={status} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{BILL_STATUS_LABELS[status]}</span>
                  <span style={{ background: sc.bg, color: sc.text, borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{stageBills.length}</span>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 600 }}>{fmt(stageBills.reduce((s,b)=>s+b.amount,0))}</div>
                {stageBills.map(b => {
                  const job = jobs.find(j => j.id === b.jobId);
                  return (
                    <div key={b.id} className="kanban-card" onClick={() => openEdit(b)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{b.supplier}</div>
                          {b.invoiceNo && <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: 10 }}>{b.invoiceNo}</span>}
                        </div>
                        <div style={{ fontWeight: 800, color: "#111", fontSize: 13, flexShrink: 0 }}>{fmt(b.amount)}</div>
                      </div>
                      {b.description && <div style={{ color: "#777", marginTop: 3, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.description}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <span className="chip" style={{ fontSize: 10 }}>{b.category}</span>
                          {job ? <span style={{ fontSize: 10, color: "#888" }}>{job.title}</span> : <span style={{ fontSize: 10, color: "#ccc" }}>Unlinked</span>}
                        </div>
                        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                          {status === "inbox" && <button className="btn btn-secondary btn-xs" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}>Link →</button>}
                          {canApprove && status === "linked" && <button className="btn btn-secondary btn-xs" style={{ color: "#1e7e34" }} onClick={() => setStatus(b.id, "approved")}>✓</button>}
                          {canApprove && status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setPostBill(b)}>Post →</button>}
                          {canDelete && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={10} /></button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {tab === "list" && (
        <div>

          {/* Totals bar */}
          {filtered.length > 0 && (
            <div style={{ display: "flex", gap: 20, marginBottom: 12, fontSize: 13, padding: "10px 16px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", flexWrap: "wrap" }}>
              <span style={{ color: "#888" }}>Showing <strong style={{ color: "#111" }}>{filtered.length}</strong> bills</span>
              <span style={{ color: "#888" }}>Total <strong style={{ color: "#111" }}>{fmt(filtered.reduce((s,b)=>s+b.amount,0))}</strong></span>
              <span style={{ color: "#888" }}>Ex-GST <strong style={{ color: "#111" }}>{fmt(filtered.reduce((s,b)=>s+(b.hasGst?b.amount/1.1:b.amount),0))}</strong></span>
              {selectedIds.length > 0 && <span style={{ marginLeft: "auto", color: "#2c5fa8", fontWeight: 600 }}>{selectedIds.length} selected · {fmt(bills.filter(b=>selectedIds.includes(b.id)).reduce((s,b)=>s+b.amount,0))}</span>}
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" checked={filtered.length > 0 && selectedIds.length === filtered.length} onChange={toggleAll} />
                    </th>
                    <th>Supplier</th><th>Invoice #</th><th>Job</th><th>Category</th>
                    <th>Date</th><th>Ex-GST</th><th>GST</th><th>Total</th><th>Markup</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={12}><div className="empty-state"><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills match your filters</div></div></td></tr>
                  )}
                  {filtered.map(b => {
                    const job = jobs.find(j => j.id === b.jobId);
                    const exGst = b.hasGst ? b.amount / 1.1 : b.amount;
                    const gst = b.amount - exGst;
                    const onCharge = exGst * (1 + (b.markup||0) / 100);
                    return (
                      <tr key={b.id} style={{ background: selectedIds.includes(b.id) ? "#f5f8ff" : "transparent" }}>
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.includes(b.id)} onChange={() => toggleSelect(b.id)} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier}</div>
                          {b.notes && <div style={{ fontSize: 10, color: "#aaa", marginTop: 1, fontStyle: "italic" }}>{b.notes.slice(0,40)}{b.notes.length>40?"…":""}</div>}
                        </td>
                        <td><span style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}>{b.invoiceNo||"—"}</span></td>
                        <td>
                          {job ? <div style={{ fontSize: 12 }}>{job.title}</div> : <span style={{ color: "#ccc", fontSize: 12 }}>Unlinked</span>}
                        </td>
                        <td><span className="chip">{b.category}</span></td>
                        <td style={{ fontSize: 12, color: "#999" }}>{b.date}</td>
                        <td style={{ fontSize: 13 }}>{fmt(exGst)}</td>
                        <td style={{ fontSize: 12, color: "#999" }}>{b.hasGst ? fmt(gst) : <span style={{ color: "#ddd" }}>—</span>}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(b.amount)}</td>
                        <td style={{ fontSize: 12 }}>
                          {b.markup > 0 ? <span style={{ color: "#555" }}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span> : <span style={{ color: "#ddd" }}>—</span>}
                        </td>
                        <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                            {b.status === "inbox"    && <button className="btn btn-ghost btn-xs" title="Link" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}><Icon name="arrow_right" size={11} /></button>}
                            {canApprove && b.status === "linked"   && <button className="btn btn-ghost btn-xs" style={{ color: "#1e7e34" }} title="Approve" onClick={() => setStatus(b.id, "approved")}><Icon name="check" size={11} /></button>}
                            {canApprove && b.status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} title="Post to Job" onClick={() => setPostBill(b)}>Post →</button>}
                            {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>}
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(b)}><Icon name="edit" size={11} /></button>
                            {canDelete && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={11} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals */}
      {showBillModal && (
        <BillModal bill={editBill} jobs={jobs} onSave={saveBill} onClose={() => setShowBillModal(false)} />
      )}
      {postBill && (
        <PostToJobModal
          bill={postBill}
          jobs={jobs}
          onPost={(jobId, category, markup) => handlePost(postBill.id, jobId, category, markup)}
          onClose={() => setPostBill(null)}
        />
      )}
    </div>
  );
};

// ── Invoices ──────────────────────────────────────────────────────────────────
const INV_STATUSES = ["all", "draft", "sent", "paid", "overdue", "void"];
const Invoices = () => {
  const { invoices, setInvoices, jobs, clients, quotes } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [invMode, setInvMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [view, setView] = useState("list");
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  const handleSendInvoiceEmail = async (inv) => {
    const job = jobs.find(j => j.id === inv.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    if (!client?.email) { alert("No client email address found. Please add an email to the client record."); return; }
    if (!window.confirm(`Send invoice ${inv.number} to ${client.name} (${client.email})?`)) return;
    setEmailSending(true); setEmailStatus(null);
    try {
      const tpl = templates.find(t => t.type === "invoice" && t.isDefault) || templates.find(t => t.type === "invoice");
      const pdfHtml = buildInvoicePdfHtml({ invoice: inv, job, client, company: companyInfo, template: tpl });
      let pdfBase64;
      try { pdfBase64 = await htmlToPdfBase64(pdfHtml, `${inv.number}.pdf`); } catch (e) { console.warn("PDF generation failed:", e); }
      const attachments = pdfBase64 ? [{ filename: `${inv.number}.pdf`, content: pdfBase64 }] : [];
      await sendEmail("invoice", client.email, { ...inv, clientName: client.name, jobTitle: job?.title }, { attachments });
      setEmailStatus({ type: "success", msg: `Invoice sent to ${client.email}` });
      setTimeout(() => setEmailStatus(null), 4000);
    } catch (err) {
      setEmailStatus({ type: "error", msg: err.message || "Failed to send email" });
    } finally { setEmailSending(false); }
  };

  const handleSendPaymentReminder = async (inv) => {
    const job = jobs.find(j => j.id === inv.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    if (!client?.email) { alert("No client email address found."); return; }
    const dueDate = inv.dueDate;
    const daysOverdue = dueDate ? Math.ceil((new Date() - new Date(dueDate + "T00:00:00")) / 86400000) : 0;
    const total = inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0) * (1 + (inv.tax || 0) / 100);
    if (!window.confirm(`Send payment reminder for ${inv.number} to ${client.name}? (${daysOverdue} days overdue)`)) return;
    setEmailSending(true); setEmailStatus(null);
    try {
      await sendEmail("payment_reminder", client.email, { clientName: client.name, invoiceRef: inv.number, amount: total, dueDate, daysOverdue });
      setEmailStatus({ type: "success", msg: `Payment reminder sent to ${client.email}` });
      setTimeout(() => setEmailStatus(null), 4000);
    } catch (err) {
      setEmailStatus({ type: "error", msg: err.message || "Failed to send reminder" });
    } finally { setEmailSending(false); }
  };

  const openNew = () => { setEditInvoice(null); setInvMode("edit"); setForm({ jobId: jobs[0]?.id || "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" }); setShowModal(true); };
  const openEdit = (inv) => { setEditInvoice(inv); setInvMode("view"); setForm(inv); setShowModal(true); };
  const fromQuote = (q) => {
    setEditInvoice(null);
    setForm({ jobId: q.jobId, status: "draft", lineItems: [...q.lineItems], tax: q.tax, dueDate: "", notes: q.notes });
    setShowModal(true);
  };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editInvoice) {
        const saved = await updateInvoice(editInvoice.id, data);
        setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
        setEditInvoice(saved);
        setForm(saved);
        setInvMode("view");
        // Auto-sync to Xero when invoice status changes to "sent"
        if (data.status === "sent" && editInvoice.status !== "sent") {
          xeroSyncInvoice("push", editInvoice.id).catch(() => {});
        }
      } else {
        const saved = await createInvoice(data);
        setInvoices(is => [...is, saved]);
        setShowModal(false);
      }
    } catch (err) { console.error('Failed to save invoice:', err); }
  };
  const del = async (id) => {
    try {
      await deleteInvoice(id);
      setInvoices(is => is.filter(i => i.id !== id));
    } catch (err) { console.error('Failed to delete invoice:', err); }
  };
  const markPaid = async (id) => {
    const inv = invoices.find(i => i.id === id);
    try {
      const saved = await updateInvoice(id, { ...inv, status: "paid" });
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      // Auto-sync to Xero if connected and invoice is synced
      if (saved.xeroInvoiceId) {
        xeroSyncInvoice("push", id).catch(() => {});
      }
    } catch (err) { console.error('Failed to mark invoice paid:', err); }
  };

  const filtered = invoices.filter(inv => {
    const job = jobs.find(j => j.id === inv.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (inv.number || "").toLowerCase().includes(q) ||
      (job?.title || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (inv.notes || "").toLowerCase().includes(q) ||
      (inv.items || []).some(i => (i.description || "").toLowerCase().includes(q)) ||
      (inv.dueDate || "").includes(q) ||
      String(inv.total || "").includes(q);
    const matchStatus = filterStatus === "all" || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const invStatusColors = { draft: "#888", sent: "#2563eb", paid: "#16a34a", overdue: "#dc2626", void: "#555" };
  const invStatusLabels = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", void: "Void" };

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        {Object.entries(invStatusLabels).map(([key, label]) => {
          const statusInvs = invoices.filter(i => i.status === key);
          const count = statusInvs.length;
          const total = statusInvs.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
          const color = invStatusColors[key];
          return (
            <div key={key} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}`, cursor: "pointer" }}
              onClick={() => { setFilterStatus(key); setView("list"); }}>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{count}</div>
              <div className="stat-sub">{fmt(total)}</div>
            </div>
          );
        })}
      </div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices, jobs, clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {INV_STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        {quotes.filter(q => q.status === "accepted").length > 0 && (
          <select className="form-control" style={{ width: "auto" }} onChange={e => { const q = quotes.find(q => String(q.id) === e.target.value); if (q) fromQuote(q); e.target.value = ""; }}>
            <option value="">From Quote…</option>
            {quotes.filter(q => q.status === "accepted").map(q => <option key={q.id} value={q.id}>{q.number}</option>)}
          </select>
        )}
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.invoices.accent }} onClick={openNew}><Icon name="plus" size={14} />New Invoice</button></div>
      </div>

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(5, minmax(200px,1fr))" }}>
          {["draft", "sent", "paid", "overdue", "void"].map(col => {
            const colInvoices = filtered.filter(i => i.status === col);
            const labels = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", void: "Void" };
            const colTotal = colInvoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colInvoices.length}</span>
                </div>
                {colTotal > 0 && <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 600 }}>{fmt(colTotal)}</div>}
                {colInvoices.map(inv => {
                  const job = jobs.find(j => j.id === inv.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  const total = calcQuoteTotal(inv);
                  return (
                    <div key={inv.id} className="kanban-card" onClick={() => openEdit(inv)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{inv.number}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{job?.title || "—"}</div>
                      <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{client?.name || "—"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(total)}</span>
                        <span style={{ fontSize: 10, color: inv.dueDate ? "#111" : "#ccc" }}>{inv.dueDate || "No due"}</span>
                      </div>
                      {inv.status !== "paid" && inv.status !== "void" && (
                        <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#2a7" }} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "grid" && (
        <div className="order-cards-grid">
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices found</div></div>}
          {filtered.map(inv => {
            const job = jobs.find(j => j.id === inv.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            const total = calcQuoteTotal(inv);
            const lineCount = inv.lineItems.length;
            const fromQuote = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
            return (
              <div key={inv.id} className="order-card" onClick={() => openEdit(inv)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: SECTION_COLORS.invoices.light, color: SECTION_COLORS.invoices.accent }}>
                      <Icon name="invoices" size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{inv.number}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{inv.createdAt || "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job?.title || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>No job</span>}
                </div>
                {client && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{client.name}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{fmt(total)}</span>
                  <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
                  {fromQuote && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>from {fromQuote.number}</span>}
                </div>
                <SectionProgressBar status={inv.status} section="invoices" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: inv.dueDate ? "#334155" : "#ccc" }}>{inv.dueDate ? `Due ${inv.dueDate}` : "No due date"}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    {inv.status !== "paid" && inv.status !== "void" && <button className="btn btn-ghost btn-xs" style={{ color: "#2a7" }} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>}
                    <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(inv.id)}><Icon name="trash" size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Job</th><th>Client</th><th>Status</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Due Date</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9}><div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices found</div></div></td></tr>}
              {filtered.map(inv => {
                const job = jobs.find(j => j.id === inv.jobId);
                const client = clients.find(c => c.id === job?.clientId);
                const sub = inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                const fromQuote = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                return (
                  <tr key={inv.id} style={{ cursor: "pointer" }} onClick={() => openEdit(inv)}>
                    <td><span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{inv.number}</span>{fromQuote && <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>from {fromQuote.number}</div>}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{job?.title}</td>
                    <td style={{ fontSize: 13, color: "#666" }}>{client?.name}</td>
                    <td><StatusBadge status={inv.status} /> <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(sub * inv.tax / 100)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(sub * (1 + inv.tax / 100))}</td>
                    <td style={{ fontSize: 12, color: inv.dueDate ? "#111" : "#ccc" }}>{inv.dueDate || "—"}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {inv.status !== "paid" && inv.status !== "void" && <button className="btn btn-ghost btn-xs" style={{ color: "#2a7" }} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>}
                        {!inv.xeroInvoiceId && inv.status !== "draft" && <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} onClick={() => xeroSyncInvoice("push", inv.id).then(() => refreshData?.())} title="Send to Xero"><Icon name="send" size={12} /></button>}
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(inv.id)}><Icon name="trash" size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {showModal && (() => {
        const isNewInv = !editInvoice;
        const iJob = jobs.find(j => j.id === form.jobId);
        const iClient = clients.find(c => c.id === iJob?.clientId);
        const iSub = form.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
        const iTax = iSub * (form.tax || 0) / 100;
        const iTotal = iSub + iTax;
        const accent = SECTION_COLORS.invoices.accent;
        return (
        <SectionDrawer
          accent={accent}
          icon={<Icon name="invoices" size={16} />}
          typeLabel="Invoice"
          title={editInvoice ? editInvoice.number : "New Invoice"}
          statusBadge={editInvoice ? <StatusBadge status={editInvoice.status} /> : null}
          mode={invMode} setMode={setInvMode}
          showToggle={!isNewInv}
          isNew={isNewInv}
          footer={invMode === "view" && !isNewInv ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <div style={{ display: "flex", gap: 6 }}>
              {(form.status === "sent" || form.status === "overdue") && <button className="btn btn-sm" style={{ background: "#dc2626", color: "#fff", border: "none" }} disabled={emailSending} onClick={() => handleSendPaymentReminder(form)}>
                <Icon name="notification" size={13} /> {emailSending ? "Sending..." : "Payment Reminder"}
              </button>}
              <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} disabled={emailSending} onClick={() => handleSendInvoiceEmail(form)}>
                <Icon name="send" size={13} /> {emailSending ? "Sending..." : "Send to Client"}
              </button>
              <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={() => setInvMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (isNewInv) setShowModal(false); else { setForm(editInvoice); setInvMode("view"); } }}>Cancel</button>
            <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={save}>
              <Icon name="check" size={13} /> {isNewInv ? "Create Invoice" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {invMode === "view" && !isNewInv ? (
          <div style={{ padding: "20px 24px" }}>
            {emailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, background: emailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: emailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${emailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{emailStatus.msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <ViewField label="Job" value={iJob?.title} />
              <ViewField label="Client" value={iClient?.name} />
              <ViewField label="Status" value={form.status?.charAt(0).toUpperCase() + form.status?.slice(1)} />
              <ViewField label="Due Date" value={form.dueDate || "—"} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Line Items</div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Qty</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Unit</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Rate</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Amount</th>
                </tr></thead>
                <tbody>
                  {form.lineItems.map((li, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 500 }}>{li.desc || '—'}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>{li.qty}</td>
                      <td style={{ padding: '8px 8px' }}>{li.unit}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>{fmt(li.rate)}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(li.qty * li.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(iSub)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({form.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(iTax)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: accent }}>{fmt(iTotal)}</span></div>
            </div>
            {form.notes && <ViewField label="Notes" value={form.notes} />}
          </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="grid-3" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Job</label>
                <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","sent","paid","overdue","void"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            <div className="form-group">
              <label className="form-label">Line Items</label>
              <LineItemsEditor items={form.lineItems} onChange={items => setForm(f => ({ ...f, lineItems: items }))} />
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment instructions, bank details, thank you note..." /></div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

// ── Actions Page ────────────────────────────────────────────────────────────
const Actions = ({ onNav }) => {
  const { jobs, quotes, invoices, bills, workOrders, purchaseOrders, contractors, reminders } = useAppStore();
  const today = new Date().toISOString().split("T")[0];
  const accent = SECTION_COLORS.actions.accent;

  // Build action items per category
  const categories = [
    {
      id: "overdue-reminders", label: "Overdue Reminders", color: "#f59e0b", nav: "reminders",
      items: reminders.filter(r => r.status === "pending" && r.dueDate < today).map(r => {
        const job = r.jobId ? jobs.find(j => j.id === r.jobId) : null;
        return { id: `rem-${r.id}`, title: r.text, sub: job?.title, detail: `Due ${r.dueDate}`, severity: "high" };
      }),
    },
    {
      id: "overdue-jobs", label: "Overdue Jobs", color: "#111", nav: "jobs",
      items: jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled").map(j => {
        const client = SEED_CLIENTS.find(c => c.id === j.clientId);
        const days = Math.abs(daysUntil(j.dueDate));
        return { id: `job-${j.id}`, title: j.title, sub: client?.name, detail: `${days} day${days !== 1 ? "s" : ""} overdue`, severity: "high" };
      }),
    },
    {
      id: "overdue-orders", label: "Overdue Orders", color: "#2563eb", nav: "orders",
      items: [...workOrders, ...purchaseOrders].filter(o => !ORDER_TERMINAL.includes(o.status) && daysUntil(o.dueDate) < 0).map(o => {
        const job = o.jobId ? jobs.find(j => j.id === o.jobId) : null;
        const days = Math.abs(daysUntil(o.dueDate));
        return { id: `ord-${o.id}`, title: `${o.ref} — ${o.contractorName || o.supplierName || ""}`, sub: job?.title, detail: `${days} day${days !== 1 ? "s" : ""} overdue`, severity: "high" };
      }),
    },
    {
      id: "wo-awaiting", label: "Awaiting Acceptance", color: "#2563eb", nav: "orders",
      items: workOrders.filter(wo => wo.status === "Sent").map(wo => {
        const job = wo.jobId ? jobs.find(j => j.id === wo.jobId) : null;
        const days = wo.issueDate ? Math.abs(daysUntil(wo.issueDate)) : null;
        return { id: `woa-${wo.id}`, title: `${wo.ref} — ${wo.contractorName || ""}`, sub: job?.title, detail: days ? `Sent ${days} day${days !== 1 ? "s" : ""} ago` : "Sent", severity: "medium" };
      }),
    },
    {
      id: "bills", label: "Bills to Process", color: "#dc2626", nav: "bills",
      items: bills.filter(b => b.status === "inbox" || b.status === "linked" || b.status === "approved").map(b => {
        const job = b.jobId ? jobs.find(j => j.id === b.jobId) : null;
        return { id: `bill-${b.id}`, title: `${b.supplier} — ${b.invoiceNo || ""}`, sub: job?.title, detail: `$${(b.amount || 0).toLocaleString()} · ${b.status}`, severity: b.status === "inbox" ? "medium" : "low" };
      }),
    },
    {
      id: "invoices", label: "Unpaid Invoices", color: "#4f46e5", nav: "invoices",
      items: invoices.filter(i => i.status !== "paid" && i.status !== "void").map(inv => {
        const job = inv.jobId ? jobs.find(j => j.id === inv.jobId) : null;
        const total = (inv.lineItems || []).reduce((s, li) => s + (li.qty || 0) * (li.rate || 0), 0);
        const isOverdue = inv.dueDate && daysUntil(inv.dueDate) < 0;
        return { id: `inv-${inv.id}`, title: `${inv.number}`, sub: job?.title, detail: `$${total.toLocaleString()} · ${isOverdue ? "Overdue" : inv.status}`, severity: isOverdue ? "high" : "medium" };
      }),
    },
    {
      id: "compliance", label: "Compliance Issues", color: "#0d9488", nav: "contractors",
      items: contractors.flatMap(c => {
        const issues = [];
        COMPLIANCE_DOC_TYPES.forEach(dt => {
          const doc = (c.documents || []).find(d => d.type === dt.id);
          const status = getComplianceStatus(doc);
          if (status === "expired" || status === "missing") {
            issues.push({ id: `comp-${c.id}-${dt.id}`, title: c.name, sub: dt.label, detail: status === "expired" ? "Expired" : "Missing", severity: status === "expired" ? "high" : "medium" });
          }
        });
        return issues;
      }),
    },
    {
      id: "draft-quotes", label: "Draft Quotes", color: "#ca8a04", nav: "quotes",
      items: quotes.filter(q => q.status === "draft").map(q => {
        const job = q.jobId ? jobs.find(j => j.id === q.jobId) : null;
        const total = (q.lineItems || []).reduce((s, li) => s + (li.qty || 0) * (li.rate || 0), 0);
        return { id: `qt-${q.id}`, title: `${q.number}`, sub: job?.title, detail: `$${total.toLocaleString()} · Ready to send`, severity: "low" };
      }),
    },
  ].filter(c => c.items.length > 0);

  const totalCount = categories.reduce((s, c) => s + c.items.length, 0);
  const highSeverityItems = categories.flatMap(c => c.items.filter(i => i.severity === "high"));

  const [callStatus, setCallStatus] = useState(null);
  const triggerOutboundCall = async (member, tasks) => {
    const voiceServerUrl = import.meta.env.VITE_VOICE_SERVER_URL;
    if (!voiceServerUrl) { setCallStatus("Configure VITE_VOICE_SERVER_URL"); setTimeout(() => setCallStatus(null), 3000); return; }
    setCallStatus(`Calling ${member.name}...`);
    try {
      const res = await fetch(`${voiceServerUrl}/outbound-call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: member.phone, teamMemberName: member.name, tasks }) });
      const data = await res.json();
      setCallStatus(data.ok ? `Call to ${member.name} initiated` : `Failed: ${data.error}`);
    } catch (err) { setCallStatus(`Failed: ${err.message}`); }
    setTimeout(() => setCallStatus(null), 5000);
  };

  // Load outbound team from localStorage
  const outboundTeam = (() => {
    try { const s = localStorage.getItem("fieldops_outbound_settings"); return s ? JSON.parse(s).team?.filter(m => m.callEnabled) || [] : []; } catch { return []; }
  })();

  return (
    <div>
      {/* Summary */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: totalCount > 0 ? accent : "#059669" }}>{totalCount}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>{totalCount === 1 ? "item needs attention" : "items need attention"}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {categories.map(c => (
            <span key={c.id} style={{ fontSize: 11, fontWeight: 600, background: hexToRgba(c.color, 0.1), color: c.color, padding: "3px 10px", borderRadius: 12 }}>{c.items.length} {c.label}</span>
          ))}
          {outboundTeam.length > 0 && highSeverityItems.length > 0 && (
            <div style={{ position: "relative", display: "inline-block" }}>
              <select onChange={e => { const m = outboundTeam.find(t => t.id === Number(e.target.value)); if (m) triggerOutboundCall(m, highSeverityItems); e.target.value = ""; }} style={{ padding: "4px 10px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif", appearance: "none", paddingRight: 24 }} defaultValue="">
                <option value="" disabled>Call Team...</option>
                {outboundTeam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <svg style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="5 8 10 13 15 8"/></svg>
            </div>
          )}
        </div>
      </div>
      {callStatus && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1d4ed8" }}>{callStatus}</div>
      )}

      {totalCount === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#aaa", fontSize: 14 }}>All clear — nothing needs attention right now.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {categories.map(cat => (
            <div key={cat.id}>
              {/* Category header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 4, height: 18, borderRadius: 2, background: cat.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{cat.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: cat.color, borderRadius: 10, padding: "1px 8px", minWidth: 18, textAlign: "center" }}>{cat.items.length}</span>
              </div>
              {/* Items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cat.items.map(item => (
                  <div key={item.id} onClick={() => onNav(cat.nav)} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                    {/* Severity dot */}
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: item.severity === "high" ? "#dc2626" : item.severity === "medium" ? "#f59e0b" : "#94a3b8", flexShrink: 0 }} />
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                      {item.sub && <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{item.sub}</div>}
                    </div>
                    {/* Detail */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: item.severity === "high" ? "#dc2626" : "#888", flexShrink: 0, textAlign: "right" }}>{item.detail}</div>
                    {/* Arrow */}
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="7 4 13 10 7 16"/></svg>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Reminders Page ──────────────────────────────────────────────────────────
const Reminders = () => {
  const { reminders, setReminders, jobs } = useAppStore();
  const today = new Date().toISOString().split("T")[0];
  const accent = SECTION_COLORS.reminders.accent;
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editReminder, setEditReminder] = useState(null);
  const [form, setForm] = useState({ text: "", type: "text", dueDate: today, jobId: "", items: [] });
  const [newItemText, setNewItemText] = useState("");

  const overdueCount = reminders.filter(r => r.status === "pending" && r.dueDate < today).length;
  const dueTodayCount = reminders.filter(r => r.status === "pending" && r.dueDate === today).length;
  const upcomingCount = reminders.filter(r => r.status === "pending" && r.dueDate > today).length;
  const completedCount = reminders.filter(r => r.status === "completed").length;

  const filtered = reminders.filter(r => {
    const q = search.toLowerCase();
    const linkedJob = r.jobId ? jobs.find(j => j.id === r.jobId) : null;
    const linkedClient = r.clientId ? clients.find(c => c.id === r.clientId) : null;
    const matchSearch = !search || r.text.toLowerCase().includes(q) || (r.items || []).some(i => i.text.toLowerCase().includes(q)) || (linkedJob?.title || "").toLowerCase().includes(q) || (linkedClient?.name || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || (filterStatus === "overdue" ? (r.status === "pending" && r.dueDate < today) : r.status === filterStatus);
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aOverdue = a.status === "pending" && a.dueDate < today ? 0 : 1;
    const bOverdue = b.status === "pending" && b.dueDate < today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const aDone = a.status !== "pending" ? 1 : 0;
    const bDone = b.status !== "pending" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return a.dueDate > b.dueDate ? 1 : -1;
  });

  const openNew = () => { setEditReminder(null); setForm({ text: "", type: "text", dueDate: today, jobId: "", items: [] }); setNewItemText(""); setShowModal(true); };
  const openEdit = (r) => { setEditReminder(r); setForm({ text: r.text, type: r.type, dueDate: r.dueDate, jobId: r.jobId || "", items: r.items ? r.items.map(i => ({ ...i })) : [] }); setNewItemText(""); setShowModal(true); };
  const saveReminder = () => {
    if (!form.text.trim() || !form.dueDate) return;
    const data = { text: form.text, type: form.type, dueDate: form.dueDate, jobId: form.jobId || null };
    if (form.type === "checklist") data.items = form.items;
    if (editReminder) {
      setReminders(rs => rs.map(r => r.id === editReminder.id ? { ...r, ...data } : r));
    } else {
      setReminders(rs => [...rs, { id: Date.now(), ...data, status: "pending", createdAt: new Date().toISOString() }]);
    }
    setShowModal(false);
  };
  const toggleComplete = (id) => setReminders(rs => rs.map(r => r.id === id ? { ...r, status: r.status === "completed" ? "pending" : "completed" } : r));
  const toggleChecklistItem = (reminderId, itemId) => setReminders(rs => rs.map(r => r.id === reminderId ? { ...r, items: (r.items || []).map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : r));
  const dismissReminder = (id) => setReminders(rs => rs.map(r => r.id === id ? { ...r, status: "dismissed" } : r));
  const deleteReminder = (id) => setReminders(rs => rs.filter(r => r.id !== id));
  const addFormItem = () => {
    if (!newItemText.trim()) return;
    setForm(f => ({ ...f, items: [...f.items, { id: Date.now(), text: newItemText.trim(), done: false }] }));
    setNewItemText("");
  };
  const removeFormItem = (itemId) => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== itemId) }));
  const toggleFormItem = (itemId) => setForm(f => ({ ...f, items: f.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) }));

  const dueDateColor = (d, status) => {
    if (status !== "pending") return "#aaa";
    if (d < today) return "#dc2626";
    if (d === today) return "#f59e0b";
    return "#666";
  };
  const dueDateLabel = (d, status) => {
    if (status !== "pending") return d;
    if (d < today) return `Overdue — ${d}`;
    if (d === today) return "Due today";
    const diff = Math.ceil((new Date(d) - new Date(today)) / 86400000);
    return diff === 1 ? "Due tomorrow" : `Due in ${diff} days`;
  };

  const stats = [
    { label: "Overdue", count: overdueCount, color: "#dc2626" },
    { label: "Due Today", count: dueTodayCount, color: "#f59e0b" },
    { label: "Upcoming", count: upcomingCount, color: "#2563eb" },
    { label: "Completed", count: completedCount, color: "#059669" },
  ];

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "16px 20px", borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reminders..." style={{ flex: 1, minWidth: 180, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif" }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif" }}>
          <option value="all">All</option>
          <option value="overdue">Overdue</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <button onClick={openNew} style={{ padding: "8px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>+ New Reminder</button>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 }}>No reminders found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map(r => {
            const job = r.jobId ? jobs.find(j => j.id === r.jobId) : null;
            const isOverdue = r.status === "pending" && r.dueDate < today;
            const checklistProgress = r.type === "checklist" && r.items?.length ? `${r.items.filter(i => i.done).length}/${r.items.length}` : null;
            return (
              <div key={r.id} onClick={() => openEdit(r)} style={{ background: "#fff", border: `1px solid ${isOverdue ? "#fecaca" : "#e8e8e8"}`, borderRadius: 10, padding: "14px 18px", opacity: r.status !== "pending" ? 0.6 : 1, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Round checkbox */}
                  <button onClick={e => { e.stopPropagation(); toggleComplete(r.id); }} style={{ width: 22, height: 22, borderRadius: 11, border: r.status === "completed" ? `2px solid ${accent}` : "2px solid #ccc", background: r.status === "completed" ? accent : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    {r.status === "completed" && <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>✓</span>}
                  </button>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: r.status === "completed" ? "#aaa" : "#111", textDecoration: r.status === "completed" ? "line-through" : "none" }}>{r.text}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: dueDateColor(r.dueDate, r.status) }}>{dueDateLabel(r.dueDate, r.status)}</span>
                      {checklistProgress && <span style={{ fontSize: 10, fontWeight: 600, background: "#f0f0f0", padding: "2px 8px", borderRadius: 4, color: "#555" }}>{checklistProgress} done</span>}
                      {job && <span style={{ fontSize: 10, fontWeight: 600, background: "#f0f0f0", padding: "2px 8px", borderRadius: 4, color: "#555" }}>{job.title}</span>}
                      {r.status === "dismissed" && <span style={{ fontSize: 10, fontWeight: 600, background: "#f5f5f5", padding: "2px 8px", borderRadius: 4, color: "#999" }}>Dismissed</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {r.status === "pending" && <button onClick={() => dismissReminder(r.id)} title="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 13, padding: 4 }}>✕</button>}
                    <button onClick={() => deleteReminder(r.id)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: 13, padding: 4 }}>🗑</button>
                  </div>
                </div>
                {/* Checklist items inline */}
                {r.type === "checklist" && r.items?.length > 0 && r.status === "pending" && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, marginLeft: 34, display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.items.map(item => (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: item.done ? "#aaa" : "#333" }}>
                        <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(r.id, item.id)} style={{ width: 15, height: 15, accentColor: accent, cursor: "pointer" }} />
                        <span style={{ textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editReminder ? "Edit Reminder" : "New Reminder"}</div>

            {/* Type toggle */}
            <div style={{ display: "flex", gap: 0, marginBottom: 16, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
              <button onClick={() => setForm(f => ({ ...f, type: "text" }))} style={{ flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "'Open Sans', sans-serif", background: form.type === "text" ? accent : "#f5f5f5", color: form.type === "text" ? "#fff" : "#666" }}>Text</button>
              <button onClick={() => setForm(f => ({ ...f, type: "checklist" }))} style={{ flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", borderLeft: "1px solid #ddd", cursor: "pointer", fontFamily: "'Open Sans', sans-serif", background: form.type === "checklist" ? accent : "#f5f5f5", color: form.type === "checklist" ? "#fff" : "#666" }}>Checklist</button>
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{form.type === "checklist" ? "Title" : "Reminder"}</label>
            {form.type === "text" ? (
              <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="What do you need to remember?" rows={3} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box", marginBottom: 16 }} autoFocus />
            ) : (
              <>
                <input value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="e.g. Site prep checklist" style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 12 }} autoFocus />
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Items</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {form.items.map(item => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={item.done} onChange={() => toggleFormItem(item.id)} style={{ width: 15, height: 15, accentColor: accent, cursor: "pointer" }} />
                      <span style={{ flex: 1, fontSize: 13, color: item.done ? "#aaa" : "#333", textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                      <button onClick={() => removeFormItem(item.id)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, padding: 2 }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                  <input value={newItemText} onChange={e => setNewItemText(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addFormItem())} placeholder="Add an item..." style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
                  <button onClick={addFormItem} style={{ padding: "8px 12px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Add</button>
                </div>
              </>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Link to Job</label>
                <select value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value ? Number(e.target.value) : "" }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }}>
                  <option value="">None</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 16px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Cancel</button>
              <button onClick={saveReminder} style={{ padding: "8px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>{editReminder ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Global Activity Log Page ──────────────────────────────────────────────────
const ActivityPage = () => {
  const { jobs, clients, quotes, invoices, bills, timeEntries, schedule } = useAppStore();
  const [filterType, setFilterType] = useState("all");
  const [filterJob, setFilterJob] = useState("all");

  // Collect all activity events from all jobs
  const allEvents = [];
  jobs.forEach(j => {
    const client = clients.find(c => c.id === j.clientId);
    (j.activityLog || []).forEach(e => allEvents.push({ ...e, entityType: "job", entityLabel: j.title, entitySub: client?.name, jobId: j.id }));
  });

  // Sort newest first
  allEvents.sort((a, b) => b.ts > a.ts ? 1 : -1);

  const filtered = allEvents
    .filter(e => filterType === "all" || e.entityType === filterType)
    .filter(e => filterJob === "all" || String(e.jobId) === filterJob);

  const typeColors = { job: "#111", quote: "#555", invoice: "#333", bill: "#777", time: "#999" };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
          {["all","job"].map(t => (
            <button key={t} className={`btn btn-sm ${filterType === t ? "" : "btn-secondary"}`}
              onClick={() => setFilterType(t)} style={filterType === t ? { background: SECTION_COLORS.activity.accent, color: '#fff', textTransform: "capitalize" } : { textTransform: "capitalize" }}>
              {t === "all" ? "All Events" : `Jobs`}
            </button>
          ))}
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Events", val: allEvents.length },
          { label: "Today", val: allEvents.filter(e => e.ts.startsWith(new Date().toLocaleDateString("en-AU",{day:"2-digit",month:"short",year:"numeric"}))).length },
          { label: "This Week", val: (() => { const d=new Date(); d.setDate(d.getDate()-7); const w=d.toISOString().slice(0,10); return allEvents.filter(e => e.ts >= w).length; })() },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ flex: 1, padding: "14px 18px" }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 24 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No activity events found</div></div>
      ) : (
        <div className="card">
          <div style={{ padding: "0 4px" }}>
            <div className="timeline" style={{ padding: "16px 24px 16px 40px" }}>
              {filtered.map((e, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" style={{ background: typeColors[e.entityType] || "#111" }} />
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>{e.action}</div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
                        <span style={{ fontWeight: 600, color: "#555" }}>{e.entityLabel}</span>
                        {e.entitySub && <span style={{ color: "#bbb" }}> · {e.entitySub}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>{e.user}</div>
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 1 }}>{e.ts}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
// ── Hamburger Icon ────────────────────────────────────────────────────────────
const HamburgerIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    {open
      ? <><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></>
      : <><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></>
    }
  </svg>
);

// ── Display Dashboards (full-screen, no nav) ─────────────────────────────────
const DS = {
  accent: "#0891b2",
  root: { background: "#fafafa", color: "#111", fontFamily: "'Open Sans', sans-serif", height: "100vh", padding: "28px 36px", boxSizing: "border-box", display: "flex", flexDirection: "column" },
  card: { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" },
  heading: { fontSize: 32, fontWeight: 700, color: "#111" },
};

// Sydney timezone date helper
const sydneyToday = () => {
  const syd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return syd; // returns YYYY-MM-DD
};

const displayGetMonday = (d) => {
  const dt = new Date(d + "T12:00:00");
  const day = dt.getDay();
  // Sun (0) → next day Mon; Mon-Fri → back to Mon; Sat (6) → +2 to Mon
  const diff = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
};

// Auto-refresh hook for display pages
const useDisplayRefresh = (intervalMs = 30000) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
};

const DisplaySchedule = () => {
  const { schedule, jobs, clients } = useAppStore();
  useDisplayRefresh(30000);
  const today = sydneyToday();
  const allDays = (mon) => Array.from({ length: 7 }, (_, i) => { const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const todayMon = displayGetMonday(today);
  const nextMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const thisWeekAll = allDays(todayMon);
  const nextWeekAll = allDays(nextMon);
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const accent = DS.accent;

  // Weather data for Coffs Harbour NSW
  const [weather, setWeather] = useState({});
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-30.2963&longitude=153.1157&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Australia%2FSydney&forecast_days=14");
        const data = await res.json();
        if (data.daily) {
          const w = {};
          data.daily.time.forEach((date, i) => {
            w[date] = { maxTemp: data.daily.temperature_2m_max[i], minTemp: data.daily.temperature_2m_min[i], rain: data.daily.precipitation_sum[i], rainChance: data.daily.precipitation_probability_max[i] };
          });
          setWeather(w);
        }
      } catch (err) { console.error("Weather fetch failed:", err); }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const DayCol = ({ dateStr, isLarge, isCompact }) => {
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const d = new Date(dateStr + "T12:00:00");
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const dayEntries = schedule.filter(e => e.date === dateStr);
    const headerBg = isToday ? accent : isPast ? "#e0e0e0" : isWeekend ? "#f8f8f8" : "#f5f5f5";
    const headerColor = isToday ? "#fff" : isPast ? "#bbb" : "#333";
    const w = weather[dateStr];
    return (
      <div style={{ flex: isCompact ? undefined : 1, background: isToday ? "#ecfeff" : isPast ? "#fafafa" : isWeekend ? "#fafafa" : "#fff", border: `1px solid ${isToday ? accent : "#e5e5e5"}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", opacity: isPast ? 0.7 : 1 }}>
        <div style={{ background: headerBg, padding: isCompact ? "6px 10px" : isLarge ? "10px 16px" : "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: isCompact ? "row" : "column", alignItems: isCompact ? "center" : "flex-start", gap: isCompact ? 8 : 0 }}>
            <span style={{ fontSize: isCompact ? 11 : isLarge ? 14 : 11, fontWeight: 700, textTransform: "uppercase", color: headerColor }}>{DAY_NAMES[d.getDay()]}</span>
            <span style={{ fontSize: isCompact ? 14 : isLarge ? 25 : 18, fontWeight: 800, lineHeight: 1, color: headerColor }}>{d.getDate()}</span>
          </div>
          {w && !isCompact ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, fontSize: isLarge ? 13 : 11, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#ccc" : "#666" }}>
              <span style={{ fontWeight: 600 }}>{Math.round(w.minTemp)}–{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span style={{ color: isToday ? "rgba(255,255,255,0.85)" : w.rainChance >= 50 ? "#2563eb" : "#888" }}>💧{w.rainChance}%{w.rain > 0 ? ` ${w.rain}mm` : ""}</span>}
            </div>
          ) : w && isCompact ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0, fontSize: 9, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#ccc" : "#666" }}>
              <span>{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span>💧{w.rainChance}%</span>}
            </div>
          ) : (
            <span style={{ fontSize: isCompact ? 10 : isLarge ? 14 : 11, color: isToday ? "rgba(255,255,255,0.7)" : isPast ? "#ccc" : "#aaa", fontWeight: 400 }}>{MONTH_SHORT[d.getMonth()]}</span>
          )}
        </div>
        <div style={{ padding: isCompact ? "4px 8px" : isLarge ? "12px 14px" : "8px 10px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: isCompact ? 4 : 8 }}>
          {dayEntries.length === 0 ? (
            <div style={{ fontSize: isCompact ? 11 : isLarge ? 16 : 13, color: isPast ? "#ddd" : "#ccc", textAlign: "center", padding: isCompact ? "4px 0" : "12px 0" }}>—</div>
          ) : (
            dayEntries.map(entry => {
              const job = jobs.find(j => j.id === entry.jobId);
              const client = clients.find(c => c.id === job?.clientId);
              const title = client ? `${client.name} – ${job?.title || entry.title}` : (job?.title || entry.title || "Untitled");
              return (
                <div key={entry.id} style={{ background: isPast ? "#fafafa" : "#fff", border: `1px solid ${isPast ? "#f0f0f0" : "#e8e8e8"}`, borderRadius: isCompact ? 6 : 8, padding: isCompact ? "4px 6px" : isLarge ? "10px 12px" : "6px 8px", borderLeft: `3px solid ${isPast ? "#ddd" : accent}` }}>
                  <div style={{ fontWeight: 700, fontSize: isCompact ? 11 : isLarge ? 16 : 13, lineHeight: 1.4, color: isPast ? "#bbb" : "#333" }}>{title}</div>
                  {entry.startTime && !isCompact && <div style={{ fontSize: isLarge ? 13 : 11, color: isPast ? "#ccc" : "#aaa", marginTop: 2 }}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderWeek = (label, days, flex) => {
    const isLarge = flex >= 2;
    const weekdays = days.slice(0, 5);
    const weekend = days.slice(5);
    return (
      <div style={{ flex, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexShrink: 0 }}>
          <span style={{ fontSize: isLarge ? 32 : 25, fontWeight: 700, color: "#111" }}>{label}</span>
        </div>
        <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
          {weekdays.map(dateStr => (
            <DayCol key={dateStr} dateStr={dateStr} isLarge={isLarge} />
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, flex: 1 }}>
            {weekend.map(dateStr => (
              <DayCol key={dateStr} dateStr={dateStr} isLarge={isLarge} isCompact />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ ...DS.root, gap: 20 }}>
      {renderWeek("This Week", thisWeekAll, 2)}
      {renderWeek("Next Week", nextWeekAll, 1)}
    </div>
  );
};

const DisplayOverview = () => {
  const { jobs, quotes, timeEntries, schedule, clients } = useAppStore();
  useDisplayRefresh(30000);
  const today = sydneyToday();
  const todayMon = displayGetMonday(today);
  const weekEnd = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() + 4); return d.toISOString().slice(0, 10); })();
  const accent = DS.accent;

  // Deliver This Week — jobs with schedule entries this week
  const thisWeekEntries = schedule.filter(e => e.date >= todayMon && e.date <= weekEnd);
  const deliverJobIds = [...new Set(thisWeekEntries.map(e => e.jobId))];
  const deliverJobs = deliverJobIds.map(id => jobs.find(j => j.id === id)).filter(Boolean);

  // Priorities — high priority active jobs
  const priorities = jobs.filter(j => j.priority === "high" && j.status !== "completed" && j.status !== "cancelled");

  // Quotes — draft or sent
  const openQuotes = quotes.filter(q => q.status === "draft" || q.status === "sent");

  // Hours chart — weekly hours for last 16 weeks
  const weeksData = [];
  for (let w = 15; w >= 0; w--) {
    const wMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() - w * 7); return d.toISOString().slice(0, 10); })();
    const wFri = (() => { const d = new Date(wMon + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
    const weekHours = timeEntries.filter(t => t.date >= wMon && t.date <= wFri).reduce((s, t) => s + (t.hours || 0), 0);
    const label = (() => { const d = new Date(wMon + "T12:00:00"); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; })();
    weeksData.push({ label, hours: weekHours });
  }
  const maxHours = Math.max(...weeksData.map(w => w.hours), 1);
  const avgHours = weeksData.reduce((s, w) => s + w.hours, 0) / weeksData.length;

  // Targets — last week & last month actual vs target
  const lastWeekMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
  const lastWeekFri = (() => { const d = new Date(lastWeekMon + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
  const lastWeekHours = timeEntries.filter(t => t.date >= lastWeekMon && t.date <= lastWeekFri).reduce((s, t) => s + (t.hours || 0), 0);
  const weeklyTarget = 95;
  const lastMonthStart = (() => { const d = new Date(today + "T12:00:00"); d.setMonth(d.getMonth() - 1); d.setDate(1); return d.toISOString().slice(0, 10); })();
  const lastMonthEnd = (() => { const d = new Date(today + "T12:00:00"); d.setDate(0); return d.toISOString().slice(0, 10); })();
  const lastMonthHours = timeEntries.filter(t => t.date >= lastMonthStart && t.date <= lastMonthEnd).reduce((s, t) => s + (t.hours || 0), 0);
  const monthlyTarget = 380;

  const cardStyle = (borderColor) => ({ ...DS.card, display: "flex", flexDirection: "column", borderTop: `3px solid ${borderColor}`, padding: "24px 28px" });

  return (
    <div style={{ ...DS.root, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 20 }}>
      {/* Row 1: Deliver, Priorities, Quotes */}
      <div style={cardStyle(SECTION_COLORS.schedule.accent)}>
        <div style={{ ...DS.heading, marginBottom: 16 }}>Deliver This Week</div>
        {deliverJobs.length === 0 ? <div style={{ color: "#aaa", fontSize: 20 }}>No deliveries scheduled</div> :
          <ol style={{ margin: 0, paddingLeft: 30, fontSize: 22, lineHeight: 2.2, color: "#333" }}>
            {deliverJobs.map(j => <li key={j.id}>{j.title}</li>)}
          </ol>
        }
      </div>
      <div style={cardStyle(SECTION_COLORS.jobs.accent)}>
        <div style={{ ...DS.heading, marginBottom: 16 }}>Priorities</div>
        {priorities.length === 0 ? <div style={{ color: "#aaa", fontSize: 20 }}>No high-priority jobs</div> :
          <ol style={{ margin: 0, paddingLeft: 30, fontSize: 22, lineHeight: 2.2, color: "#333" }}>
            {priorities.map(j => <li key={j.id}>{j.title}</li>)}
          </ol>
        }
      </div>
      <div style={cardStyle(SECTION_COLORS.quotes.accent)}>
        <div style={{ ...DS.heading, marginBottom: 16 }}>Quotes</div>
        {openQuotes.length === 0 ? <div style={{ color: "#aaa", fontSize: 20 }}>No open quotes</div> :
          <ol style={{ margin: 0, paddingLeft: 30, fontSize: 22, lineHeight: 2.2, color: "#333" }}>
            {openQuotes.map(q => {
              const job = jobs.find(j => j.id === q.jobId);
              return <li key={q.id}>{job?.title || q.number}</li>;
            })}
          </ol>
        }
      </div>

      {/* Row 2: Hours (spans 2 cols), Targets */}
      <div style={{ ...cardStyle(SECTION_COLORS.time.accent), gridColumn: "1 / 3" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
          <div style={{ ...DS.heading, marginBottom: 0 }}>Hours</div>
          <div style={{ display: "flex", gap: 16, fontSize: 15, color: "#999" }}>
            <span><span style={{ color: accent }}>■</span> Actual</span>
            <span><span style={{ color: "#ccc" }}>●</span> Average</span>
          </div>
        </div>
        {/* Bar chart */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {/* Y-axis labels */}
          {[0, 25, 50, 75, 100, 125].map(v => (
            <div key={v} style={{ position: "absolute", left: 0, bottom: `calc(${(v / 125) * 100}% * 0.85 + 30px)`, fontSize: 13, color: "#aaa", width: 36, textAlign: "right" }}>{v}</div>
          ))}
          {/* Grid lines */}
          {[0, 25, 50, 75, 100, 125].map(v => (
            <div key={v} style={{ position: "absolute", left: 44, right: 0, bottom: `calc(${(v / 125) * 100}% * 0.85 + 30px)`, height: 1, background: "#f0f0f0" }} />
          ))}
          {/* Bars */}
          <div style={{ position: "absolute", left: 44, right: 0, bottom: 30, top: 0, display: "flex", alignItems: "flex-end", gap: 4 }}>
            {weeksData.map((w, i) => {
              const barPct = (w.hours / 125) * 100;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{w.hours > 0 ? w.hours : ""}</div>
                  <div style={{ width: "70%", height: `${barPct}%`, background: accent, borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
                </div>
              );
            })}
          </div>
          {/* Average line */}
          <div style={{ position: "absolute", left: 44, right: 0, bottom: `calc(${(avgHours / 125) * 100}% * 0.85 + 30px)`, height: 2, borderTop: "2px dashed #ccc", zIndex: 2 }} />
          {/* X-axis labels */}
          <div style={{ position: "absolute", left: 44, right: 0, bottom: 0, display: "flex" }}>
            {weeksData.map((w, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#aaa", transform: "rotate(-45deg)", transformOrigin: "top center", whiteSpace: "nowrap" }}>{w.label}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={cardStyle(SECTION_COLORS.invoices.accent)}>
        <div style={{ ...DS.heading, marginBottom: 24, flexShrink: 0 }}>Targets</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}>
          {/* Last Week */}
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 14, color: "#555" }}>Last Week</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: `${Math.min((lastWeekHours / weeklyTarget) * 100, 100)}%`, height: 26, background: accent, borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>{lastWeekHours}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: "100%", height: 26, background: "#e5e5e5", borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#999", whiteSpace: "nowrap" }}>{weeklyTarget}</span>
            </div>
          </div>
          {/* Last Month */}
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 14, color: "#555" }}>Last Month</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: `${Math.min((lastMonthHours / monthlyTarget) * 100, 100)}%`, height: 26, background: accent, borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>{lastMonthHours}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: "100%", height: 26, background: "#e5e5e5", borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#999", whiteSpace: "nowrap" }}>{monthlyTarget}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 15, color: "#999", marginTop: 16, flexShrink: 0 }}>
          <span><span style={{ color: accent }}>■</span> Actual</span>
          <span><span style={{ color: "#e5e5e5" }}>■</span> Target</span>
        </div>
      </div>
    </div>
  );
};

// ── Settings Page ───────────────────────────────────────────────────────────

const VOICE_OPTIONS = {
  voices: [
    { id: "alloy", label: "Alloy", desc: "Neutral and balanced" },
    { id: "ash", label: "Ash", desc: "Warm and conversational" },
    { id: "ballad", label: "Ballad", desc: "Smooth and melodic" },
    { id: "coral", label: "Coral", desc: "Clear and friendly" },
    { id: "echo", label: "Echo", desc: "Deep and resonant" },
    { id: "sage", label: "Sage", desc: "Calm and articulate" },
    { id: "shimmer", label: "Shimmer", desc: "Bright and energetic" },
    { id: "verse", label: "Verse", desc: "Warm and expressive" },
  ],
  greetingStylePlaceholder: "e.g. Start every call by singing a short snippet from a random well-known song, then transition into a warm greeting",
  personalityPlaceholder: "e.g. Friendly and warm — talk like a helpful mate. Use Aussie slang like 'no worries', 'easy done', 'nice one'. Keep it brief and upbeat.",
  generalKnowledgePlaceholder: "e.g. You know Coffs Harbour — the beaches, the Big Banana, Park Beach, Sawtell. You know the local building scene and trades language.",
};

const DEFAULT_VOICE_SETTINGS = {
  name: "Iris",
  voice: "sage",
  greetingStyle: "Start every call by singing a short snippet (3-8 words) from a random well-known song, then smoothly transition into a warm greeting. Pick a different song every time — pop, rock, classic, 80s, 90s, anything catchy.",
  personality: "Friendly and warm — talk like a helpful mate, not a robot. Use 'hey', 'no worries', 'easy done', 'nice one'. Bright and positive — always upbeat, encouraging, and supportive. Keep it brief — this is a phone call. Use Australian English and throw in the occasional Aussie slang naturally — 'reckon', 'heaps', 'no dramas', 'too easy'.",
  generalKnowledge: "You know Coffs Harbour and the region — the beaches, the Big Banana, Park Beach, Sawtell, Woolgoolga. You know the local building scene — coastal builds deal with salt air corrosion, council approvals through Coffs Harbour City Council. You know the weather matters for trades work. You know the trades — sparkies, chippies, plumbers, concreters, roofers.",
  silenceDuration: 500,
  vadThreshold: 0.5,
  confirmWrites: true,
};

const DEFAULT_OUTBOUND_SETTINGS = {
  enabled: false, name: "Iris", voice: "sage",
  personality: "Professional and direct. Explain the urgent items clearly and ask if they can action them. Be respectful of their time.",
  greetingStyle: "Greet the person by name and explain you are calling from FieldOps about items that need their attention.",
  team: [
    { id: 1, name: "Tom Baker", phone: "+61400000001", role: "Site Manager", callEnabled: true },
    { id: 2, name: "Sarah Lee", phone: "+61400000002", role: "Project Manager", callEnabled: true },
  ],
  callRules: { minSeverity: "high", maxCallsPerDay: 3, callWindowStart: "07:00", callWindowEnd: "18:00" },
};

// ── Xero Settings Tab (extracted as a proper component to follow Rules of Hooks) ──
const XeroAccountMappingSection = ({ accent, xeroAccounts, setXeroAccounts, mappings, setMappings, onSaved, compact }) => {
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [mappingError, setMappingError] = useState(null);

  const cardStyle = { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
  const btnStyle = { padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Open Sans', sans-serif" };
  const selectStyle = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, background: "#fff", boxSizing: "border-box", fontFamily: "'Open Sans', sans-serif" };

  const revenueAccounts = (xeroAccounts || []).filter(a => a.type === "REVENUE");
  const expenseAccounts = (xeroAccounts || []).filter(a => a.type === "EXPENSE");

  const getMappingValue = (entityType, category = "") => {
    const m = mappings.find(x => x.entity_type === entityType && (x.category || "") === category);
    return m ? m.xero_account_code : "";
  };

  const setMappingValue = (entityType, category, accountCode) => {
    const accountList = entityType === "invoice" ? revenueAccounts : expenseAccounts;
    const account = accountList.find(a => a.code === accountCode);
    const accountName = account ? account.name : "";
    const existing = mappings.findIndex(x => x.entity_type === entityType && (x.category || "") === (category || ""));
    if (existing >= 0) {
      const updated = [...mappings];
      updated[existing] = { ...updated[existing], xero_account_code: accountCode, xero_account_name: accountName };
      setMappings(updated);
    } else {
      setMappings([...mappings, { entity_type: entityType, category: category || "", xero_account_code: accountCode, xero_account_name: accountName }]);
    }
  };

  const handleFetchAccounts = async () => {
    setFetchingAccounts(true);
    setMappingError(null);
    try {
      const result = await xeroFetchAccounts();
      setXeroAccounts(result.accounts || []);
    } catch (e) {
      setMappingError(e.message);
    } finally {
      setFetchingAccounts(false);
    }
  };

  const handleSaveMappings = async () => {
    const toSave = mappings.filter(m => m.xero_account_code);
    if (toSave.length === 0) {
      setMappingError("Select at least one account mapping before saving");
      return;
    }
    setSavingMappings(true);
    setMappingError(null);
    try {
      await xeroSaveMappings(toSave);
      setMappingSaved(true);
      setTimeout(() => setMappingSaved(false), 2500);
      if (onSaved) onSaved();
    } catch (e) {
      setMappingError(e.message);
    } finally {
      setSavingMappings(false);
    }
  };

  const renderAccountSelect = (entityType, category, label, accountList) => (
    <div key={`${entityType}-${category}`}>
      <label style={labelStyle}>{label}</label>
      <select
        value={getMappingValue(entityType, category)}
        onChange={e => setMappingValue(entityType, category, e.target.value)}
        style={selectStyle}
      >
        <option value="">— Select account —</option>
        {accountList.map(a => (
          <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div>
      {mappingError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
          {mappingError}
          <button onClick={() => setMappingError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14 }}>&times;</button>
        </div>
      )}
      {mappingSaved && (
        <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#166534" }}>
          Account mappings saved successfully.
        </div>
      )}

      {(!xeroAccounts || xeroAccounts.length === 0) ? (
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Pull your Chart of Accounts from Xero to configure which accounts invoices and bills sync to.</div>
          <button onClick={handleFetchAccounts} disabled={fetchingAccounts} style={{ ...btnStyle, background: accent, color: "#fff" }}>
            {fetchingAccounts ? "Fetching..." : "Fetch Accounts from Xero"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#666" }}>{xeroAccounts.length} accounts loaded from Xero ({revenueAccounts.length} revenue, {expenseAccounts.length} expense)</div>
            <button onClick={handleFetchAccounts} disabled={fetchingAccounts} style={{ ...btnStyle, background: "#f8f8f8", color: "#666", fontSize: 11, padding: "6px 12px" }}>
              {fetchingAccounts ? "Refreshing..." : "Refresh Accounts"}
            </button>
          </div>

          {/* Revenue Accounts (Invoices) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Revenue Accounts (Invoices)</div>
            <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 12 }}>
              {renderAccountSelect("invoice", "", "Default Invoice Account", revenueAccounts)}
            </div>
          </div>

          {/* Expense Accounts (Bills) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Expense Accounts (Bills)</div>
            <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 12 }}>
              {BILL_CATEGORIES.map(cat =>
                renderAccountSelect("bill", cat, cat, expenseAccounts)
              )}
            </div>
          </div>

          <button onClick={handleSaveMappings} disabled={savingMappings} style={{ ...btnStyle, background: accent, color: "#fff" }}>
            {savingMappings ? "Saving..." : "Save Mappings"}
          </button>
        </div>
      )}
    </div>
  );
};

const XeroSettingsTab = ({ accent }) => {
  const [xeroStatus, setXeroStatus] = useState(null);
  const [xeroLoading, setXeroLoading] = useState(true);
  const [xeroError, setXeroError] = useState(null);
  const [xeroSyncing, setXeroSyncing] = useState(false);
  const [xeroSyncResult, setXeroSyncResult] = useState(null);
  const [xeroMatchResults, setXeroMatchResults] = useState(null);
  const [xeroDryRun, setXeroDryRun] = useState(null);
  const [xeroSetupStep, setXeroSetupStep] = useState(0);
  const [xeroSyncLog, setXeroSyncLog] = useState([]);
  const [xeroPollResult, setXeroPollResult] = useState(null);
  const [xeroAccounts, setXeroAccounts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [mappingsLoaded, setMappingsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const status = await xeroOAuth("status");
        setXeroStatus(status);
        if (status?.connected) {
          const { data } = await supabase?.from("xero_sync_log").select("*").order("created_at", { ascending: false }).limit(10) || {};
          setXeroSyncLog(data || []);
          // Load existing mappings
          try {
            const result = await xeroGetMappings();
            setMappings(result.mappings || []);
            setMappingsLoaded(true);
          } catch { /* mappings table may not exist yet */ }
        }
      } catch (e) {
        setXeroError(e.message);
      } finally {
        setXeroLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    const codeVerifier = sessionStorage.getItem("xero_code_verifier");
    const redirectUri = sessionStorage.getItem("xero_redirect_uri");
    if (!codeVerifier || !redirectUri) return;
    window.history.replaceState({}, "", window.location.pathname);
    sessionStorage.removeItem("xero_code_verifier");
    sessionStorage.removeItem("xero_redirect_uri");
    (async () => {
      try {
        const result = await xeroOAuth("callback", { code, codeVerifier, redirectUri });
        if (result.chooseTenant) {
          const tenant = result.tenants[0];
          const selected = await xeroOAuth("selectTenant", { tenantId: tenant.tenantId, tenantName: tenant.tenantName, tokens: result.tokens });
          setXeroStatus({ connected: true, tenantName: selected.tenantName });
        } else {
          setXeroStatus({ connected: true, tenantName: result.tenantName });
        }
        setXeroSetupStep(1);
      } catch (e) {
        setXeroError(e.message);
      }
    })();
  }, []);

  const handleConnect = async () => {
    setXeroError(null);
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const result = await xeroOAuth("authorize", { redirectUri });
      sessionStorage.setItem("xero_code_verifier", result.codeVerifier);
      sessionStorage.setItem("xero_redirect_uri", redirectUri);
      window.location.href = result.authUrl;
    } catch (e) { setXeroError(e.message); }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect from Xero? Existing sync data will be preserved.")) return;
    setXeroError(null);
    try { await xeroOAuth("disconnect"); setXeroStatus({ connected: false }); } catch (e) { setXeroError(e.message); }
  };

  const runContactMatch = async () => {
    setXeroSyncing(true);
    try { setXeroMatchResults(await xeroSyncContact("match")); } catch (e) { setXeroError(e.message); } finally { setXeroSyncing(false); }
  };

  const confirmMatches = async (matches) => {
    try {
      const confirmed = matches.filter(m => m.confirmed && m.xeroMatch);
      await xeroSyncContact("confirmMatches", null, null, { matches: confirmed.map(m => ({ entityType: m.entityType, entityId: m.entityId, xeroContactId: m.xeroMatch.contactId })) });
      setXeroSetupStep(2);
    } catch (e) { setXeroError(e.message); }
  };

  const runDryRun = async () => {
    setXeroSyncing(true);
    try { const inv = await xeroSyncInvoice("dry_run"); const bill = await xeroSyncBill("dry_run"); setXeroDryRun({ invoices: inv, bills: bill }); } catch (e) { setXeroError(e.message); } finally { setXeroSyncing(false); }
  };

  const runBulkSync = async (type) => {
    setXeroSyncing(true); setXeroSyncResult(null);
    try { const result = type === "invoices" ? await xeroSyncInvoice("bulk_push") : await xeroSyncBill("bulk_push"); setXeroSyncResult({ type, ...result }); } catch (e) { setXeroError(e.message); } finally { setXeroSyncing(false); }
  };

  const handlePoll = async () => {
    setXeroSyncing(true);
    try { setXeroPollResult(await xeroPollUpdates()); } catch (e) { setXeroError(e.message); } finally { setXeroSyncing(false); }
  };

  if (xeroLoading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading Xero status...</div>;

  const cardStyle = { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
  const btnStyle = { padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Open Sans', sans-serif" };

  // Build current mapping summary for display
  const getMappingSummary = (entityType, category = "") => {
    const m = mappings.find(x => x.entity_type === entityType && (x.category || "") === category);
    return m ? `${m.xero_account_code} — ${m.xero_account_name}` : null;
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 4 }}>Xero Accounting Integration</div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>Sync invoices, bills, and contacts with your Xero organisation</div>
      {xeroError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="notification" size={14} /> {xeroError}
          <button onClick={() => setXeroError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14 }}>&times;</button>
        </div>
      )}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: xeroStatus?.connected ? "#ecfdf5" : "#f8f8f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: xeroStatus?.connected ? "#16a34a" : "#888" }}>X</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{xeroStatus?.connected ? `Connected to ${xeroStatus.tenantName}` : "Not connected"}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{xeroStatus?.connected ? `Connected ${xeroStatus.connectedAt ? new Date(xeroStatus.connectedAt).toLocaleDateString() : ""}` : "Connect to your Xero organisation to start syncing"}</div>
            </div>
          </div>
          {xeroStatus?.connected
            ? <button onClick={handleDisconnect} style={{ ...btnStyle, background: "#fee2e2", color: "#dc2626" }}>Disconnect</button>
            : <button onClick={handleConnect} style={{ ...btnStyle, background: accent, color: "#fff" }}>Connect to Xero</button>}
        </div>
      </div>
      {xeroStatus?.connected && xeroSetupStep > 0 && xeroSetupStep <= 4 && (
        <div style={{ ...cardStyle, border: `2px solid ${accent}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 4 }}>Setup Wizard — Step {xeroSetupStep} of 4</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
            {xeroSetupStep === 1 && "Match your existing contacts with Xero to avoid duplicates"}
            {xeroSetupStep === 2 && "Map your Xero account codes for invoices and bills"}
            {xeroSetupStep === 3 && "Mark items that are already in Xero to skip during sync"}
            {xeroSetupStep === 4 && "Preview what will be synced before running"}
          </div>
          {xeroSetupStep === 1 && (<div>{!xeroMatchResults ? <button onClick={runContactMatch} disabled={xeroSyncing} style={{ ...btnStyle, background: accent, color: "#fff" }}>{xeroSyncing ? "Matching..." : "Run Contact Matching"}</button> : (<div><div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Found {xeroMatchResults.xeroContactCount} contacts in Xero. {xeroMatchResults.matches?.length || 0} FieldOps contacts to review.</div>{(xeroMatchResults.matches || []).map((m, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}><input type="checkbox" checked={m.confirmed || false} onChange={() => { const updated = [...xeroMatchResults.matches]; updated[i] = { ...updated[i], confirmed: !updated[i].confirmed }; setXeroMatchResults({ ...xeroMatchResults, matches: updated }); }} /><div style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{m.name}</span><span style={{ color: "#888", marginLeft: 8 }}>({m.entityType})</span></div><div style={{ flex: 1, color: m.xeroMatch ? "#16a34a" : "#888" }}>{m.xeroMatch ? `→ ${m.xeroMatch.name} (${m.xeroMatch.confidence})` : "No match — will create new"}</div></div>))}<div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={() => confirmMatches(xeroMatchResults.matches)} style={{ ...btnStyle, background: accent, color: "#fff" }}>Confirm & Continue</button><button onClick={() => setXeroSetupStep(2)} style={{ ...btnStyle, background: "#f0f0f0", color: "#333" }}>Skip</button></div></div>)}</div>)}
          {xeroSetupStep === 2 && (
            <div>
              <XeroAccountMappingSection
                accent={accent}
                xeroAccounts={xeroAccounts}
                setXeroAccounts={setXeroAccounts}
                mappings={mappings}
                setMappings={setMappings}
                onSaved={() => {}}
                compact={false}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => setXeroSetupStep(3)} style={{ ...btnStyle, background: accent, color: "#fff" }}>Continue</button>
                <button onClick={() => setXeroSetupStep(3)} style={{ ...btnStyle, background: "#f0f0f0", color: "#333" }}>Skip</button>
              </div>
            </div>
          )}
          {xeroSetupStep === 3 && (<div><div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>If any invoices or bills have already been entered in Xero manually, mark them here to prevent duplicates.</div><div style={{ display: "flex", gap: 8 }}><button onClick={() => setXeroSetupStep(4)} style={{ ...btnStyle, background: accent, color: "#fff" }}>Continue to Preview</button><button onClick={() => setXeroSetupStep(4)} style={{ ...btnStyle, background: "#f0f0f0", color: "#333" }}>Skip — None to mark</button></div></div>)}
          {xeroSetupStep === 4 && (<div>{!xeroDryRun ? <button onClick={runDryRun} disabled={xeroSyncing} style={{ ...btnStyle, background: accent, color: "#fff" }}>{xeroSyncing ? "Checking..." : "Preview Sync"}</button> : (<div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}><div style={{ background: "#f0fdf4", borderRadius: 8, padding: 12 }}><div style={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>{xeroDryRun.invoices?.wouldSync || 0}</div><div style={{ fontSize: 11, color: "#666" }}>Invoices to sync</div></div><div style={{ background: "#eff6ff", borderRadius: 8, padding: 12 }}><div style={{ fontSize: 24, fontWeight: 700, color: "#2563eb" }}>{xeroDryRun.bills?.wouldSync || 0}</div><div style={{ fontSize: 11, color: "#666" }}>Bills to sync</div></div></div><div style={{ display: "flex", gap: 8 }}><button onClick={() => { runBulkSync("invoices"); runBulkSync("bills"); setXeroSetupStep(0); }} style={{ ...btnStyle, background: accent, color: "#fff" }}>Start Sync</button><button onClick={() => setXeroSetupStep(0)} style={{ ...btnStyle, background: "#f0f0f0", color: "#333" }}>Close Wizard</button></div></div>)}</div>)}
        </div>
      )}
      {xeroStatus?.connected && xeroSetupStep === 0 && (
        <>
          {/* Account Mapping Section */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 4 }}>Account Mapping</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Configure which Xero accounts invoices and bills are posted to</div>
            {/* Current mappings summary */}
            {mappings.length > 0 && !xeroAccounts.length && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  {getMappingSummary("invoice") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} />
                      <span style={{ fontWeight: 600, minWidth: 140 }}>Invoices:</span>
                      <span style={{ color: "#333" }}>{getMappingSummary("invoice")}</span>
                    </div>
                  )}
                  {BILL_CATEGORIES.map(cat => {
                    const summary = getMappingSummary("bill", cat);
                    return summary ? (
                      <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} />
                        <span style={{ fontWeight: 600, minWidth: 140 }}>Bills ({cat}):</span>
                        <span style={{ color: "#333" }}>{summary}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
            <XeroAccountMappingSection
              accent={accent}
              xeroAccounts={xeroAccounts}
              setXeroAccounts={setXeroAccounts}
              mappings={mappings}
              setMappings={setMappings}
              compact={false}
            />
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 16 }}>Sync Actions</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => runBulkSync("invoices")} disabled={xeroSyncing} style={{ ...btnStyle, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>{xeroSyncing ? "Syncing..." : "Sync All Invoices"}</button>
              <button onClick={() => runBulkSync("bills")} disabled={xeroSyncing} style={{ ...btnStyle, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }}>{xeroSyncing ? "Syncing..." : "Sync All Bills"}</button>
              <button onClick={handlePoll} disabled={xeroSyncing} style={{ ...btnStyle, background: "#faf5ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}>{xeroSyncing ? "Checking..." : "Check for Updates"}</button>
              <button onClick={() => setXeroSetupStep(1)} style={{ ...btnStyle, background: "#f8f8f8", color: "#666" }}>Re-run Setup Wizard</button>
            </div>
            {xeroSyncResult && <div style={{ marginTop: 12, background: xeroSyncResult.errors > 0 ? "#fffbeb" : "#f0fdf4", borderRadius: 8, padding: 12, fontSize: 12 }}><span style={{ fontWeight: 600 }}>{xeroSyncResult.type}:</span> {xeroSyncResult.synced} synced, {xeroSyncResult.errors} errors, {xeroSyncResult.total} total</div>}
            {xeroPollResult && <div style={{ marginTop: 12, background: "#f0fdf4", borderRadius: 8, padding: 12, fontSize: 12 }}><span style={{ fontWeight: 600 }}>Updates:</span> {xeroPollResult.invoices?.updated || 0} invoices, {xeroPollResult.bills?.updated || 0} bills updated</div>}
          </div>
          {xeroSyncLog.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 12 }}>Recent Sync Activity</div>
              {xeroSyncLog.map((log, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < xeroSyncLog.length - 1 ? "1px solid #f0f0f0" : "none", fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: log.status === "success" ? "#16a34a" : log.status === "error" ? "#dc2626" : "#f59e0b" }} />
                  <div style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{log.entity_type}</span><span style={{ color: "#888", marginLeft: 4 }}>{log.direction}</span></div>
                  <div style={{ color: log.status === "error" ? "#dc2626" : "#888", fontSize: 11 }}>{log.error_message ? log.error_message.slice(0, 50) : log.status}</div>
                  <div style={{ color: "#aaa", fontSize: 10 }}>{log.created_at ? new Date(log.created_at).toLocaleString() : ""}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── My Assistant (per-user personalisation) ─────────────────────────────────
const MyAssistant = () => {
  const auth = useAuth();
  const accent = SECTION_COLORS.assistant?.accent || "#6366f1";

  const [defaults, setDefaults] = useState({ inbound: DEFAULT_VOICE_SETTINGS, outbound: DEFAULT_OUTBOUND_SETTINGS });
  const [personalised, setPersonalised] = useState({ inbound: false, outbound: false });
  const [inboundSettings, setInboundSettings] = useState(DEFAULT_VOICE_SETTINGS);
  const [outboundSettings, setOutboundSettings] = useState(DEFAULT_OUTBOUND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inbound");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load: 1) admin defaults, 2) user overrides
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let inDef = DEFAULT_VOICE_SETTINGS;
      let outDef = DEFAULT_OUTBOUND_SETTINGS;

      // Load admin defaults
      if (supabase && auth.user) {
        try {
          const { data: defs } = await supabase.from('voice_settings_defaults').select('*');
          const inRow = defs?.find(d => d.type === 'inbound');
          const outRow = defs?.find(d => d.type === 'outbound');
          if (inRow?.settings) inDef = { ...DEFAULT_VOICE_SETTINGS, ...inRow.settings };
          if (outRow?.settings) outDef = { ...DEFAULT_OUTBOUND_SETTINGS, ...outRow.settings };
        } catch (err) {
          console.warn("Could not load voice defaults:", err.message);
        }
      }
      if (!cancelled) setDefaults({ inbound: inDef, outbound: outDef });

      // Load user overrides
      if (supabase && auth.user) {
        try {
          const { data: userSettings } = await supabase.from('voice_settings')
            .select('*').eq('user_id', auth.user.id);

          const userIn = userSettings?.find(s => s.type === 'inbound');
          const userOut = userSettings?.find(s => s.type === 'outbound');

          if (!cancelled) {
            setPersonalised({
              inbound: userIn?.personalised || false,
              outbound: userOut?.personalised || false,
            });
            setInboundSettings(userIn?.personalised ? { ...DEFAULT_VOICE_SETTINGS, ...userIn.settings } : inDef);
            setOutboundSettings(userOut?.personalised ? { ...DEFAULT_OUTBOUND_SETTINGS, ...userOut.settings } : outDef);
          }
        } catch (err) {
          console.warn("Could not load user voice settings:", err.message);
          if (!cancelled) {
            setInboundSettings(inDef);
            setOutboundSettings(outDef);
          }
        }
      } else {
        // localStorage fallback
        try {
          const localIn = localStorage.getItem("fieldops_voice_settings");
          if (localIn) {
            const parsed = JSON.parse(localIn);
            if (!cancelled) setInboundSettings({ ...DEFAULT_VOICE_SETTINGS, ...parsed });
          }
        } catch {}
        try {
          const localOut = localStorage.getItem("fieldops_outbound_settings");
          if (localOut && !cancelled) setOutboundSettings({ ...DEFAULT_OUTBOUND_SETTINGS, ...JSON.parse(localOut) });
        } catch {}
      }

      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  // Toggle personalisation
  const togglePersonalised = async (type) => {
    const newVal = !personalised[type];
    setPersonalised(prev => ({ ...prev, [type]: newVal }));

    if (!newVal) {
      // Turning off: revert to admin defaults
      if (type === 'inbound') setInboundSettings({ ...defaults.inbound });
      else setOutboundSettings({ ...defaults.outbound });
    }

    // Save the toggle state
    if (supabase && auth.user) {
      const settings = type === 'inbound' ? inboundSettings : outboundSettings;
      try {
        await supabase.from('voice_settings').upsert({
          user_id: auth.user.id, type, personalised: newVal,
          settings: newVal ? settings : {}, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,type' });
      } catch (err) {
        console.warn("Could not save personalisation toggle:", err.message);
      }
    }
    setDirty(false);
    setSaved(false);
  };

  // Save personalised settings
  const saveSettings = async (type) => {
    const settings = type === 'inbound' ? inboundSettings : outboundSettings;
    if (supabase && auth.user) {
      try {
        await supabase.from('voice_settings').upsert({
          user_id: auth.user.id, type, personalised: true,
          settings, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,type' });
      } catch (err) {
        console.warn("Could not save personalised voice settings:", err.message);
      }
    }
    localStorage.setItem(type === 'inbound' ? "fieldops_voice_settings" : "fieldops_outbound_settings", JSON.stringify(settings));
    setSaved(true); setDirty(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateInbound = (key, value) => { setInboundSettings(prev => ({ ...prev, [key]: value })); setDirty(true); setSaved(false); };
  const updateOutbound = (key, value) => { setOutboundSettings(prev => ({ ...prev, [key]: value })); setDirty(true); setSaved(false); };

  const cardStyle = { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 };
  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" };
  const textareaStyle = { width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box" };
  const disabledInputStyle = { ...inputStyle, background: "#f5f5f5", color: "#999", cursor: "not-allowed" };
  const disabledTextareaStyle = { ...textareaStyle, background: "#f5f5f5", color: "#999", cursor: "not-allowed" };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>;

  const isPersonalised = personalised[activeTab];
  const currentSettings = activeTab === 'inbound' ? inboundSettings : outboundSettings;
  const currentDefaults = defaults[activeTab];
  const updateFn = activeTab === 'inbound' ? updateInbound : updateOutbound;

  return (
    <div>
      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #e8e8e8", paddingBottom: 0 }}>
        {[{ id: "inbound", label: "Inbound" }, { id: "outbound", label: "Outbound" }].map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setDirty(false); setSaved(false); }} className="btn" style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", fontSize: 13, fontWeight: 600,
            border: "none", borderBottom: activeTab === t.id ? `2px solid ${accent}` : "2px solid transparent",
            borderRadius: 0, background: "transparent", color: activeTab === t.id ? "#111" : "#888",
            cursor: "pointer", transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Personalisation toggle */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Personalise my {activeTab} assistant</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
            {isPersonalised ? "Your custom settings are active." : "When off, the company default settings apply. Turn on to customise your own assistant."}
          </div>
        </div>
        <button onClick={() => togglePersonalised(activeTab)} style={{
          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s",
          background: isPersonalised ? accent : "#ccc",
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, transition: "left 0.2s",
            left: isPersonalised ? 23 : 3, boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </button>
      </div>

      {/* Saved banner */}
      {saved && (
        <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} /> Settings saved. Changes will apply to the next call.
        </div>
      )}

      {!isPersonalised && (
        <div style={{ background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 10, padding: "14px 20px", marginBottom: 16, fontSize: 12, color: "#888" }}>
          Company Defaults — these settings are managed by your admin.
        </div>
      )}

      {/* Assistant Name */}
      <div style={cardStyle}>
        <div style={labelStyle}>Assistant Name</div>
        {isPersonalised ? (
          <input type="text" value={currentSettings.name} onChange={e => updateFn("name", e.target.value)} placeholder="e.g. Iris, Billy, Sage" style={{ ...inputStyle, maxWidth: 300 }} />
        ) : (
          <input type="text" value={currentDefaults.name} disabled style={{ ...disabledInputStyle, maxWidth: 300 }} />
        )}
        <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>The name your assistant introduces itself as on calls</div>
      </div>

      {/* Voice Selection */}
      <div style={cardStyle}>
        <div style={labelStyle}>Voice</div>
        {activeTab === 'inbound' ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, opacity: isPersonalised ? 1 : 0.6, pointerEvents: isPersonalised ? "auto" : "none" }}>
            {VOICE_OPTIONS.voices.map(v => (
              <VoiceOptionCard key={v.id} option={v} selected={(isPersonalised ? currentSettings : currentDefaults).voice === v.id} onSelect={() => updateFn("voice", v.id)} accent={accent} />
            ))}
          </div>
        ) : (
          isPersonalised ? (
            <select value={currentSettings.voice} onChange={e => updateFn("voice", e.target.value)} style={{ ...inputStyle, maxWidth: 400 }}>
              {VOICE_OPTIONS.voices.map(v => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
            </select>
          ) : (
            <select value={currentDefaults.voice} disabled style={{ ...disabledInputStyle, maxWidth: 400 }}>
              {VOICE_OPTIONS.voices.map(v => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
            </select>
          )
        )}
      </div>

      {/* Greeting Style */}
      <div style={cardStyle}>
        <div style={labelStyle}>Greeting Style</div>
        {isPersonalised ? (
          <textarea value={currentSettings.greetingStyle} onChange={e => updateFn("greetingStyle", e.target.value)} placeholder={VOICE_OPTIONS.greetingStylePlaceholder} rows={3} style={textareaStyle} />
        ) : (
          <textarea value={currentDefaults.greetingStyle || ""} disabled rows={3} style={disabledTextareaStyle} />
        )}
      </div>

      {/* Personality */}
      <div style={cardStyle}>
        <div style={labelStyle}>Personality</div>
        {isPersonalised ? (
          <textarea value={currentSettings.personality} onChange={e => updateFn("personality", e.target.value)} placeholder={VOICE_OPTIONS.personalityPlaceholder} rows={3} style={textareaStyle} />
        ) : (
          <textarea value={currentDefaults.personality || ""} disabled rows={3} style={disabledTextareaStyle} />
        )}
      </div>

      {/* General Knowledge — inbound only */}
      {activeTab === 'inbound' && (
        <div style={cardStyle}>
          <div style={labelStyle}>General Knowledge</div>
          {isPersonalised ? (
            <textarea value={currentSettings.generalKnowledge} onChange={e => updateFn("generalKnowledge", e.target.value)} placeholder={VOICE_OPTIONS.generalKnowledgePlaceholder} rows={3} style={textareaStyle} />
          ) : (
            <textarea value={currentDefaults.generalKnowledge || ""} disabled rows={3} style={disabledTextareaStyle} />
          )}
          <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Any background knowledge your assistant should have — local area, industry, etc.</div>
        </div>
      )}

      {/* Save button — only when personalised and dirty */}
      {isPersonalised && dirty && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 12, fontWeight: 600 }} onClick={() => saveSettings(activeTab)}>
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
};

const VoiceOptionCard = ({ option, selected, onSelect, accent }) => (
  <div
    onClick={onSelect}
    style={{
      padding: "12px 16px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
      border: selected ? `2px solid ${accent}` : "2px solid #e8e8e8",
      background: selected ? hexToRgba(accent, 0.06) : "#fff",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 16, height: 16, borderRadius: "50%", border: selected ? `5px solid ${accent}` : "2px solid #ccc",
        background: "#fff", flexShrink: 0,
      }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "#111" : "#333" }}>{option.label}</div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{option.desc}</div>
      </div>
    </div>
  </div>
);


const Settings = () => {
  const { staff, setStaff, templates, setTemplates, companyInfo, setCompanyInfo } = useAppStore();
  const auth = useAuth();
  const [tab, setTab] = useState("company");
  // Template management state
  const [docType, setDocType] = useState("quote");
  const [editTemplate, setEditTemplate] = useState(null);
  const [tplForm, setTplForm] = useState(null);
  // Company info state
  const [companyForm, setCompanyForm] = useState({ ...companyInfo });
  const [companyDirty, setCompanyDirty] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const updateCompanyField = (key, value) => { setCompanyForm(f => ({ ...f, [key]: value })); setCompanyDirty(true); setCompanySaved(false); };
  const saveCompanyInfo = () => {
    setCompanyInfo(companyForm);
    localStorage.setItem("fieldops_company_info", JSON.stringify(companyForm));
    setCompanyDirty(false); setCompanySaved(true);
    setTimeout(() => setCompanySaved(false), 2500);
  };
  const [voiceSettings, setVoiceSettings] = useState(DEFAULT_VOICE_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(true);

  // Load inbound voice defaults from voice_settings_defaults table (admin = company defaults)
  useEffect(() => {
    let cancelled = false;
    const loadInbound = async () => {
      setVoiceLoading(true);
      try {
        if (supabase && auth.user) {
          const { data } = await supabase.from('voice_settings_defaults')
            .select('settings').eq('type', 'inbound').single();
          if (!cancelled && data?.settings) {
            setVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, ...data.settings });
            setVoiceLoading(false);
            return;
          }
        }
        // Fallback: migrate from localStorage
        try {
          const local = localStorage.getItem("fieldops_voice_settings");
          if (local) {
            const parsed = JSON.parse(local);
            if (parsed.localKnowledge && !parsed.generalKnowledge) {
              parsed.generalKnowledge = parsed.localKnowledge;
              delete parsed.localKnowledge;
            }
            if (!cancelled) setVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, ...parsed });
          }
        } catch {}
      } catch (err) {
        console.warn("Could not load inbound voice defaults from DB:", err.message);
        // Fallback to localStorage
        try {
          const local = localStorage.getItem("fieldops_voice_settings");
          if (local && !cancelled) setVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(local) });
        } catch {}
      }
      if (!cancelled) setVoiceLoading(false);
    };
    loadInbound();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  const updateVoice = (key, value) => {
    setVoiceSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const saveVoiceSettings = async () => {
    // Save to voice_settings_defaults (company defaults)
    if (supabase && auth.user) {
      try {
        await supabase.from('voice_settings_defaults').upsert({
          type: 'inbound', settings: voiceSettings, updated_at: new Date().toISOString()
        }, { onConflict: 'type' });
      } catch (err) {
        console.warn("Could not save inbound voice defaults to DB:", err.message);
      }
    }
    // Keep localStorage as fallback
    localStorage.setItem("fieldops_voice_settings", JSON.stringify(voiceSettings));
    // Push settings to voice server so they apply on next call
    const voiceServerUrl = import.meta.env.VITE_VOICE_SERVER_URL;
    if (voiceServerUrl) {
      try {
        await fetch(`${voiceServerUrl}/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(voiceSettings),
        });
      } catch (err) {
        console.warn("Could not sync settings to voice server:", err.message);
      }
    }
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const resetVoiceSettings = () => {
    setVoiceSettings(DEFAULT_VOICE_SETTINGS);
    setDirty(true);
    setSaved(false);
  };

  const accent = SECTION_COLORS.settings.accent;

  const tabs = [
    { id: "company", label: "Company", icon: "clients" },
    { id: "integrations", label: "Inbound Calls", icon: "send" },
    { id: "outbound", label: "Outbound Calls", icon: "notification" },
    { id: "templates", label: "Templates", icon: "quotes" },
    ...(auth.isAdmin || auth.isLocalDev ? [{ id: "xero", label: "Xero", icon: "send" }] : []),
    ...(auth.isAdmin || auth.isLocalDev ? [{ id: "users", label: "Users", icon: "clients" }] : []),
  ];

  // Outbound call settings state
  const [outboundSettings, setOutboundSettings] = useState(DEFAULT_OUTBOUND_SETTINGS);
  const [outboundDirty, setOutboundDirty] = useState(false);
  const [outboundSaved, setOutboundSaved] = useState(false);
  const [outboundLoading, setOutboundLoading] = useState(true);

  // Load outbound voice defaults from voice_settings_defaults table (admin = company defaults)
  useEffect(() => {
    let cancelled = false;
    const loadOutbound = async () => {
      setOutboundLoading(true);
      try {
        if (supabase && auth.user) {
          const { data } = await supabase.from('voice_settings_defaults')
            .select('settings').eq('type', 'outbound').single();
          if (!cancelled && data?.settings) {
            setOutboundSettings({ ...DEFAULT_OUTBOUND_SETTINGS, ...data.settings });
            setOutboundLoading(false);
            return;
          }
        }
        // Fallback: migrate from localStorage
        try {
          const local = localStorage.getItem("fieldops_outbound_settings");
          if (local && !cancelled) setOutboundSettings(JSON.parse(local));
        } catch {}
      } catch (err) {
        console.warn("Could not load outbound voice defaults from DB:", err.message);
        try {
          const local = localStorage.getItem("fieldops_outbound_settings");
          if (local && !cancelled) setOutboundSettings(JSON.parse(local));
        } catch {}
      }
      if (!cancelled) setOutboundLoading(false);
    };
    loadOutbound();
    return () => { cancelled = true; };
  }, [auth.user?.id]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editTeamMember, setEditTeamMember] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: "", phone: "", role: "" });
  const [testCallStatus, setTestCallStatus] = useState(null);

  const updateOutbound = (key, value) => { setOutboundSettings(prev => ({ ...prev, [key]: value })); setOutboundDirty(true); setOutboundSaved(false); };
  const updateCallRule = (key, value) => { setOutboundSettings(prev => ({ ...prev, callRules: { ...prev.callRules, [key]: value } })); setOutboundDirty(true); setOutboundSaved(false); };
  const saveOutboundSettings = async () => {
    // Save to voice_settings_defaults (company defaults)
    if (supabase && auth.user) {
      try {
        await supabase.from('voice_settings_defaults').upsert({
          type: 'outbound', settings: outboundSettings, updated_at: new Date().toISOString()
        }, { onConflict: 'type' });
      } catch (err) {
        console.warn("Could not save outbound voice defaults to DB:", err.message);
      }
    }
    // Keep localStorage as fallback
    localStorage.setItem("fieldops_outbound_settings", JSON.stringify(outboundSettings));
    const voiceServerUrl = import.meta.env.VITE_VOICE_SERVER_URL;
    if (voiceServerUrl) {
      try { await fetch(`${voiceServerUrl}/outbound-settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outboundSettings) }); } catch (err) { console.warn("Could not sync outbound settings:", err.message); }
    }
    setOutboundSaved(true); setOutboundDirty(false);
    setTimeout(() => setOutboundSaved(false), 2500);
  };
  const openNewTeamMember = () => { setEditTeamMember(null); setTeamForm({ name: "", phone: "", role: "" }); setShowTeamModal(true); };
  const openEditTeamMember = (m) => { setEditTeamMember(m); setTeamForm({ name: m.name, phone: m.phone, role: m.role }); setShowTeamModal(true); };
  const saveTeamMember = () => {
    if (!teamForm.name.trim() || !teamForm.phone.trim()) return;
    if (editTeamMember) {
      updateOutbound("team", outboundSettings.team.map(m => m.id === editTeamMember.id ? { ...m, ...teamForm } : m));
    } else {
      updateOutbound("team", [...outboundSettings.team, { id: Date.now(), ...teamForm, callEnabled: true }]);
    }
    setShowTeamModal(false);
  };
  const removeTeamMember = (id) => updateOutbound("team", outboundSettings.team.filter(m => m.id !== id));
  const toggleTeamMemberCall = (id) => updateOutbound("team", outboundSettings.team.map(m => m.id === id ? { ...m, callEnabled: !m.callEnabled } : m));
  const triggerTestCall = async (member) => {
    const voiceServerUrl = import.meta.env.VITE_VOICE_SERVER_URL;
    if (!voiceServerUrl) { setTestCallStatus("Configure VITE_VOICE_SERVER_URL"); return; }
    setTestCallStatus(`Calling ${member.name}...`);
    try {
      const res = await fetch(`${voiceServerUrl}/outbound-call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: member.phone, teamMemberName: member.name, tasks: [{ title: "Test call", detail: "This is a test call from FieldOps" }] }) });
      const data = await res.json();
      setTestCallStatus(data.ok ? `Call initiated (${data.callSid?.slice(-6)})` : `Failed: ${data.error}`);
    } catch (err) { setTestCallStatus(`Failed: ${err.message}`); }
    setTimeout(() => setTestCallStatus(null), 5000);
  };

  const voiceIntegrationContent = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Voice Assistant</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Configure your Iris voice assistant — powered by OpenAI Realtime + Twilio</div>
          <div style={{ fontSize: 11, color: "#b0b0b0", marginTop: 4 }}>These are the company defaults. Staff can personalise their own assistant in My Assistant.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetVoiceSettings} style={{ fontSize: 11 }}>Reset Defaults</button>
          <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: dirty ? 1 : 0.5 }} onClick={saveVoiceSettings} disabled={!dirty}>
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>

      {saved && (
        <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} /> Voice settings saved. Changes will apply to the next call.
        </div>
      )}

      {/* Assistant Name */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Assistant Name</div>
        <input
          type="text" value={voiceSettings.name}
          onChange={e => updateVoice("name", e.target.value)}
          placeholder="e.g. Iris, Billy, Sage"
          style={{ width: "100%", maxWidth: 300, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif" }}
        />
        <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>The name your assistant introduces itself as on calls</div>
      </div>

      {/* Voice Selection */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Voice</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {VOICE_OPTIONS.voices.map(v => (
            <VoiceOptionCard key={v.id} option={v} selected={voiceSettings.voice === v.id} onSelect={() => updateVoice("voice", v.id)} accent={accent} />
          ))}
        </div>
      </div>

      {/* Greeting Style */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Greeting Style</div>
        <textarea
          value={voiceSettings.greetingStyle}
          onChange={e => updateVoice("greetingStyle", e.target.value)}
          placeholder={VOICE_OPTIONS.greetingStylePlaceholder}
          rows={3}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Describe how Iris should greet callers</div>
      </div>

      {/* Personality */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Personality</div>
        <textarea
          value={voiceSettings.personality}
          onChange={e => updateVoice("personality", e.target.value)}
          placeholder={VOICE_OPTIONS.personalityPlaceholder}
          rows={3}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Describe the tone, style, and personality of your assistant</div>
      </div>

      {/* General Knowledge */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>General Knowledge</div>
        <textarea
          value={voiceSettings.generalKnowledge}
          onChange={e => updateVoice("generalKnowledge", e.target.value)}
          placeholder={VOICE_OPTIONS.generalKnowledgePlaceholder}
          rows={3}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Any background knowledge your assistant should have — local area, industry, etc.</div>
      </div>

      {/* Advanced Settings */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 16 }}>Advanced</div>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Confirm before writing</div>
              <div style={{ fontSize: 11, color: "#888" }}>Ask for confirmation before creating or updating records</div>
            </div>
            <button
              onClick={() => updateVoice("confirmWrites", !voiceSettings.confirmWrites)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s",
                background: voiceSettings.confirmWrites ? accent : "#ccc",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, transition: "left 0.2s",
                left: voiceSettings.confirmWrites ? 23 : 3, boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Silence detection (ms)</div>
                <div style={{ fontSize: 11, color: "#888" }}>How long to wait after the caller stops speaking before responding</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: accent, minWidth: 50, textAlign: "right" }}>{voiceSettings.silenceDuration}ms</span>
            </div>
            <input
              type="range" min={200} max={1500} step={100} value={voiceSettings.silenceDuration}
              onChange={e => updateVoice("silenceDuration", Number(e.target.value))}
              style={{ width: "100%", maxWidth: 400, accentColor: accent }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 400, fontSize: 10, color: "#bbb" }}>
              <span>200ms (fast)</span><span>1500ms (patient)</span>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Voice detection sensitivity</div>
                <div style={{ fontSize: 11, color: "#888" }}>How sensitive the mic is to picking up speech (lower = more sensitive)</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: accent, minWidth: 50, textAlign: "right" }}>{voiceSettings.vadThreshold}</span>
            </div>
            <input
              type="range" min={0.1} max={0.9} step={0.1} value={voiceSettings.vadThreshold}
              onChange={e => updateVoice("vadThreshold", Number(e.target.value))}
              style={{ width: "100%", maxWidth: 400, accentColor: accent }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 400, fontSize: 10, color: "#bbb" }}>
              <span>0.1 (very sensitive)</span><span>0.9 (less sensitive)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Config Summary */}
      <div style={{ background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Current Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, fontSize: 12 }}>
          <div><span style={{ color: "#888" }}>Name:</span> <span style={{ fontWeight: 600 }}>{voiceSettings.name}</span></div>
          <div><span style={{ color: "#888" }}>Voice:</span> <span style={{ fontWeight: 600 }}>{VOICE_OPTIONS.voices.find(v => v.id === voiceSettings.voice)?.label || voiceSettings.voice}</span></div>
          <div><span style={{ color: "#888" }}>Greeting:</span> <span style={{ fontWeight: 600 }}>{voiceSettings.greetingStyle ? (voiceSettings.greetingStyle.length > 60 ? voiceSettings.greetingStyle.slice(0, 60) + "…" : voiceSettings.greetingStyle) : "Not set"}</span></div>
          <div><span style={{ color: "#888" }}>Personality:</span> <span style={{ fontWeight: 600 }}>{voiceSettings.personality ? (voiceSettings.personality.length > 60 ? voiceSettings.personality.slice(0, 60) + "…" : voiceSettings.personality) : "Not set"}</span></div>
          <div><span style={{ color: "#888" }}>General Knowledge:</span> <span style={{ fontWeight: 600 }}>{voiceSettings.generalKnowledge ? (voiceSettings.generalKnowledge.length > 60 ? voiceSettings.generalKnowledge.slice(0, 60) + "…" : voiceSettings.generalKnowledge) : "Not set"}</span></div>
          <div><span style={{ color: "#888" }}>Silence:</span> <span style={{ fontWeight: 600 }}>{voiceSettings.silenceDuration}ms</span></div>
        </div>
      </div>
    </div>
  );

  const PERMISSION_SECTIONS = [
    { id: "dashboard", label: "Dashboard", actions: ["view"] },
    { id: "actions", label: "Actions", actions: ["view"] },
    { id: "schedule", label: "Schedule", actions: ["view", "create", "edit", "delete"] },
    { id: "reminders", label: "Reminders", actions: ["view", "create", "edit", "delete"] },
    { id: "jobs", label: "Jobs", actions: ["view", "create", "edit", "delete"] },
    { id: "orders", label: "Orders", actions: ["view", "create", "edit", "delete", "approve", "send"] },
    { id: "time", label: "Time Tracking", actions: ["view", "create", "edit", "delete"] },
    { id: "bills", label: "Bills", actions: ["view", "create", "edit", "delete", "approve"] },
    { id: "quotes", label: "Quotes", actions: ["view", "create", "edit", "delete", "send"] },
    { id: "invoices", label: "Invoices", actions: ["view", "create", "edit", "delete", "send"] },
    { id: "clients", label: "Clients", actions: ["view", "create", "edit", "delete"] },
    { id: "contractors", label: "Contractors", actions: ["view", "create", "edit", "delete", "manage"] },
    { id: "suppliers", label: "Suppliers", actions: ["view", "create", "edit", "delete"] },
    { id: "settings", label: "Settings", actions: ["view", "edit"] },
  ];
  const ACTION_LABELS = { view: "View", create: "Create", edit: "Edit", delete: "Delete", approve: "Approve", send: "Send", manage: "Manage" };
  const DEFAULT_PERMISSIONS = Object.fromEntries(PERMISSION_SECTIONS.map(s => [s.id, [...s.actions]]));
  const countPerms = (perms) => { let total = 0, enabled = 0; PERMISSION_SECTIONS.forEach(s => { total += s.actions.length; enabled += (perms[s.id] || []).length; }); return { total, enabled }; };

  const UserManagement = () => {
    const [showInvite, setShowInvite] = useState(false);
    const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", phone: "", password: "" });
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState(null);
    const [inviteSuccess, setInviteSuccess] = useState(null);
    const [updateError, setUpdateError] = useState(null);
    const [permEditId, setPermEditId] = useState(null);
    const [permData, setPermData] = useState(null);
    const [editPhoneId, setEditPhoneId] = useState(null);
    const [editPhoneVal, setEditPhoneVal] = useState("");

    // Get permissions for a user — returns { sectionId: [actions], ... }
    const getUserPerms = (userId) => {
      try { const all = JSON.parse(localStorage.getItem("fieldops_user_permissions") || "{}"); return all[userId] || { ...DEFAULT_PERMISSIONS }; } catch { return { ...DEFAULT_PERMISSIONS }; }
    };
    const saveUserPerms = (userId, perms) => {
      try { const all = JSON.parse(localStorage.getItem("fieldops_user_permissions") || "{}"); all[userId] = perms; localStorage.setItem("fieldops_user_permissions", JSON.stringify(all)); } catch {}
    };

    const handleInvite = async (e) => {
      e.preventDefault();
      setInviteError(null);
      setInviteLoading(true);
      try {
        const result = await inviteUser(inviteForm.email, inviteForm.fullName, "staff", inviteForm.password || undefined);
        // Save phone number if provided
        if (inviteForm.phone.trim() && result.user?.id) {
          try { await updateStaffRecord(result.user.id, { phone: inviteForm.phone.trim() }); } catch {}
        }
        setInviteSuccess({ ...result.user, phone: inviteForm.phone });
        setInviteForm({ fullName: "", email: "", phone: "", password: "" });
        if (setStaff) {
          setStaff(prev => [...prev, { id: result.user.id, name: result.user.fullName, email: result.user.email, phone: inviteForm.phone.trim(), active: true }]);
        }
      } catch (err) {
        setInviteError(err.message);
      } finally {
        setInviteLoading(false);
      }
    };

    const handleToggleActive = async (s) => {
      setUpdateError(null);
      try {
        await updateStaffRecord(s.id, { active: !s.active });
        if (setStaff) { setStaff(prev => prev.map(st => st.id === s.id ? { ...st, active: !st.active } : st)); }
      } catch (err) { setUpdateError(`Failed to update ${s.name}: ${err.message}`); }
    };

    const handleResetPassword = async (s) => {
      if (!window.confirm(`Send a password reset email to ${s.email}?`)) return;
      setUpdateError(null);
      try { await adminResetUserPassword(s.email); alert(`Password reset email sent to ${s.email}`); } catch (err) { setUpdateError(`Failed to send reset: ${err.message}`); }
    };

    const handleSavePhone = async (s) => {
      setUpdateError(null);
      try {
        await updateStaffRecord(s.id, { phone: editPhoneVal.trim() });
        if (setStaff) { setStaff(prev => prev.map(st => st.id === s.id ? { ...st, phone: editPhoneVal.trim() } : st)); }
        setEditPhoneId(null);
        setEditPhoneVal("");
      } catch (err) { setUpdateError(`Failed to update phone: ${err.message}`); }
    };

    const openPermissions = (s) => { setPermEditId(s.id); setPermData(JSON.parse(JSON.stringify(getUserPerms(s.id)))); };
    const toggleAction = (sectionId, action) => {
      setPermData(prev => {
        const current = prev[sectionId] || [];
        const updated = current.includes(action) ? current.filter(a => a !== action) : [...current, action];
        // If removing "view", remove all other actions too
        if (action === "view" && !updated.includes("view")) return { ...prev, [sectionId]: [] };
        // If adding any action, ensure "view" is included
        if (action !== "view" && !updated.includes("view")) updated.push("view");
        return { ...prev, [sectionId]: updated };
      });
    };
    const toggleAllSection = (sectionId) => {
      setPermData(prev => {
        const sec = PERMISSION_SECTIONS.find(s => s.id === sectionId);
        const current = prev[sectionId] || [];
        return { ...prev, [sectionId]: current.length === sec.actions.length ? [] : [...sec.actions] };
      });
    };
    const savePermissions = () => { saveUserPerms(permEditId, permData); setPermEditId(null); };

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>User Management</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{staff.length} team member{staff.length !== 1 ? "s" : ""}</div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11 }} onClick={() => { setShowInvite(true); setInviteSuccess(null); setInviteError(null); }}>
            <Icon name="plus" size={12} /> Invite User
          </button>
        </div>

        {updateError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#dc2626" }}>{updateError}</div>
        )}

        {/* Invite form */}
        {showInvite && (
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Invite New User</div>
              <CloseBtn onClick={() => { setShowInvite(false); setInviteSuccess(null); }} />
            </div>
            {inviteSuccess ? (
              <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 700, color: "#166534", marginBottom: 8, fontSize: 13 }}><Icon name="check" size={14} /> User created successfully</div>
                <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <div><span style={{ color: "#888" }}>Name:</span> <span style={{ fontWeight: 600 }}>{inviteSuccess.fullName}</span></div>
                  <div><span style={{ color: "#888" }}>Email:</span> <span style={{ fontWeight: 600 }}>{inviteSuccess.email}</span></div>
                  <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 6, padding: "10px 14px", marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>Temporary Password</div>
                    <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "#111", letterSpacing: "0.05em" }}>{inviteSuccess.temporaryPassword}</div>
                    <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Share this securely. They should change it on first login.</div>
                  </div>
                </div>
                <button className="btn btn-sm" style={{ marginTop: 12, fontSize: 11 }} onClick={() => setInviteSuccess(null)}>Invite Another</button>
              </div>
            ) : (
              <form onSubmit={handleInvite}>
                {inviteError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#dc2626" }}>{inviteError}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Full Name</label>
                    <input type="text" value={inviteForm.fullName} onChange={e => setInviteForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Tom Baker" required style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Email</label>
                    <input type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="tom@company.com" required style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Phone Number</label>
                  <input type="tel" value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="0412 345 678" style={{ width: "100%", maxWidth: 300, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>Used by the voice assistant to route calls to this user's caller memory</div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Password (optional)</label>
                  <input type="text" value={inviteForm.password} onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))} placeholder="Auto-generated if blank" style={{ width: "100%", maxWidth: 300, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowInvite(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: inviteLoading ? 0.6 : 1 }} disabled={inviteLoading}>{inviteLoading ? "Creating..." : "Create User"}</button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Users list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staff.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#999", fontSize: 13 }}>No users found</div>}
          {staff.map(s => {
            const initials = s.name?.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";
            const isSelf = auth.staff?.id === s.id;
            const perms = getUserPerms(s.id);
            const { total: permTotal, enabled: permEnabled } = countPerms(perms);
            return (
              <div key={s.id} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "16px 20px", opacity: s.active ? 1 : 0.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: s.active ? "#111" : "#ddd", color: s.active ? "#fff" : "#999", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{s.name}{isSelf ? " (you)" : ""}</div>
                    <div style={{ fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{s.email}</span>
                      {editPhoneId === s.id ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <input type="tel" value={editPhoneVal} onChange={e => setEditPhoneVal(e.target.value)} placeholder="0412 345 678" autoFocus onKeyDown={e => { if (e.key === "Enter") handleSavePhone(s); if (e.key === "Escape") setEditPhoneId(null); }} style={{ width: 130, padding: "2px 6px", border: "1px solid #ccc", borderRadius: 4, fontSize: 11, fontFamily: "'Open Sans', sans-serif" }} />
                          <button onClick={() => handleSavePhone(s)} style={{ background: "none", border: "none", cursor: "pointer", color: "#059669", fontSize: 11, fontWeight: 600, fontFamily: "'Open Sans', sans-serif" }}>Save</button>
                          <button onClick={() => setEditPhoneId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 11, fontFamily: "'Open Sans', sans-serif" }}>Cancel</button>
                        </span>
                      ) : (
                        <span onClick={() => { setEditPhoneId(s.id); setEditPhoneVal(s.phone || ""); }} style={{ cursor: "pointer", color: s.phone ? "#555" : "#ccc", borderBottom: "1px dashed #ccc" }} title="Click to edit phone">
                          {s.phone || "Add phone"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: permEnabled === permTotal ? "#059669" : "#f59e0b", background: "#f5f5f5", padding: "2px 8px", borderRadius: 4 }}>{permEnabled}/{permTotal} permissions</span>
                    <button onClick={() => openPermissions(s)} style={{ padding: "4px 10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "'Open Sans', sans-serif", fontWeight: 600 }}>Permissions</button>
                    {!isSelf && (
                      <>
                        <button onClick={() => handleResetPassword(s)} style={{ padding: "4px 10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Reset PW</button>
                        <button onClick={() => handleToggleActive(s)} style={{ padding: "4px 10px", background: "none", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "'Open Sans', sans-serif", color: s.active ? "#dc2626" : "#059669" }}>{s.active ? "Deactivate" : "Activate"}</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Permissions modal */}
        {permEditId && permData && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPermEditId(null)}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 560, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Permissions</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>{staff.find(s => s.id === permEditId)?.name} — {(() => { const c = countPerms(permData); return `${c.enabled}/${c.total} enabled`; })()}</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {PERMISSION_SECTIONS.map(sec => {
                  const enabled = permData[sec.id] || [];
                  const allOn = enabled.length === sec.actions.length;
                  const anyOn = enabled.length > 0;
                  return (
                    <div key={sec.id} style={{ border: "1px solid #e8e8e8", borderRadius: 8, overflow: "hidden", background: anyOn ? "#fff" : "#fafafa" }}>
                      {/* Section header */}
                      <div onClick={() => toggleAllSection(sec.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: anyOn ? "1px solid #f0f0f0" : "none" }}>
                        <input type="checkbox" checked={allOn} readOnly style={{ width: 15, height: 15, accentColor: "#059669", cursor: "pointer", pointerEvents: "none" }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: anyOn ? "#111" : "#999", flex: 1 }}>{sec.label}</span>
                        <span style={{ fontSize: 10, color: "#aaa" }}>{enabled.length}/{sec.actions.length}</span>
                      </div>
                      {/* Action toggles */}
                      {anyOn && (
                        <div style={{ display: "flex", gap: 6, padding: "8px 14px 10px 40px", flexWrap: "wrap" }}>
                          {sec.actions.map(action => {
                            const isOn = enabled.includes(action);
                            return (
                              <button key={action} onClick={() => toggleAction(sec.id, action)} style={{
                                padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid",
                                fontFamily: "'Open Sans', sans-serif", transition: "all 0.15s",
                                background: isOn ? "#ecfdf5" : "#fff", color: isOn ? "#059669" : "#999", borderColor: isOn ? "#bbf7d0" : "#e8e8e8",
                              }}>{ACTION_LABELS[action]}</button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setPermEditId(null)} style={{ padding: "8px 16px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Cancel</button>
                <button onClick={savePermissions} style={{ padding: "8px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Save Permissions</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Settings sub-navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #e8e8e8", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="btn"
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", fontSize: 13, fontWeight: 600,
              border: "none", borderBottom: tab === t.id ? `2px solid ${accent}` : "2px solid transparent",
              borderRadius: 0, background: "transparent", color: tab === t.id ? "#111" : "#888",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {tab === "company" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Company Information</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Your company details used across the app and document templates</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: companyDirty ? 1 : 0.5 }} onClick={saveCompanyInfo} disabled={!companyDirty}>
              {companySaved ? "Saved!" : "Save Changes"}
            </button>
          </div>
          {companySaved && (
            <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="check" size={14} /> Company information saved.
            </div>
          )}
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Company Name</label>
                <input value={companyForm.companyName} onChange={e => updateCompanyField("companyName", e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>ABN</label>
                <input value={companyForm.abn} onChange={e => updateCompanyField("abn", e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Address</label>
              <input value={companyForm.address} onChange={e => updateCompanyField("address", e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Phone</label>
                <input value={companyForm.phone} onChange={e => updateCompanyField("phone", e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Email</label>
                <input value={companyForm.email} onChange={e => updateCompanyField("email", e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>
          <div style={{ background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 10, padding: "14px 20px", fontSize: 12, color: "#888" }}>
            These details are used as defaults across the app. Document templates can override the email address per template in the Templates tab.
          </div>
        </div>
      )}
      {tab === "integrations" && voiceIntegrationContent}
      {tab === "outbound" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Outbound Call Assistant</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Configure AI-powered outbound calls to team members about urgent tasks</div>
              <div style={{ fontSize: 11, color: "#b0b0b0", marginTop: 4 }}>These are the company defaults. Staff can personalise their own assistant in My Assistant.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: outboundDirty ? 1 : 0.5 }} onClick={saveOutboundSettings} disabled={!outboundDirty}>
                {outboundSaved ? "Saved!" : "Save Changes"}
              </button>
            </div>
          </div>

          {outboundSaved && (
            <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="check" size={14} /> Outbound settings saved.
            </div>
          )}
          {testCallStatus && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1d4ed8" }}>{testCallStatus}</div>
          )}

          {/* Enable toggle */}
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Enable Outbound Calls</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Allow the AI assistant to make outbound calls to team members</div>
            </div>
            <button onClick={() => updateOutbound("enabled", !outboundSettings.enabled)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", background: outboundSettings.enabled ? "#059669" : "#ccc" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, transition: "left 0.2s", left: outboundSettings.enabled ? 23 : 3, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
            </button>
          </div>

          {/* AI Personality */}
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>AI Personality</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Name</label>
                <input value={outboundSettings.name} onChange={e => updateOutbound("name", e.target.value)} placeholder="e.g. Iris" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Voice</label>
                <select value={outboundSettings.voice} onChange={e => updateOutbound("voice", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }}>
                  {VOICE_OPTIONS.voices.map(v => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Greeting Style</label>
            <textarea value={outboundSettings.greetingStyle} onChange={e => updateOutbound("greetingStyle", e.target.value)} rows={2} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box", marginBottom: 12 }} />
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Personality</label>
            <textarea value={outboundSettings.personality} onChange={e => updateOutbound("personality", e.target.value)} rows={2} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box" }} />
          </div>

          {/* Team Contacts */}
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Team Contacts</div>
              <button onClick={openNewTeamMember} style={{ padding: "4px 12px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>+ Add</button>
            </div>
            {outboundSettings.team.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: "#aaa", fontSize: 13 }}>No team members added</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {outboundSettings.team.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid #e8e8e8", borderRadius: 8 }}>
                    <button onClick={() => toggleTeamMemberCall(m.id)} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", position: "relative", background: m.callEnabled ? "#059669" : "#ccc", flexShrink: 0 }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: m.callEnabled ? 19 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{m.phone} {m.role ? `· ${m.role}` : ""}</div>
                    </div>
                    <button onClick={() => triggerTestCall(m)} style={{ padding: "4px 10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Test Call</button>
                    <button onClick={() => openEditTeamMember(m)} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 13, padding: 4 }}>✎</button>
                    <button onClick={() => removeTeamMember(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: 13, padding: 4 }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call Rules */}
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 16 }}>Call Rules</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Min. Severity</label>
                <select value={outboundSettings.callRules.minSeverity} onChange={e => updateCallRule("minSeverity", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }}>
                  <option value="high">High only</option>
                  <option value="medium">Medium and above</option>
                  <option value="low">All severities</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Max Calls / Day</label>
                <input type="number" min={1} max={10} value={outboundSettings.callRules.maxCallsPerDay} onChange={e => updateCallRule("maxCallsPerDay", Number(e.target.value))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Call Window Start</label>
                <input type="time" value={outboundSettings.callRules.callWindowStart} onChange={e => updateCallRule("callWindowStart", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Call Window End</label>
                <input type="time" value={outboundSettings.callRules.callWindowEnd} onChange={e => updateCallRule("callWindowEnd", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>

          {/* Team member modal */}
          {showTeamModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowTeamModal(false)}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editTeamMember ? "Edit Team Member" : "Add Team Member"}</div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Name</label>
                <input value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tom Baker" style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 12 }} autoFocus />
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Phone</label>
                <input value={teamForm.phone} onChange={e => setTeamForm(f => ({ ...f, phone: e.target.value }))} placeholder="+61400000000" style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 12 }} />
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Role</label>
                <input value={teamForm.role} onChange={e => setTeamForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Site Manager" style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 20 }} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowTeamModal(false)} style={{ padding: "8px 16px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Cancel</button>
                  <button onClick={saveTeamMember} style={{ padding: "8px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>{editTeamMember ? "Save" : "Add"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === "templates" && (() => {
        const DOC_TYPES = [
          { id: "quote", label: "Quotes" },
          { id: "invoice", label: "Invoices" },
          { id: "work_order", label: "Work Orders" },
          { id: "purchase_order", label: "Purchase Orders" },
        ];
        const TEMPLATE_VARS = [
          { var: "{{clientName}}", desc: "Client/recipient name" },
          { var: "{{number}}", desc: "Document number (Q-0001)" },
          { var: "{{total}}", desc: "Total amount inc. GST" },
          { var: "{{subtotal}}", desc: "Subtotal before tax" },
          { var: "{{dueDate}}", desc: "Due date" },
          { var: "{{jobTitle}}", desc: "Job title" },
          { var: "{{companyName}}", desc: "Your company name" },
          { var: "{{date}}", desc: "Document date" },
          { var: "{{type}}", desc: "Document type" },
        ];
        const typeTemplates = templates.filter(t => t.type === docType);

        const openNewTemplate = () => {
          const defaults = templates.find(t => t.type === docType && t.isDefault) || SEED_TEMPLATES.find(t => t.type === docType);
          setTplForm({ ...defaults, id: null, name: "", isDefault: false });
          setEditTemplate("new");
        };
        const openEditTemplate = (tpl) => { setTplForm({ ...tpl }); setEditTemplate(tpl.id); };
        const saveTemplate = () => {
          if (!tplForm.name.trim()) return;
          const updated = editTemplate === "new"
            ? [...templates, { ...tplForm, id: Date.now() }]
            : templates.map(t => t.id === editTemplate ? { ...tplForm } : t);
          setTemplates(updated);
          localStorage.setItem("fieldops_templates", JSON.stringify(updated));
          setEditTemplate(null);
        };
        const deleteTemplate = (id) => {
          const updated = templates.filter(t => t.id !== id);
          setTemplates(updated);
          localStorage.setItem("fieldops_templates", JSON.stringify(updated));
        };
        const setDefault = (id) => {
          const updated = templates.map(t => t.type === docType ? { ...t, isDefault: t.id === id } : t);
          setTemplates(updated);
          localStorage.setItem("fieldops_templates", JSON.stringify(updated));
        };

        if (editTemplate !== null && tplForm) {
          // ── Template Editor ──
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <button onClick={() => setEditTemplate(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 16, padding: 4 }}>&larr;</button>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{editTemplate === "new" ? "New Template" : "Edit Template"}</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button onClick={() => setEditTemplate(null)} style={{ padding: "6px 14px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Cancel</button>
                  <button onClick={saveTemplate} style={{ padding: "6px 14px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Save Template</button>
                </div>
              </div>

              {/* Template name */}
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Template Name</label>
                <input value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Premium, Minimal, Branded" style={{ width: "100%", maxWidth: 300, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} autoFocus />
              </div>

              {/* Company Details (inherited from Settings > Company) */}
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Company Details</div>
                  <span style={{ fontSize: 10, color: "#aaa" }}>From Settings &gt; Company</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 2 }}>Company</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>{companyInfo.companyName}</div>
                  </div>
                  <div style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 2 }}>ABN</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>{companyInfo.abn}</div>
                  </div>
                  <div style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 2 }}>Address</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>{companyInfo.address}</div>
                  </div>
                  <div style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 2 }}>Phone</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>{companyInfo.phone}</div>
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Template Email <span style={{ fontWeight: 400, color: "#aaa", textTransform: "none" }}>(override per template)</span></label>
                  <input value={tplForm.email} onChange={e => setTplForm(f => ({ ...f, email: e.target.value }))} style={{ width: "100%", maxWidth: 300, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Branding */}
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Branding</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Accent Colour</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="color" value={tplForm.accentColor} onChange={e => setTplForm(f => ({ ...f, accentColor: e.target.value }))} style={{ width: 36, height: 36, border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", padding: 2 }} />
                      <input value={tplForm.accentColor} onChange={e => setTplForm(f => ({ ...f, accentColor: e.target.value }))} style={{ width: 90, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Logo</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {tplForm.logo && <img src={tplForm.logo} alt="Logo" style={{ height: 32, borderRadius: 4 }} />}
                      <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => setTplForm(f => ({ ...f, logo: reader.result })); reader.readAsDataURL(file); } }} style={{ fontSize: 12 }} />
                      {tplForm.logo && <button onClick={() => setTplForm(f => ({ ...f, logo: null }))} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 11 }}>Remove</button>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>Show GST</label>
                  <button onClick={() => setTplForm(f => ({ ...f, showGst: !f.showGst }))} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", position: "relative", background: tplForm.showGst ? "#059669" : "#ccc" }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: tplForm.showGst ? 19 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                  </button>
                </div>
              </div>

              {/* Column Visibility */}
              {(tplForm.type === "quote" || tplForm.type === "invoice") && (
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Line Item Columns</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[{ id: "description", label: "Description", required: true }, { id: "qty", label: "Quantity" }, { id: "unit", label: "Unit" }, { id: "unitPrice", label: "Unit Price" }, { id: "lineTotal", label: "Line Total" }, { id: "gst", label: "GST" }].map(col => {
                      const cols = tplForm.columns || DEFAULT_COLUMNS;
                      const isOn = cols[col.id] !== false;
                      return (
                        <button key={col.id} onClick={() => !col.required && setTplForm(f => ({ ...f, columns: { ...(f.columns || DEFAULT_COLUMNS), [col.id]: !isOn } }))} style={{
                          padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: col.required ? "default" : "pointer", border: "1px solid",
                          fontFamily: "'Open Sans', sans-serif", transition: "all 0.15s", opacity: col.required ? 0.7 : 1,
                          background: isOn ? "#ecfdf5" : "#fff", color: isOn ? "#059669" : "#999", borderColor: isOn ? "#bbf7d0" : "#e8e8e8",
                        }}>{col.label}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>Toggle which columns appear on the document. Description is always shown.</div>
                </div>
              )}

              {/* Document Preview */}
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Preview</div>
                  <button onClick={() => {
                    const el = document.getElementById("tpl-preview");
                    if (!el) return;
                    const w = window.open("", "_blank", "width=800,height=1000");
                    w.document.write(`<html><head><title>${tplForm.type} Preview</title><style>body{margin:0;padding:40px;font-family:Arial,sans-serif;font-size:12px}@media print{body{padding:20px}}</style></head><body>${el.innerHTML}<script>setTimeout(()=>window.print(),300)</script></body></html>`);
                    w.document.close();
                  }} style={{ padding: "4px 12px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 13 }}>&#8595;</span> Download PDF
                  </button>
                </div>
                <div id="tpl-preview" style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 24, background: "#fff", fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: `2px solid ${tplForm.accentColor}` }}>
                    <div>
                      {tplForm.logo && <img src={tplForm.logo} alt="Logo" style={{ height: 40, marginBottom: 8 }} />}
                      <div style={{ fontSize: 16, fontWeight: 800, color: tplForm.accentColor }}>{companyInfo.companyName}</div>
                      {companyInfo.abn && <div style={{ fontSize: 10, color: "#888" }}>ABN: {companyInfo.abn}</div>}
                      <div style={{ fontSize: 10, color: "#888" }}>{companyInfo.address}</div>
                      <div style={{ fontSize: 10, color: "#888" }}>{companyInfo.phone} | {tplForm.email}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: tplForm.accentColor, textTransform: "uppercase" }}>{tplForm.type === "work_order" ? "Work Order" : tplForm.type === "purchase_order" ? "Purchase Order" : tplForm.type.charAt(0).toUpperCase() + tplForm.type.slice(1)}</div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>#Q-0001</div>
                      <div style={{ fontSize: 11, color: "#666" }}>Date: 18/03/2026</div>
                    </div>
                  </div>
                  {/* Client */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", marginBottom: 4 }}>Bill To</div>
                    <div style={{ fontWeight: 600 }}>Hartwell Properties</div>
                    <div style={{ color: "#666" }}>22 King St, Sydney NSW 2000</div>
                  </div>
                  {/* Line items table */}
                  {(() => {
                    const cols = tplForm.columns || DEFAULT_COLUMNS;
                    const colW = 80;
                    const sampleItems = [
                      { desc: "Labour — site preparation", qty: 8, unit: "hrs", rate: 95 },
                      { desc: "Materials — timber framing", qty: 1, unit: "lot", rate: 2340 },
                      { desc: "Subcontractor — electrical rough-in", qty: 1, unit: "lot", rate: 1850 },
                    ];
                    const subtotal = sampleItems.reduce((s, i) => s + i.qty * i.rate, 0);
                    const gstAmt = tplForm.showGst ? subtotal * 0.1 : 0;
                    return (
                      <>
                        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12, fontSize: 11, tableLayout: "fixed" }}>
                          <colgroup>
                            <col />
                            {cols.qty !== false && <col style={{ width: colW }} />}
                            {cols.unit !== false && <col style={{ width: colW }} />}
                            {cols.unitPrice !== false && <col style={{ width: colW }} />}
                            {cols.lineTotal !== false && <col style={{ width: colW }} />}
                          </colgroup>
                          <thead>
                            <tr style={{ background: tplForm.accentColor, color: "#fff" }}>
                              <th style={{ padding: "6px 8px", textAlign: "left" }}>Description</th>
                              {cols.qty !== false && <th style={{ padding: "6px 8px", textAlign: "right" }}>Qty</th>}
                              {cols.unit !== false && <th style={{ padding: "6px 8px", textAlign: "center" }}>Unit</th>}
                              {cols.unitPrice !== false && <th style={{ padding: "6px 8px", textAlign: "right" }}>Unit Price</th>}
                              {cols.lineTotal !== false && <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {sampleItems.map((item, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                                <td style={{ padding: "6px 8px" }}>{item.desc}</td>
                                {cols.qty !== false && <td style={{ padding: "6px 8px", textAlign: "right" }}>{item.qty}</td>}
                                {cols.unit !== false && <td style={{ padding: "6px 8px", textAlign: "center" }}>{item.unit}</td>}
                                {cols.unitPrice !== false && <td style={{ padding: "6px 8px", textAlign: "right" }}>${item.rate.toLocaleString()}</td>}
                                {cols.lineTotal !== false && <td style={{ padding: "6px 8px", textAlign: "right" }}>${(item.qty * item.rate).toLocaleString()}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <div style={{ width: 180 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}><span>Subtotal</span><span>${subtotal.toLocaleString()}</span></div>
                            {tplForm.showGst && cols.gst !== false && <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}><span>GST (10%)</span><span>${gstAmt.toLocaleString()}</span></div>}
                            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, fontWeight: 800, borderTop: "2px solid #111", marginTop: 4 }}><span>Total</span><span>${(subtotal + gstAmt).toLocaleString()}</span></div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  {/* Terms & Footer */}
                  {tplForm.terms && <div style={{ marginTop: 16, padding: "10px 12px", background: "#f8f8f8", borderRadius: 4, fontSize: 10, color: "#666" }}><strong>Terms:</strong> {tplForm.terms}</div>}
                  {tplForm.footer && <div style={{ marginTop: 12, textAlign: "center", fontSize: 10, color: "#999" }}>{tplForm.footer}</div>}
                </div>
              </div>

              {/* Footer & Terms */}
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Footer & Terms</div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Footer Text</label>
                <input value={tplForm.footer} onChange={e => setTplForm(f => ({ ...f, footer: e.target.value }))} placeholder="e.g. Thank you for your business." style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 12 }} />
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Terms & Conditions</label>
                <textarea value={tplForm.terms} onChange={e => setTplForm(f => ({ ...f, terms: e.target.value }))} rows={3} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box" }} />
              </div>

              {/* Email Template */}
              {(() => {
                const sampleVars = { clientName: "James Hartwell", number: "Q-0001", total: "$5,445", subtotal: "$4,950", dueDate: "01/04/2026", jobTitle: "Office Fitout – Level 3", companyName: companyInfo.companyName, date: "18/03/2026", type: tplForm.type === "work_order" ? "work order" : tplForm.type === "purchase_order" ? "purchase order" : tplForm.type };
                const replaceVars = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] || `{{${key}}}`);
                return (
                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 20, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Email Template</div>
                      <button onClick={() => setTplForm(f => ({ ...f, _showEmailPreview: !f._showEmailPreview }))} style={{ padding: "4px 12px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>
                        {tplForm._showEmailPreview ? "Edit" : "Preview"}
                      </button>
                    </div>
                    {tplForm._showEmailPreview ? (
                      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
                        {/* Email header */}
                        <div style={{ background: "#f8f8f8", padding: "12px 16px", borderBottom: "1px solid #e0e0e0" }}>
                          <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12 }}>
                            <span style={{ fontWeight: 700, color: "#888", minWidth: 40 }}>From:</span>
                            <span style={{ color: "#333" }}>{companyInfo.companyName} &lt;{tplForm.email}&gt;</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12 }}>
                            <span style={{ fontWeight: 700, color: "#888", minWidth: 40 }}>To:</span>
                            <span style={{ color: "#333" }}>James Hartwell &lt;james@hartwell.com&gt;</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                            <span style={{ fontWeight: 700, color: "#888", minWidth: 40 }}>Subject:</span>
                            <span style={{ color: "#111", fontWeight: 600 }}>{replaceVars(tplForm.emailSubject)}</span>
                          </div>
                        </div>
                        {/* Email body */}
                        <div style={{ padding: "16px 20px", fontSize: 13, lineHeight: 1.6, color: "#333", whiteSpace: "pre-wrap", fontFamily: "Arial, sans-serif" }}>
                          {replaceVars(tplForm.emailBody)}
                        </div>
                        {/* Attachment indicator */}
                        <div style={{ padding: "10px 16px", borderTop: "1px solid #e0e0e0", background: "#fafafa", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14 }}>&#128206;</span>
                          <span style={{ fontSize: 11, color: "#666" }}>{tplForm.type === "work_order" ? "Work_Order" : tplForm.type === "purchase_order" ? "Purchase_Order" : tplForm.type.charAt(0).toUpperCase() + tplForm.type.slice(1)}_Q-0001.pdf</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Subject</label>
                        <input value={tplForm.emailSubject} onChange={e => setTplForm(f => ({ ...f, emailSubject: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 12 }} />
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Body</label>
                        <textarea value={tplForm.emailBody} onChange={e => setTplForm(f => ({ ...f, emailBody: e.target.value }))} rows={6} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box", marginBottom: 12 }} />
                        <div style={{ background: "#f8f8f8", borderRadius: 6, padding: "10px 14px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Available Variables</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {TEMPLATE_VARS.map(v => (
                              <span key={v.var} title={v.desc} style={{ fontSize: 11, fontFamily: "monospace", background: "#fff", border: "1px solid #e0e0e0", padding: "2px 8px", borderRadius: 4, color: "#555", cursor: "help" }}>{v.var}</span>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        }

        // ── Template List ──
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Document & Email Templates</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Manage PDF layouts and email templates for each document type</div>
              </div>
              <button onClick={openNewTemplate} style={{ padding: "6px 14px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>+ New Template</button>
            </div>

            {/* Document type tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
              {DOC_TYPES.map(dt => (
                <button key={dt.id} onClick={() => setDocType(dt.id)} style={{ flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", borderRight: "1px solid #ddd", cursor: "pointer", fontFamily: "'Open Sans', sans-serif", background: docType === dt.id ? accent : "#f5f5f5", color: docType === dt.id ? "#fff" : "#666" }}>{dt.label}</button>
              ))}
            </div>

            {/* Templates for selected type */}
            {typeTemplates.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 }}>No templates for this document type</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {typeTemplates.map(tpl => (
                  <div key={tpl.id} onClick={() => openEditTemplate(tpl)} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                    {/* Colour swatch */}
                    <div style={{ width: 8, height: 40, borderRadius: 4, background: tpl.accentColor, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{tpl.name}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{tpl.companyName} {tpl.logo ? "· Logo" : ""}</div>
                    </div>
                    {tpl.isDefault && <span style={{ fontSize: 10, fontWeight: 700, background: "#ecfdf5", color: "#059669", padding: "2px 8px", borderRadius: 4 }}>Default</span>}
                    {!tpl.isDefault && (
                      <button onClick={e => { e.stopPropagation(); setDefault(tpl.id); }} style={{ fontSize: 10, fontWeight: 600, background: "#f5f5f5", border: "1px solid #ddd", padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "'Open Sans', sans-serif", color: "#666" }}>Set Default</button>
                    )}
                    {!tpl.isDefault && (
                      <button onClick={e => { e.stopPropagation(); deleteTemplate(tpl.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: 13, padding: 4 }}>🗑</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {tab === "xero" && <XeroSettingsTab accent={accent} />}
      {tab === "users" && <UserManagement />}
    </div>
  );
};

// ── Files Page ──────────────────────────────────────────────────────────────
const FilesPage = () => {
  const { jobs, bills, contractors, quotes, invoices, workOrders, purchaseOrders } = useAppStore();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [filterSource, setFilterSource] = useState("all");
  const [filterType, setFilterType] = useState("all");

  // Aggregate files from all sources
  const allFiles = useMemo(() => {
    const files = [];

    // Bills / receipts
    bills.forEach(b => {
      files.push({ id: `bill-${b.id}`, name: `${b.invoiceNo || "Bill"} — ${b.supplier}`, type: "Bill / Receipt", source: "Bills", date: b.capturedAt || b.date, size: null, status: b.status, linkedTo: b.jobId ? (jobs.find(j => j.id === b.jobId)?.title || `Job #${b.jobId}`) : null, icon: "bills" });
    });

    // Contractor documents
    contractors.forEach(c => {
      (c.documents || []).forEach(d => {
        const typeLabels = { workers_comp: "Workers Comp", public_liability: "Public Liability", white_card: "White Card", trade_license: "Trade License", subcontractor_statement: "Subcontractor Statement", swms: "SWMS" };
        files.push({ id: `cdoc-${d.id}`, name: `${typeLabels[d.type] || d.type} — ${c.name}`, type: "Compliance Doc", source: "Contractors", date: d.uploadedAt, size: null, status: d.expiryDate && new Date(d.expiryDate) < new Date() ? "expired" : "current", linkedTo: c.name, icon: "contractors" });
      });
    });

    // Work order attachments
    workOrders.forEach(wo => {
      (wo.attachments || []).forEach((att, i) => {
        files.push({ id: `wo-att-${wo.id}-${i}`, name: typeof att === "string" ? att : (att.name || `WO ${wo.ref} Attachment ${i + 1}`), type: "Work Order Attachment", source: "Orders", date: wo.issueDate, size: att.size || null, status: wo.status, linkedTo: `${wo.ref} — ${wo.contractorName}`, icon: "orders" });
      });
    });

    // Purchase order attachments
    purchaseOrders.forEach(po => {
      (po.attachments || []).forEach((att, i) => {
        files.push({ id: `po-att-${po.id}-${i}`, name: typeof att === "string" ? att : (att.name || `PO ${po.ref} Attachment ${i + 1}`), type: "Purchase Order Attachment", source: "Orders", date: po.issueDate, size: att.size || null, status: po.status, linkedTo: `${po.ref} — ${po.supplierName}`, icon: "orders" });
      });
    });

    // Quotes (as generated documents)
    quotes.forEach(q => {
      files.push({ id: `quote-${q.id}`, name: `Quote ${q.ref || q.id} — ${q.clientName || "Client"}`, type: "Quote", source: "Quotes", date: q.date || q.createdAt, size: null, status: q.status, linkedTo: q.jobTitle || (q.jobId ? `Job #${q.jobId}` : null), icon: "quotes" });
    });

    // Invoices (as generated documents)
    invoices.forEach(inv => {
      files.push({ id: `inv-${inv.id}`, name: `Invoice ${inv.ref || inv.id} — ${inv.clientName || "Client"}`, type: "Invoice", source: "Invoices", date: inv.date || inv.createdAt, size: null, status: inv.status, linkedTo: inv.jobTitle || (inv.jobId ? `Job #${inv.jobId}` : null), icon: "invoices" });
    });

    return files;
  }, [bills, contractors, workOrders, purchaseOrders, quotes, invoices, jobs]);

  // Get unique sources and types for filters
  const sources = useMemo(() => [...new Set(allFiles.map(f => f.source))].sort(), [allFiles]);
  const types = useMemo(() => [...new Set(allFiles.map(f => f.type))].sort(), [allFiles]);

  // Filter and search
  const filtered = useMemo(() => {
    let list = allFiles;
    if (filterSource !== "all") list = list.filter(f => f.source === filterSource);
    if (filterType !== "all") list = list.filter(f => f.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || (f.linkedTo || "").toLowerCase().includes(q) || f.type.toLowerCase().includes(q) || f.source.toLowerCase().includes(q));
    }
    // Sort
    list = [...list].sort((a, b) => {
      let va, vb;
      if (sortField === "date") { va = a.date || ""; vb = b.date || ""; }
      else if (sortField === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (sortField === "type") { va = a.type; vb = b.type; }
      else if (sortField === "source") { va = a.source; vb = b.source; }
      else { va = a.date || ""; vb = b.date || ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [allFiles, filterSource, filterType, search, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const sortIcon = (field) => sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const statusColor = (status) => {
    if (!status) return "#888";
    const s = status.toLowerCase();
    if (["expired", "overdue", "inbox"].includes(s)) return "#dc2626";
    if (["approved", "current", "paid", "accepted", "sent"].includes(s)) return "#059669";
    if (["draft", "pending"].includes(s)) return "#f59e0b";
    if (["posted", "linked"].includes(s)) return "#2563eb";
    return "#888";
  };

  const selectStyle = { padding: "7px 10px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: 13, background: "#fff", color: "#333", fontFamily: "'Open Sans', sans-serif", minWidth: 120 };

  return (
    <div style={{ padding: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..." style={{ ...selectStyle, width: "100%", paddingLeft: 32 }} />
        </div>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selectStyle}>
          <option value="all">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          <option value="all">All Types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ fontSize: 12, color: "#888" }}>{filtered.length} file{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e5e5" }}>
                <th onClick={() => toggleSort("name")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Name{sortIcon("name")}</th>
                <th onClick={() => toggleSort("type")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Type{sortIcon("type")}</th>
                <th onClick={() => toggleSort("source")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Source{sortIcon("source")}</th>
                <th onClick={() => toggleSort("date")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Date{sortIcon("date")}</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", whiteSpace: "nowrap" }}>Linked To</th>
                <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", whiteSpace: "nowrap" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#aaa" }}>No files found</td></tr>
              ) : filtered.map(f => (
                <tr key={f.id} style={{ borderBottom: "1px solid #f0f0f0" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name={f.icon} size={14} />
                    <span style={{ fontWeight: 500 }}>{f.name}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#666" }}>{f.type}</td>
                  <td style={{ padding: "10px 14px", color: "#666" }}>{f.source}</td>
                  <td style={{ padding: "10px 14px", color: "#666", whiteSpace: "nowrap" }}>{f.date || "—"}</td>
                  <td style={{ padding: "10px 14px", color: "#888", fontSize: 12 }}>{f.linkedTo || "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    {f.status ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: statusColor(f.status) + "18", color: statusColor(f.status), textTransform: "capitalize" }}>{f.status}</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Call Log Page ───────────────────────────────────────────────────────────
const CallLog = ({ onNav }) => {
  const { callLog } = useAppStore();
  const [search, setSearch] = useState("");
  const [filterDir, setFilterDir] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedId, setExpandedId] = useState(null);

  const formatDuration = (secs) => {
    if (!secs) return "0:00";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const filtered = useMemo(() => {
    let list = [...callLog];
    if (filterDir !== "all") list = list.filter(c => c.direction === filterDir);
    if (filterStatus !== "all") list = list.filter(c => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.from || c.to || "").toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.actions || []).some(a => a.description.toLowerCase().includes(q)) || (c.notes || "").toLowerCase().includes(q) || (c.summary || "").toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let va, vb;
      if (sortField === "date") { va = a.date; vb = b.date; }
      else if (sortField === "name") { va = (a.from || a.to || "").toLowerCase(); vb = (b.from || b.to || "").toLowerCase(); }
      else if (sortField === "duration") { va = a.duration; vb = b.duration; }
      else { va = a.date; vb = b.date; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [callLog, filterDir, filterStatus, search, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };
  const sortIcon = (field) => sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const statusLabel = { completed: "Completed", missed: "Missed", no_answer: "No Answer" };
  const statusColor = (s) => s === "completed" ? "#059669" : s === "missed" ? "#dc2626" : "#f59e0b";
  const dirIcon = (dir) => dir === "inbound" ? "↙" : "↗";
  const dirColor = (dir) => dir === "inbound" ? "#2563eb" : "#7c3aed";
  const actionTypeIcon = { reminder: "🔔", note: "📝", schedule: "📅", quote: "📄", task: "✅", confirmation: "✓" };

  const selectStyle = { padding: "7px 10px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: 13, background: "#fff", color: "#333", fontFamily: "'Open Sans', sans-serif", minWidth: 120 };

  return (
    <div style={{ padding: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls..." style={{ ...selectStyle, width: "100%", paddingLeft: 32 }} />
        </div>
        <select value={filterDir} onChange={e => setFilterDir(e.target.value)} style={selectStyle}>
          <option value="all">All Directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="no_answer">No Answer</option>
        </select>
        <div style={{ fontSize: 12, color: "#888" }}>{filtered.length} call{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 140px 100px 90px 90px", padding: "10px 14px", background: "#f9fafb", borderBottom: "2px solid #e5e5e5", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}></div>
          <div onClick={() => toggleSort("name")} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none" }}>Contact{sortIcon("name")}</div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}>Phone</div>
          <div onClick={() => toggleSort("date")} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none" }}>Date{sortIcon("date")}</div>
          <div onClick={() => toggleSort("duration")} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none" }}>Duration{sortIcon("duration")}</div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", textAlign: "center" }}>Status</div>
        </div>
        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>No calls found</div>
        ) : filtered.map(call => (
          <div key={call.id}>
            <div
              onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
              style={{ display: "grid", gridTemplateColumns: "40px 1fr 140px 100px 90px 90px", padding: "12px 14px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", gap: 8, alignItems: "center", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
              onMouseLeave={e => e.currentTarget.style.background = expandedId === call.id ? "#f9fafb" : ""}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: dirColor(call.direction) }}>{dirIcon(call.direction)}</span>
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{call.from || call.to}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{call.direction === "inbound" ? "Inbound" : "Outbound"}{call.actions?.length ? ` · ${call.actions.length} action${call.actions.length > 1 ? "s" : ""}` : ""}</div>
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>{call.phone}</div>
              <div>
                <div style={{ fontSize: 12, color: "#333" }}>{formatDate(call.date)}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{formatTime(call.date)}</div>
              </div>
              <div style={{ fontSize: 13, color: "#333", fontVariantNumeric: "tabular-nums" }}>{formatDuration(call.duration)}</div>
              <div style={{ textAlign: "center" }}>
                <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: statusColor(call.status) + "18", color: statusColor(call.status) }}>{statusLabel[call.status] || call.status}</span>
              </div>
            </div>
            {/* Expanded actions */}
            {expandedId === call.id && call.actions?.length > 0 && (
              <div style={{ padding: "0 14px 14px 54px", background: "#f9fafb", borderBottom: "1px solid #e5e5e5" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888", marginBottom: 8 }}>Actions from this call</div>
                {call.actions.map((a, i) => (
                  <div key={i}
                    onClick={a.link ? (e) => { e.stopPropagation(); onNav && onNav(a.link.page); } : undefined}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", margin: "0 -10px", borderRadius: 6, borderBottom: i < call.actions.length - 1 ? "1px solid #eee" : "none", cursor: a.link ? "pointer" : "default", transition: "background 0.15s" }}
                    onMouseEnter={e => { if (a.link) e.currentTarget.style.background = "#eef2ff"; }}
                    onMouseLeave={e => { if (a.link) e.currentTarget.style.background = ""; }}
                  >
                    <span style={{ fontSize: 14, minWidth: 20, textAlign: "center" }}>{actionTypeIcon[a.type] || "•"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: a.link ? "#2563eb" : "#333" }}>{a.description}</div>
                    </div>
                    {a.link && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>}
                    <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>{a.time}</div>
                  </div>
                ))}
              </div>
            )}
            {expandedId === call.id && (!call.actions || call.actions.length === 0) && (
              <div style={{ padding: "12px 14px 12px 54px", background: "#f9fafb", borderBottom: "1px solid #e5e5e5", fontSize: 13, color: "#999", fontStyle: "italic" }}>No actions recorded for this call</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── System Status Page ──────────────────────────────────────────────────────
const SystemStatus = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const SERVICE_DEFS = [
    { id: "frontend", name: "Frontend App", description: "Netlify — Web application hosting", icon: "dashboard",
      check: async () => ({ status: "operational", latency: 0, detail: "You're viewing it right now" }) },
    { id: "database", name: "Database", description: "Supabase — PostgreSQL database & API", icon: "chart",
      check: async () => {
        const url = import.meta.env.VITE_SUPABASE_URL;
        if (!url) return { status: "unconfigured", detail: "VITE_SUPABASE_URL not set" };
        const start = performance.now();
        try {
          const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } });
          const latency = Math.round(performance.now() - start);
          return res.ok ? { status: "operational", latency, detail: `Responding in ${latency}ms` } : { status: "degraded", latency, detail: `HTTP ${res.status}` };
        } catch (e) { return { status: "down", detail: e.message }; }
      }},
    { id: "auth", name: "Authentication", description: "Supabase Auth — User authentication service", icon: "clients",
      check: async () => {
        const url = import.meta.env.VITE_SUPABASE_URL;
        if (!url) return { status: "unconfigured", detail: "VITE_SUPABASE_URL not set" };
        const start = performance.now();
        try {
          const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
          const latency = Math.round(performance.now() - start);
          return res.ok ? { status: "operational", latency, detail: `Responding in ${latency}ms` } : { status: "degraded", latency, detail: `HTTP ${res.status}` };
        } catch (e) { return { status: "down", detail: e.message }; }
      }},
    { id: "storage", name: "File Storage", description: "Supabase Storage — File uploads & media", icon: "copy",
      check: async () => {
        const url = import.meta.env.VITE_SUPABASE_URL;
        if (!url) return { status: "unconfigured", detail: "VITE_SUPABASE_URL not set" };
        const start = performance.now();
        try {
          const res = await fetch(`${url}/storage/v1/bucket`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } });
          const latency = Math.round(performance.now() - start);
          return res.ok || res.status === 400 ? { status: "operational", latency, detail: `Responding in ${latency}ms` } : { status: "degraded", latency, detail: `HTTP ${res.status}` };
        } catch (e) { return { status: "down", detail: e.message }; }
      }},
    { id: "edge_functions", name: "Edge Functions", description: "Supabase — AI document extraction & processing", icon: "send",
      check: async () => {
        const url = import.meta.env.VITE_SUPABASE_URL;
        if (!url) return { status: "unconfigured", detail: "VITE_SUPABASE_URL not set" };
        const start = performance.now();
        try {
          const res = await fetch(`${url}/functions/v1/`, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } });
          const latency = Math.round(performance.now() - start);
          return res.status !== 0 ? { status: "operational", latency, detail: `Responding in ${latency}ms` } : { status: "down", detail: "No response" };
        } catch (e) { return { status: "operational", detail: "Endpoint available (CORS restricted)" }; }
      }},
    { id: "email", name: "Email Service", description: "Resend — Transactional email delivery", icon: "send",
      check: async () => {
        const url = import.meta.env.VITE_SUPABASE_URL;
        if (!url) return { status: "unconfigured", detail: "Supabase not configured (required for send-email edge function)" };
        try {
          const res = await fetch(`${url}/functions/v1/send-email`, {
            method: "OPTIONS",
            headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          });
          return { status: "operational", detail: "Edge function endpoint available" };
        } catch (e) {
          return { status: "operational", detail: "Configured (CORS restricted)" };
        }
      }},
    { id: "voice", name: "Voice Assistant", description: "Railway — Billy (Twilio + OpenAI Realtime)", icon: "notification",
      check: async () => {
        const start = performance.now();
        try {
          const res = await fetch("https://business-suite-production-79b7.up.railway.app/");
          const latency = Math.round(performance.now() - start);
          if (res.ok) {
            const data = await res.json();
            return { status: "operational", latency, detail: `${data.service || "Running"} — ${latency}ms` };
          }
          return { status: "degraded", latency, detail: `HTTP ${res.status}` };
        } catch (e) { return { status: "down", detail: e.message }; }
      }},
  ];

  const runChecks = async () => {
    setLoading(true);
    const results = await Promise.all(SERVICE_DEFS.map(async (svc) => {
      try {
        const result = await svc.check();
        return { ...svc, ...result };
      } catch (e) {
        return { ...svc, status: "down", detail: e.message };
      }
    }));
    setServices(results);
    setLastChecked(new Date());
    setLoading(false);
  };

  useEffect(() => { runChecks(); }, []);

  const statusColor = { operational: "#059669", degraded: "#d97706", down: "#dc2626", unconfigured: "#9ca3af" };
  const statusLabel = { operational: "Operational", degraded: "Degraded", down: "Down", unconfigured: "Not Configured" };
  const statusBg = { operational: "#ecfdf5", degraded: "#fffbeb", down: "#fef2f2", unconfigured: "#f9fafb" };

  const allOperational = services.length > 0 && services.every(s => s.status === "operational");
  const hasDown = services.some(s => s.status === "down");
  const overallStatus = allOperational ? "operational" : hasDown ? "down" : "degraded";
  const overallLabel = allOperational ? "All Systems Operational" : hasDown ? "Service Disruption Detected" : "Some Services Degraded";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor[overallStatus], boxShadow: `0 0 8px ${statusColor[overallStatus]}` }} />
            <span style={{ fontSize: 18, fontWeight: 700, color: statusColor[overallStatus] }}>{overallLabel}</span>
          </div>
          {lastChecked && <div style={{ fontSize: 11, color: "#999", marginLeft: 20 }}>Last checked: {lastChecked.toLocaleTimeString()}</div>}
        </div>
        <button className="btn btn-secondary" onClick={runChecks} disabled={loading} style={{ fontSize: 12, padding: "6px 14px" }}>
          {loading ? "Checking..." : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {services.map(svc => (
          <div key={svc.id} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "16px 20px", borderLeft: `3px solid ${statusColor[svc.status]}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name={svc.icon} size={16} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{svc.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{svc.description}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: statusBg[svc.status], color: statusColor[svc.status] }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor[svc.status] }} />
                  {statusLabel[svc.status]}
                </span>
                {svc.latency > 0 && <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{svc.latency}ms</div>}
              </div>
            </div>
            {svc.detail && <div style={{ fontSize: 11, color: "#666", marginTop: 8, paddingLeft: 26 }}>{svc.detail}</div>}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "20px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Service Endpoints</div>
        <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
            <span style={{ color: "#666" }}>Frontend</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#333" }}>{window.location.origin}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
            <span style={{ color: "#666" }}>Supabase API</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#333" }}>{import.meta.env.VITE_SUPABASE_URL || "Not configured"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
            <span style={{ color: "#666" }}>Voice Assistant</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#333" }}>business-suite-production-79b7.up.railway.app</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
            <span style={{ color: "#666" }}>Email Service</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#333" }}>Resend (notifications@c8c.com.au)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8f8f8", borderRadius: 6 }}>
            <span style={{ color: "#666" }}>Voice Phone</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#333" }}>+61 2 5701 1388</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── PDF Form Filler ─────────────────────────────────────────────────────────

// ── Change Password Modal ────────────────────────────────────────────────────
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
