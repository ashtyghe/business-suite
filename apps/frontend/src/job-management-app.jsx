import { useState, useEffect, useRef, useMemo, Fragment, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { fetchAll, createCustomer, updateCustomer, deleteCustomer, createSite, updateSite, deleteSite, createJob, updateJob, deleteJob, createQuote, updateQuote, deleteQuote, createInvoice, updateInvoice, deleteInvoice, createTimeEntry, updateTimeEntry, deleteTimeEntry, createBill, updateBill, deleteBill, createScheduleEntry, updateScheduleEntry, deleteScheduleEntry, uploadFile, createAttachment, deleteAttachment, createWorkOrder, updateWorkOrder, deleteWorkOrder, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, createContractor, updateContractor, deleteContractor, createContractorDoc, updateContractorDoc, deleteContractorDoc, createPhase, updatePhase, deletePhase, createTask, updateTask, deleteTask, createNote, updateNote, deleteNote, createAuditEntry } from './lib/db';
import { supabase, extractBillFromImage, extractDocumentFromImage, sendEmail, inviteUser, updateStaffRecord, xeroOAuth, xeroSyncInvoice, xeroSyncBill, xeroSyncContact, xeroPollUpdates, xeroFetchAccounts, xeroGetMappings, xeroSaveMappings } from './lib/supabase';
import { useAuth } from './lib/AuthContext';
import { changePassword, adminResetUserPassword } from './lib/auth';
// Heavy libraries loaded dynamically where used (fabric, pdfjs-dist, pdf-lib, signature_pad)

// ── Google Font ──────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap";
document.head.appendChild(fontLink);

const spinStyle = document.createElement("style");
spinStyle.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
document.head.appendChild(spinStyle);

// ── Seed Data ────────────────────────────────────────────────────────────────
const SEED_CLIENTS = [
  { id: 1, name: "Hartwell Properties", email: "admin@hartwell.com", phone: "02 9000 1234", address: "22 King St, Sydney NSW 2000",
    mainContact: { name: "James Hartwell", phone: "0412 345 678", email: "james@hartwell.com" },
    accountsContact: { name: "Susan Hartwell", phone: "0412 345 679", email: "accounts@hartwell.com" },
    rates: { labourRate: 95, materialMargin: 15, subcontractorMargin: 10 },
    sites: [
      { id: 101, name: "King St HQ",        address: "22 King St, Sydney NSW 2000",      contactName: "James Hartwell", contactPhone: "0412 345 678", contactEmail: "james@hartwell.com" },
      { id: 102, name: "Parramatta Office", address: "8 Church St, Parramatta NSW 2150", contactName: "Linda Park",     contactPhone: "0412 345 900", contactEmail: "linda@hartwell.com" },
    ]
  },
  { id: 2, name: "BlueLine Construction", email: "admin@blueline.com.au", phone: "03 9876 5432", address: "88 Industrial Ave, Melbourne VIC 3000",
    mainContact: { name: "Mark Chen", phone: "0398 765 432", email: "mark@blueline.com.au" },
    accountsContact: { name: "Fiona Wells", phone: "0398 765 433", email: "accounts@blueline.com.au" },
    rates: { labourRate: 90, materialMargin: 12, subcontractorMargin: 8 },
    sites: [
      { id: 201, name: "Industrial Ave Depot", address: "88 Industrial Ave, Melbourne VIC 3000",  contactName: "Mark Chen",    contactPhone: "0398 765 432", contactEmail: "mark@blueline.com.au" },
      { id: 202, name: "Southbank Site",        address: "14 Riverside Blvd, Southbank VIC 3006", contactName: "Rachel Moore", contactPhone: "0398 111 222", contactEmail: "rachel@blueline.com.au" },
    ]
  },
  { id: 3, name: "Mara & Co Interiors", email: "hello@marainteriors.com", phone: "07 3111 2222", address: "5 Design Lane, Brisbane QLD 4000",
    mainContact: { name: "Mara Costa", phone: "0455 111 222", email: "mara@marainteriors.com" },
    accountsContact: { name: "Kevin Tran", phone: "0455 111 223", email: "kevin@marainteriors.com" },
    rates: { labourRate: 100, materialMargin: 20, subcontractorMargin: 15 },
    sites: [
      { id: 301, name: "Brisbane Studio", address: "5 Design Lane, Brisbane QLD 4000", contactName: "Mara Costa", contactPhone: "0455 111 222", contactEmail: "mara@marainteriors.com" },
    ]
  },
  { id: 4, name: "Nexus Facilities", email: "info@nexus.com", phone: "08 9111 9888", address: "101 Commerce Rd, Perth WA 6000",
    mainContact: { name: "David Nguyen", phone: "0411 999 888", email: "david@nexus.com" },
    accountsContact: { name: "Priya Sharma", phone: "0411 999 889", email: "accounts@nexus.com" },
    rates: { labourRate: 85, materialMargin: 10, subcontractorMargin: 10 },
    sites: [
      { id: 401, name: "Perth HQ",         address: "101 Commerce Rd, Perth WA 6000",       contactName: "David Nguyen", contactPhone: "0411 999 888", contactEmail: "david@nexus.com" },
      { id: 402, name: "Fremantle Store",  address: "44 Harbour St, Fremantle WA 6160",     contactName: "Aisha Patel",  contactPhone: "0411 777 333", contactEmail: "aisha@nexus.com" },
      { id: 403, name: "Joondalup Branch", address: "9 Ocean Keys Blvd, Joondalup WA 6027", contactName: "Tom Nguyen",   contactPhone: "0411 222 555", contactEmail: "tom@nexus.com" },
    ]
  },
];

const SEED_JOBS = [
  { id: 1, title: "Office Fitout – Level 3", clientId: 1, siteId: 101, status: "in_progress", priority: "high", description: "Full office refurbishment including partition walls, electrical and plumbing.", startDate: "2026-02-10", dueDate: "2026-03-25", assignedTo: ["Tom Baker", "Sarah Lee"], tags: ["fitout", "commercial"], createdAt: "2026-02-01", estimate: { labour: 4200, materials: 3800, subcontractors: 3500, other: 500 },
    phases: [
      { id: 1, name: "Demolition", startDate: "2026-02-10", endDate: "2026-02-14", color: "#ef4444", progress: 100 },
      { id: 2, name: "Framing & Partitions", startDate: "2026-02-17", endDate: "2026-02-28", color: "#f97316", progress: 100 },
      { id: 3, name: "Electrical Rough-in", startDate: "2026-02-24", endDate: "2026-03-07", color: "#eab308", progress: 80 },
      { id: 4, name: "Plumbing", startDate: "2026-03-03", endDate: "2026-03-10", color: "#3b82f6", progress: 60 },
      { id: 5, name: "Plasterboard & Painting", startDate: "2026-03-10", endDate: "2026-03-21", color: "#8b5cf6", progress: 20 },
      { id: 6, name: "Final Fix & Handover", startDate: "2026-03-22", endDate: "2026-03-25", color: "#059669", progress: 0 },
    ],
    tasks: [
      { id: 1, text: "Order plasterboard", done: true, dueDate: "2026-03-08", assignedTo: "Tom Baker", createdAt: "2026-03-01T09:00:00Z" },
      { id: 2, text: "Book electrical inspection", done: true, dueDate: "2026-03-10", assignedTo: "Mike Chen", createdAt: "2026-03-02T10:00:00Z" },
      { id: 3, text: "Confirm paint colours with client", done: false, dueDate: "2026-03-15", assignedTo: "Sarah Lee", createdAt: "2026-03-05T14:00:00Z" },
      { id: 4, text: "Install partition doors", done: false, dueDate: "2026-03-18", assignedTo: "Tom Baker", createdAt: "2026-03-06T08:00:00Z" },
      { id: 5, text: "Final clean before handover", done: false, dueDate: "2026-03-24", assignedTo: "Dan Wright", createdAt: "2026-03-06T08:30:00Z" },
    ],
    notes: [{ id: 1, text: "Site access confirmed via loading dock. Security pass required — collect from reception.", category: "general", attachments: [], createdAt: "2026-03-08T09:00:00Z", createdBy: "Alex Jones" }, { id: 2, text: "Found damaged plasterboard on Level 3 east wall. Needs replacement before painting.", category: "issue", attachments: [], createdAt: "2026-03-10T14:30:00Z", createdBy: "Tom Baker" }, { id: 3, text: "Electrical rough-in inspection passed. Certificate filed.", category: "inspection", attachments: [], createdAt: "2026-03-11T16:00:00Z", createdBy: "Alex Jones" }], activityLog: [{ ts: "2026-02-01 09:00", user: "Alex Jones", action: "Job created" }, { ts: "2026-02-10 08:30", user: "Alex Jones", action: "Status changed to In Progress" }] },
  { id: 2, title: "Roof Repair & Waterproofing", clientId: 2, siteId: 201, status: "quoted", priority: "medium", description: "Replace damaged roof sheets and apply waterproof membrane to flat section.", startDate: "2026-03-15", dueDate: "2026-03-30", assignedTo: ["Mike Chen"], tags: ["roofing", "maintenance"], createdAt: "2026-02-15", estimate: { labour: 1800, materials: 4200, subcontractors: 0, other: 300 },
    phases: [
      { id: 1, name: "Site Setup & Safety", startDate: "2026-03-15", endDate: "2026-03-16", color: "#ef4444", progress: 0 },
      { id: 2, name: "Sheet Removal", startDate: "2026-03-17", endDate: "2026-03-19", color: "#f97316", progress: 0 },
      { id: 3, name: "Membrane Application", startDate: "2026-03-20", endDate: "2026-03-24", color: "#3b82f6", progress: 0 },
      { id: 4, name: "New Sheets Install", startDate: "2026-03-25", endDate: "2026-03-28", color: "#8b5cf6", progress: 0 },
      { id: 5, name: "Final Inspection", startDate: "2026-03-29", endDate: "2026-03-30", color: "#059669", progress: 0 },
    ],
    tasks: [
      { id: 1, text: "Order roof sheets (24 m²)", done: false, dueDate: "2026-03-14", assignedTo: "Dan Wright", createdAt: "2026-03-01T09:00:00Z" },
      { id: 2, text: "Arrange crane hire", done: false, dueDate: "2026-03-14", assignedTo: "Mike Chen", createdAt: "2026-03-02T10:00:00Z" },
      { id: 3, text: "Waterproof membrane delivery", done: false, dueDate: "2026-03-18", assignedTo: "Dan Wright", createdAt: "2026-03-03T11:00:00Z" },
    ],
    notes: [], activityLog: [{ ts: "2026-02-15 10:00", user: "Alex Jones", action: "Job created" }, { ts: "2026-02-16 14:00", user: "Alex Jones", action: "Quote Q-0002 added" }] },
  { id: 3, title: "Kitchen Renovation", clientId: 3, siteId: 301, status: "scheduled", priority: "medium", description: "Full kitchen demo and rebuild with new cabinetry, benchtops and appliances.", startDate: "2026-03-20", dueDate: "2026-04-20", assignedTo: ["Sarah Lee", "Dan Wright"], tags: ["renovation", "residential"], createdAt: "2026-02-20", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 }, phases: [], tasks: [], notes: [], activityLog: [{ ts: "2026-02-20 11:00", user: "Alex Jones", action: "Job created" }] },
  { id: 4, title: "HVAC Maintenance – Q1", clientId: 4, siteId: 401, status: "completed", priority: "low", description: "Quarterly service and filter replacement across all HVAC units.", startDate: "2026-01-15", dueDate: "2026-01-20", assignedTo: ["Tom Baker"], tags: ["hvac", "maintenance"], createdAt: "2026-01-10", estimate: { labour: 800, materials: 400, subcontractors: 0, other: 100 }, phases: [], tasks: [], notes: [], activityLog: [{ ts: "2026-01-10 08:00", user: "Alex Jones", action: "Job created" }, { ts: "2026-01-20 16:00", user: "Tom Baker", action: "Status changed to Completed" }] },
  { id: 5, title: "Bathroom Tiling & Fixtures", clientId: 1, siteId: null, status: "draft", priority: "low", description: "Re-tile master bathroom and replace all fixtures.", startDate: "", dueDate: "", assignedTo: [], tags: ["tiling", "plumbing"], createdAt: "2026-02-28", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 }, phases: [], tasks: [], notes: [], activityLog: [{ ts: "2026-02-28 15:00", user: "Alex Jones", action: "Job created" }] },
];

const SEED_QUOTES = [
  { id: 1, jobId: 1, number: "Q-0001", status: "accepted", lineItems: [{ desc: "Labour – Demolition", qty: 16, unit: "hrs", rate: 95 }, { desc: "Partition Walls (supply & install)", qty: 4, unit: "ea", rate: 1200 }, { desc: "Electrical Works", qty: 1, unit: "lot", rate: 3500 }], tax: 10, notes: "Quote valid for 30 days.", createdAt: "2026-02-01" },
  { id: 2, jobId: 2, number: "Q-0002", status: "sent", lineItems: [{ desc: "Roof Sheet Replacement", qty: 24, unit: "m²", rate: 85 }, { desc: "Waterproof Membrane", qty: 40, unit: "m²", rate: 65 }, { desc: "Labour", qty: 20, unit: "hrs", rate: 90 }], tax: 10, notes: "Materials subject to availability.", createdAt: "2026-02-16" },
  { id: 3, jobId: 3, number: "Q-0003", status: "draft", lineItems: [{ desc: "Cabinetry Supply & Install", qty: 1, unit: "lot", rate: 8500 }, { desc: "Benchtops – Stone", qty: 6, unit: "lm", rate: 650 }, { desc: "Tiling", qty: 18, unit: "m²", rate: 95 }], tax: 10, notes: "", createdAt: "2026-02-21" },
];

const SEED_SCHEDULE = [
  { id: 1, jobId: 1, title: "Demo Day", date: "2026-03-09", startTime: "07:00", endTime: "15:00", assignedTo: ["Tom Baker", "Sarah Lee"], notes: "Bring PPE. Access via loading dock." },
  { id: 2, jobId: 1, title: "Partition Install", date: "2026-03-10", startTime: "07:00", endTime: "16:00", assignedTo: ["Tom Baker"], notes: "" },
  { id: 3, jobId: 1, title: "Electrical Rough-in", date: "2026-03-11", startTime: "07:00", endTime: "15:00", assignedTo: ["Mike Chen"], notes: "Coordinate with Apex Electrical." },
  { id: 4, jobId: 2, title: "Roof Measure", date: "2026-03-12", startTime: "08:00", endTime: "12:00", assignedTo: ["Dan Wright"], notes: "Take drone photos." },
  { id: 5, jobId: 1, title: "Plasterboard", date: "2026-03-13", startTime: "07:00", endTime: "16:00", assignedTo: ["Tom Baker", "Dan Wright"], notes: "Level 3 ceiling sheets." },
  { id: 6, jobId: 4, title: "HVAC Service", date: "2026-03-13", startTime: "09:00", endTime: "12:00", assignedTo: ["Priya Sharma"], notes: "All 6 units on level 2." },
  { id: 7, jobId: 3, title: "Kitchen Demo", date: "2026-03-16", startTime: "08:00", endTime: "14:00", assignedTo: ["Sarah Lee", "Dan Wright"], notes: "Client will not be home – key under mat." },
  { id: 8, jobId: 1, title: "Painting Prep", date: "2026-03-17", startTime: "07:00", endTime: "15:00", assignedTo: ["Tom Baker"], notes: "Sand and prime all walls." },
  { id: 9, jobId: 2, title: "Roof Sheet Delivery", date: "2026-03-18", startTime: "06:00", endTime: "08:00", assignedTo: ["Dan Wright", "Mike Chen"], notes: "Crane on site 6:30am." },
  { id: 10, jobId: 3, title: "Cabinet Install", date: "2026-03-19", startTime: "08:00", endTime: "16:00", assignedTo: ["Sarah Lee"], notes: "" },
  { id: 11, jobId: 1, title: "Final Inspection", date: "2026-03-20", startTime: "10:00", endTime: "12:00", assignedTo: ["Tom Baker", "Priya Sharma"], notes: "Client attending." },
];

const SEED_FUTURE_SCHEDULE = [
  { id: 1, jobId: 1, weekStart: "2026-03-30", title: "Painting & Touch-ups", assignedTo: ["Tom Baker", "Dan Wright"], notes: "All Level 3 walls and ceilings." },
  { id: 2, jobId: 3, weekStart: "2026-03-30", title: "Benchtop Measure & Template", assignedTo: ["Sarah Lee"], notes: "Stone mason on site." },
  { id: 3, jobId: 2, weekStart: "2026-04-06", title: "Membrane Application", assignedTo: ["Mike Chen", "Dan Wright"], notes: "Weather dependent — need 3 dry days." },
  { id: 4, jobId: 1, weekStart: "2026-04-06", title: "Final Fix Electrical", assignedTo: ["Mike Chen"], notes: "GPOs, switches, downlights." },
  { id: 5, jobId: 3, weekStart: "2026-04-13", title: "Benchtop Install", assignedTo: ["Sarah Lee", "Tom Baker"], notes: "Crane may be required for stone." },
  { id: 6, jobId: 2, weekStart: "2026-04-20", title: "New Roof Sheets Install", assignedTo: ["Dan Wright", "Mike Chen"], notes: "24m² Colorbond sheets." },
  { id: 7, jobId: 3, weekStart: "2026-04-27", title: "Splashback & Appliances", assignedTo: ["Sarah Lee"], notes: "Tiler + plumber on site." },
  { id: 8, jobId: 1, weekStart: "2026-05-04", title: "Handover & Defects", assignedTo: ["Tom Baker", "Priya Sharma"], notes: "Client walkthrough and sign-off." },
];

const SEED_TIME = [
  { id: 1, jobId: 1, worker: "Tom Baker",   date: "2026-03-10", startTime: "07:00", endTime: "15:00", hours: 8,   description: "Demolition works", billable: true },
  { id: 2, jobId: 1, worker: "Sarah Lee",   date: "2026-03-10", startTime: "07:00", endTime: "15:00", hours: 8,   description: "Demolition works", billable: true },
  { id: 3, jobId: 1, worker: "Tom Baker",   date: "2026-03-11", startTime: "07:00", endTime: "16:00", hours: 9,   description: "Partition framing", billable: true },
  { id: 4, jobId: 4, worker: "Tom Baker",   date: "2026-01-17", startTime: "09:00", endTime: "12:00", hours: 3,   description: "HVAC filter replacement x6", billable: true },
  { id: 5, jobId: 1, worker: "Mike Chen",   date: "2026-03-09", startTime: "08:00", endTime: "14:00", hours: 6,   description: "Electrical rough-in coordination", billable: true },
  { id: 6, jobId: 3, worker: "Sarah Lee",   date: "2026-03-05", startTime: "08:00", endTime: "12:00", hours: 4,   description: "Kitchen site measure-up", billable: false },
  { id: 7, jobId: 1, worker: "Dan Wright",  date: "2026-03-11", startTime: "08:00", endTime: "15:30", hours: 7.5, description: "Plasterboard installation", billable: true },
];

const SEED_BILLS = [
  { id: 1, jobId: 1, supplier: "BuildRight Supplies", invoiceNo: "BR-4421", date: "2026-03-09", amount: 2340.00, amountExGst: 2127.27, gstAmount: 212.73, hasGst: true, category: "Materials", description: "Timber framing, plasterboard, screws", status: "posted", markup: 15, notes: "", capturedAt: "2026-03-09" },
  { id: 2, jobId: 1, supplier: "ElecPro", invoiceNo: "EP-0091", date: "2026-03-12", amount: 1850.00, amountExGst: 1681.82, gstAmount: 168.18, hasGst: true, category: "Subcontractor", description: "Electrical rough-in", status: "approved", markup: 0, notes: "Awaiting sign-off from project manager", capturedAt: "2026-03-12" },
  { id: 3, jobId: 4, supplier: "CoolAir Parts", invoiceNo: "CA-771", date: "2026-01-17", amount: 480.00, amountExGst: 436.36, gstAmount: 43.64, hasGst: true, category: "Materials", description: "HVAC filters x6", status: "posted", markup: 10, notes: "", capturedAt: "2026-01-17" },
  { id: 4, jobId: null, supplier: "Metro Hire Co", invoiceNo: "MH-2291", date: "2026-03-08", amount: 660.00, amountExGst: 600.00, gstAmount: 60.00, hasGst: true, category: "Plant & Equipment", description: "Scissor lift hire – 3 days", status: "inbox", markup: 0, notes: "", capturedAt: "2026-03-08" },
  { id: 5, jobId: null, supplier: "Bunnings Trade", invoiceNo: "BT-00412", date: "2026-03-07", amount: 387.50, amountExGst: 387.50, gstAmount: 0, hasGst: false, category: "Materials", description: "Paint, brushes, drop sheets", status: "inbox", markup: 0, notes: "Receipt photographed – check GST treatment", capturedAt: "2026-03-07" },
  { id: 6, jobId: 2, supplier: "Roofmaster Supplies", invoiceNo: "RM-8801", date: "2026-03-14", amount: 3200.00, amountExGst: 2909.09, gstAmount: 290.91, hasGst: true, category: "Materials", description: "Roof sheets x24, waterproof membrane", status: "linked", markup: 12, notes: "", capturedAt: "2026-03-14" },
  { id: 7, jobId: 3, supplier: "Cabinet Kings", invoiceNo: "CK-3310", date: "2026-03-02", amount: 9240.00, amountExGst: 8400.00, gstAmount: 840.00, hasGst: true, category: "Subcontractor", description: "Kitchen cabinetry fabrication & delivery", status: "approved", markup: 0, notes: "", capturedAt: "2026-03-02" },
  { id: 8, jobId: 1, supplier: "Apex Electrical Pty Ltd", invoiceNo: "AE-1150", date: "2026-03-10", amount: 4620.00, amountExGst: 4200.00, gstAmount: 420.00, hasGst: true, category: "Subcontractor", description: "Electrical rough-in – ground floor", status: "approved", markup: 0, notes: "", capturedAt: "2026-03-10" },
  { id: 9, jobId: 2, supplier: "Ironclad Roofing Co.", invoiceNo: "IR-0087", date: "2026-03-11", amount: 7150.00, amountExGst: 6500.00, gstAmount: 650.00, hasGst: true, category: "Subcontractor", description: "Metal roof installation – stage 1", status: "posted", markup: 0, notes: "", capturedAt: "2026-03-11" },
  { id: 10, jobId: 1, supplier: "Blue Ridge Plumbing", invoiceNo: "BRP-442", date: "2026-03-05", amount: 3300.00, amountExGst: 3000.00, gstAmount: 300.00, hasGst: true, category: "Subcontractor", description: "Plumbing rough-in & hot water connection", status: "linked", markup: 0, notes: "", capturedAt: "2026-03-05" },
  { id: 11, jobId: 3, supplier: "Precision Carpentry", invoiceNo: "PC-2201", date: "2026-02-28", amount: 5500.00, amountExGst: 5000.00, gstAmount: 500.00, hasGst: true, category: "Subcontractor", description: "Custom joinery – master bedroom wardrobe", status: "posted", markup: 0, notes: "", capturedAt: "2026-02-28" },
];

const SEED_REMINDERS = [
  { id: 1, text: "Chase Tom for site photos from Level 3 fitout", type: "text", dueDate: "2026-03-14", status: "pending", jobId: 1, createdAt: "2026-03-10T08:00:00Z" },
  { id: 2, text: "HVAC maintenance prep", type: "checklist", items: [{ id: 1, text: "Order replacement filters", done: false }, { id: 2, text: "Book technician for Thursday", done: true }, { id: 3, text: "Notify tenant of scheduled downtime", done: false }], dueDate: "2026-03-15", status: "pending", jobId: 4, createdAt: "2026-03-11T09:30:00Z" },
  { id: 3, text: "Follow up with council on DA approval", type: "text", dueDate: "2026-03-12", status: "pending", jobId: null, createdAt: "2026-03-08T14:00:00Z" },
  { id: 4, text: "Send updated quote to Hartwell Properties", type: "text", dueDate: "2026-03-17", status: "pending", jobId: 1, createdAt: "2026-03-12T10:00:00Z" },
  { id: 5, text: "Kitchen demo day prep", type: "checklist", items: [{ id: 1, text: "Book skip bin", done: false }, { id: 2, text: "Confirm demolition crew", done: false }, { id: 3, text: "Disconnect plumbing", done: true }], dueDate: "2026-03-19", status: "pending", jobId: 3, createdAt: "2026-03-13T07:45:00Z" },
  { id: 6, text: "Review contractor insurance docs before they expire", type: "text", dueDate: "2026-03-10", status: "pending", jobId: null, createdAt: "2026-03-05T11:00:00Z" },
  { id: 7, text: "Roof delivery checklist", type: "checklist", items: [{ id: 1, text: "Confirm delivery time with supplier", done: true }, { id: 2, text: "Clear site access for truck", done: true }], dueDate: "2026-03-11", status: "completed", jobId: 2, createdAt: "2026-03-07T08:30:00Z" },
  { id: 8, text: "Submit BAS for Q3", type: "text", dueDate: "2026-03-08", status: "completed", jobId: null, createdAt: "2026-03-01T09:00:00Z" },
];

const SEED_CALL_LOG = [
  { id: 1, direction: "inbound", from: "James Hartwell", phone: "+61 412 345 678", date: "2026-03-14T09:15:00Z", duration: 185, status: "completed", actions: [
    { type: "reminder", description: "Created reminder: Chase Tom for site photos from Level 3 fitout", time: "00:42", link: { page: "reminders" } },
    { type: "note", description: "Client asked about timeline for electrical rough-in completion", time: "01:10", link: { page: "jobs" } },
    { type: "schedule", description: "Scheduled site inspection for March 17 at 10am", time: "02:35", link: { page: "schedule" } },
  ]},
  { id: 2, direction: "inbound", from: "Sarah O'Brien", phone: "+61 421 987 654", date: "2026-03-13T14:30:00Z", duration: 127, status: "completed", actions: [
    { type: "quote", description: "Requested quote for additional plumbing work in bathroom 3", time: "00:30", link: { page: "quotes" } },
    { type: "note", description: "Mentioned potential water pressure issue on Level 2", time: "01:45", link: { page: "jobs" } },
  ]},
  { id: 3, direction: "outbound", to: "Mark Simmons", phone: "+61 433 111 222", date: "2026-03-13T11:00:00Z", duration: 95, status: "completed", actions: [
    { type: "task", description: "Prompted to complete electrical rough-in sign-off for Job #1", time: "00:15", link: { page: "jobs" } },
    { type: "confirmation", description: "Confirmed will complete by end of day Friday", time: "01:10" },
  ]},
  { id: 4, direction: "inbound", from: "Unknown Caller", phone: "+61 400 000 111", date: "2026-03-12T16:45:00Z", duration: 42, status: "missed", actions: []},
  { id: 5, direction: "outbound", to: "Tom Richards", phone: "+61 455 666 777", date: "2026-03-12T10:20:00Z", duration: 210, status: "completed", actions: [
    { type: "task", description: "Prompted to upload site photos for Level 3 fitout", time: "00:20", link: { page: "jobs" } },
    { type: "reminder", description: "Set follow-up reminder for March 14 if photos not received", time: "02:50", link: { page: "reminders" } },
    { type: "note", description: "Tom mentioned scaffolding needs inspection before Friday", time: "03:15", link: { page: "schedule" } },
  ]},
  { id: 6, direction: "inbound", from: "Council Planning Dept", phone: "+61 2 9000 5555", date: "2026-03-11T09:00:00Z", duration: 320, status: "completed", actions: [
    { type: "note", description: "DA approval for 42 Park Rd expected by March 20", time: "01:00" },
    { type: "reminder", description: "Created reminder: Follow up with council on DA approval", time: "04:50", link: { page: "reminders" } },
  ]},
  { id: 7, direction: "inbound", from: "James Hartwell", phone: "+61 412 345 678", date: "2026-03-10T08:30:00Z", duration: 156, status: "completed", actions: [
    { type: "quote", description: "Approved Quote Q-0001 for Office Fitout Level 3", time: "00:45", link: { page: "quotes" } },
    { type: "schedule", description: "Confirmed start date of March 12 for fitout works", time: "02:00", link: { page: "schedule" } },
  ]},
  { id: 8, direction: "outbound", to: "Sarah O'Brien", phone: "+61 421 987 654", date: "2026-03-09T15:10:00Z", duration: 0, status: "no_answer", actions: []},
  { id: 9, direction: "inbound", from: "Bunnings Trade Desk", phone: "+61 2 8800 1234", date: "2026-03-07T13:20:00Z", duration: 88, status: "completed", actions: [
    { type: "note", description: "Order BT-00412 ready for pickup — paint, brushes, drop sheets", time: "00:30", link: { page: "bills" } },
  ]},
  { id: 10, direction: "outbound", to: "Mark Simmons", phone: "+61 433 111 222", date: "2026-03-05T08:00:00Z", duration: 145, status: "completed", actions: [
    { type: "task", description: "Prompted to submit timesheet for week ending March 2", time: "00:10", link: { page: "time" } },
    { type: "confirmation", description: "Confirmed timesheet submitted", time: "01:55" },
    { type: "note", description: "Requested day off on March 14 — approved", time: "02:20", link: { page: "schedule" } },
  ]},
];

const SEED_INVOICES = [
  { id: 1, jobId: 4, number: "INV-0001", status: "paid", lineItems: [{ desc: "HVAC Quarterly Maintenance", qty: 1, unit: "lot", rate: 950 }, { desc: "Replacement Filters x6", qty: 6, unit: "ea", rate: 95 }], tax: 10, dueDate: "2026-02-17", notes: "Thank you for your business.", createdAt: "2026-01-20" },
];

const DEFAULT_COMPANY = { companyName: "FieldOps Pty Ltd", abn: "12 345 678 901", address: "22 King St, Sydney NSW 2000", phone: "02 9000 1234", email: "admin@fieldops.com" };
const DEFAULT_COLUMNS = { description: true, qty: true, unit: true, unitPrice: true, lineTotal: true, gst: true };
const SEED_TEMPLATES = [
  { id: 1, name: "Default", type: "quote", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#111111", footer: "Thank you for your business.", terms: "This quote is valid for 30 days from the date of issue.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Quote {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached quote {{number}} for {{jobTitle}}.\n\nTotal: {{total}} (inc. GST)\n\nIf you have any questions, please don't hesitate to get in touch.\n\nKind regards,\n{{companyName}}" },
  { id: 2, name: "Default", type: "invoice", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#4f46e5", footer: "Thank you for your prompt payment.", terms: "Payment due within 14 days of invoice date. Please reference the invoice number with your payment.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Invoice {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached invoice {{number}} for {{jobTitle}}.\n\nTotal: {{total}} (inc. GST)\nDue: {{dueDate}}\n\nKind regards,\n{{companyName}}" },
  { id: 3, name: "Default", type: "work_order", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#2563eb", footer: "", terms: "Please confirm acceptance of this work order within 48 hours.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Work Order {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached work order {{number}} for {{jobTitle}}.\n\nScope and pricing details are included in the attached document.\n\nPlease confirm your acceptance at your earliest convenience.\n\nKind regards,\n{{companyName}}" },
  { id: 4, name: "Default", type: "purchase_order", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#059669", footer: "", terms: "Please deliver by the date specified. Reference this PO number on your invoice.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Purchase Order {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached purchase order {{number}}.\n\nPlease confirm receipt and expected delivery date.\n\nKind regards,\n{{companyName}}" },
];

const TEAM_DATA = [
  { name: "Tom Baker", costRate: 55, chargeRate: 95 },
  { name: "Sarah Lee", costRate: 50, chargeRate: 85 },
  { name: "Mike Chen", costRate: 60, chargeRate: 100 },
  { name: "Dan Wright", costRate: 48, chargeRate: 80 },
  { name: "Priya Sharma", costRate: 52, chargeRate: 90 },
];
const TEAM = TEAM_DATA.map(t => t.name);

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const calcQuoteTotal = (q) => {
  const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
  return sub * (1 + q.tax / 100);
};
const uid = () => Date.now() + Math.random();

// ── Activity Log Helpers ──────────────────────────────────────────────────────
// Set dynamically from auth context inside App — defaults to seed data name
let CURRENT_USER = "Alex Jones";
const nowTs = () => {
  const d = new Date();
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
};
const mkLog = (action, user = CURRENT_USER) => ({ ts: nowTs(), user, action });
const addLog = (prev, action, user = CURRENT_USER) => [...(prev || []), mkLog(action, user)];

// ── Note Categories ─────────────────────────────────────────────────────────
const NOTE_CATEGORIES = [
  { id: "general", label: "General", color: "#64748b" },
  { id: "site_update", label: "Site Update", color: "#0891b2" },
  { id: "issue", label: "Issue", color: "#dc2626" },
  { id: "inspection", label: "Inspection", color: "#7c3aed" },
  { id: "delivery", label: "Delivery", color: "#d97706" },
  { id: "safety", label: "Safety", color: "#059669" },
  { id: "form", label: "Form", color: "#2563eb" },
];

// ── Form Templates ──────────────────────────────────────────────────────────
const FORM_TEMPLATES = [
  { id: "swms", name: "SWMS / HPS", icon: "⚠️", fields: [
    { key: "jobDescription", label: "Job Description", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "supervisor", label: "Supervisor", type: "text" },
    { key: "hazards", label: "Identified Hazards", type: "textarea" },
    { key: "controls", label: "Control Measures", type: "textarea" },
    { key: "ppe", label: "PPE Required", type: "checklist", options: ["Hard Hat", "Safety Glasses", "High-Vis Vest", "Steel Cap Boots", "Gloves", "Ear Protection", "Dust Mask", "Fall Harness"] },
    { key: "workersBriefed", label: "Workers Briefed", type: "textarea" },
    { key: "signature", label: "Supervisor Signature", type: "signature" },
  ]},
  { id: "service_report", name: "Service Report", icon: "🔧", fields: [
    { key: "client", label: "Client", type: "text" },
    { key: "site", label: "Site", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "technician", label: "Technician", type: "text" },
    { key: "arrivalTime", label: "Arrival Time", type: "time" },
    { key: "departureTime", label: "Departure Time", type: "time" },
    { key: "workPerformed", label: "Work Performed", type: "textarea" },
    { key: "materialsUsed", label: "Materials Used", type: "textarea" },
    { key: "followUp", label: "Follow-up Actions", type: "checklist", options: ["Parts on order", "Return visit required", "Quote to follow", "Warranty claim", "No further action"] },
    { key: "clientSignature", label: "Client Signature", type: "signature" },
  ]},
  { id: "take5", name: "Take 5", icon: "✋", fields: [
    { key: "date", label: "Date", type: "date" },
    { key: "worker", label: "Worker Name", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "safetyChecks", label: "Safety Checks", type: "checklist", options: [
      "Do I know the task and how to do it safely?",
      "Am I fit for duty (not fatigued, medicated, etc)?",
      "Have I identified all hazards?",
      "Are tools and equipment in good condition?",
      "Is the work area clean and clear?",
      "Are others in the area safe from my work?",
      "Do I have the right PPE?",
      "Do I know emergency procedures?",
      "Have I checked for overhead/underground services?",
      "Am I comfortable to proceed?"
    ]},
    { key: "additionalHazards", label: "Additional Hazards Identified", type: "textarea" },
    { key: "controlActions", label: "Control Actions Taken", type: "textarea" },
    { key: "signature", label: "Worker Signature", type: "signature" },
  ]},
];

// ── Orders: Seed Data ────────────────────────────────────────────────────────
const ORDER_CONTRACTORS = [
  { id: "c1", name: "Apex Electrical Pty Ltd", contact: "Mark Simmons", email: "mark@apexelec.com.au", phone: "0412 345 678", trade: "Electrical" },
  { id: "c2", name: "Blue Ridge Plumbing", contact: "Sarah O'Brien", email: "sarah@blueridgeplumbing.com.au", phone: "0421 987 654", trade: "Plumbing" },
  { id: "c3", name: "Coastal Civil Works", contact: "Tom Fletcher", email: "tom@coastalcivil.com.au", phone: "0433 112 233", trade: "Civil" },
  { id: "c4", name: "Ironclad Roofing Co.", contact: "Dave Nguyen", email: "dave@ironcladroofing.com.au", phone: "0455 667 788", trade: "Roofing" },
];
const ORDER_SUPPLIERS = [
  { id: "s1", name: "Reece Plumbing & Bathrooms", contact: "Accounts", email: "accounts@reece.com.au", phone: "1300 555 000", abn: "12 345 678 901" },
  { id: "s2", name: "Bunnings Trade", contact: "Trade Desk", email: "trade@bunnings.com.au", phone: "1300 888 111", abn: "23 456 789 012" },
  { id: "s3", name: "Middy's Electrical", contact: "Sales", email: "sales@middys.com.au", phone: "03 9412 5555", abn: "34 567 890 123" },
  { id: "s4", name: "Clark Rubber & Foam", contact: "Warehouse", email: "orders@clarkrubber.com.au", phone: "1800 252 759", abn: "45 678 901 234" },
];
const ORDER_UNITS = ["hr", "day", "ea", "m", "m2", "m3", "kg", "t", "L", "lm", "set", "lot"];

// ── Orders: Status Pipeline ──────────────────────────────────────────────────
const ORDER_STATUSES = ["Draft", "Approved", "Sent", "Viewed", "Accepted", "Completed", "Billed", "Cancelled"];
const ORDER_TRANSITIONS = {
  Draft: ["Approved", "Cancelled"], Approved: ["Sent", "Draft", "Cancelled"], Sent: ["Viewed", "Accepted", "Cancelled"],
  Viewed: ["Accepted", "Cancelled"], Accepted: ["Completed", "Cancelled"], Completed: ["Billed"], Billed: [], Cancelled: ["Draft"],
};
const ORDER_STATUS_TRIGGERS = {
  Sent: "Triggered automatically when document is emailed",
  Viewed: "Triggered when recipient opens the document link",
  Billed: "Triggered when matched to a bill in Job Management",
};
const ORDER_TERMINAL = ["Billed", "Cancelled"];
const ORDER_ACTIVE = ["Approved", "Sent", "Viewed", "Accepted", "Completed"];
const ORDER_STATUS_PROGRESS = { Draft: 0, Approved: 15, Sent: 30, Viewed: 45, Accepted: 60, Completed: 80, Billed: 100, Cancelled: 0 };
const ORDER_STATUS_COLORS = {
  Draft: { bg: "#f1f5f9", text: "#475569" }, Approved: { bg: "#e0f2fe", text: "#0369a1" }, Sent: { bg: "#dbeafe", text: "#1d4ed8" },
  Viewed: { bg: "#ede9fe", text: "#6d28d9" }, Accepted: { bg: "#fef3c7", text: "#b45309" }, Completed: { bg: "#d1fae5", text: "#047857" },
  Billed: { bg: "#ccfbf1", text: "#0f766e" }, Cancelled: { bg: "#fee2e2", text: "#dc2626" },
};
const ORDER_BAR_COLORS = {
  Draft: "#cbd5e1", Approved: "#38bdf8", Sent: "#60a5fa", Viewed: "#a78bfa", Accepted: "#fbbf24", Completed: "#34d399", Billed: "#2dd4bf", Cancelled: "#fca5a5",
};

// ── Section Color Palette ────────────────────────────────────────────────────
const SECTION_COLORS = {
  dashboard: { accent: "#111111", light: "#f5f5f5" },
  jobs:      { accent: "#ea580c", light: "#fff7ed" },
  wo:        { accent: "#2563eb", light: "#eff6ff" },
  po:        { accent: "#059669", light: "#ecfdf5" },
  clients:   { accent: "#7c3aed", light: "#f5f3ff" },
  schedule:  { accent: "#0891b2", light: "#ecfeff" },
  quotes:    { accent: "#ca8a04", light: "#fefce8" },
  time:      { accent: "#be185d", light: "#fdf2f8" },
  bills:     { accent: "#dc2626", light: "#fef2f2" },
  invoices:  { accent: "#4f46e5", light: "#eef2ff" },
  activity:  { accent: "#64748b", light: "#f8fafc" },
  orders:    { accent: "#2563eb", light: "#eff6ff" },
  contractors: { accent: "#0d9488", light: "#f0fdfa" },
  suppliers: { accent: "#d97706", light: "#fffbeb" },
  actions:   { accent: "#ef4444", light: "#fef2f2" },
  reminders: { accent: "#f59e0b", light: "#fffbeb" },
  status: { accent: "#059669", light: "#ecfdf5" },
  settings: { accent: "#6b7280", light: "#f9fafb" },
  files: { accent: "#8b5cf6", light: "#f5f3ff" },
  calllog: { accent: "#0891b2", light: "#ecfeff" },
};
const hexToRgba = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

// ── View Field (reusable read-only display for View mode) ─────────────────────
const ViewField = ({ label, value }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 14, color: '#111', fontWeight: 500 }}>{value || '—'}</div>
  </div>
);

// ── Orders: Helpers ──────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 9).toUpperCase();
const orderToday = () => new Date().toISOString().slice(0, 10);
const orderAddDays = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const orderFmtDate = (d) => { if (!d) return "—"; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; };
const daysUntil = (dateStr) => { if (!dateStr) return null; return Math.ceil((new Date(dateStr) - new Date(orderToday())) / (1000 * 60 * 60 * 24)); };
const fmtFileSize = (bytes) => { if (bytes < 1024) return bytes + " B"; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / (1024 * 1024)).toFixed(1) + " MB"; };
const orderFmtTs = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
};
const makeLogEntry = (action, detail = "", auto = false) => ({ id: genId(), ts: new Date().toISOString(), action, detail, auto });
const orderAddLog = (order, action, detail = "", auto = false) => ({ ...order, auditLog: [...(order.auditLog || []), makeLogEntry(action, detail, auto)] });
const applyTransition = (order, newStatus, extraDetail = "") => {
  const old = order.status;
  const detail = extraDetail || (ORDER_STATUS_TRIGGERS[newStatus] ? ORDER_STATUS_TRIGGERS[newStatus] : "");
  const auto = !!ORDER_STATUS_TRIGGERS[newStatus];
  return orderAddLog({ ...order, status: newStatus }, `Status changed: ${old} → ${newStatus}`, detail, auto);
};
const orderJobDisplay = (job) => {
  if (!job) return null;
  const ref = job.jobNumber || ("J-" + String(job.id).padStart(4, "0"));
  return { ref, name: job.title, client: job.clientName || "" };
};

// ── Orders: Seed Work Orders & Purchase Orders ───────────────────────────────
const SEED_WO = [
  { id: "WO001", ref: "WO-101", status: "Sent", contractorId: "c1", contractorName: "Apex Electrical Pty Ltd", contractorContact: "Mark Simmons", contractorEmail: "mark@apexelec.com.au", contractorPhone: "0412 345 678", trade: "Electrical", jobId: 2, issueDate: orderAddDays(orderToday(), -10), dueDate: orderAddDays(orderToday(), 2), poLimit: "12000", scopeOfWork: "Supply and install new DB boards and run conduit per electrical plans.\n\nScope includes:\n• Installation of 2x DB boards\n• Run all conduit and cabling per plans\n• Termination and testing of all circuits\n• As-built drawings to be provided on completion", notes: "Payment 14 days from completion.", internalNotes: "", attachments: [], auditLog: [
    { id: "al1", ts: new Date(Date.now() - 10*86400000).toISOString(), action: "Created", detail: "Work order created", auto: false },
    { id: "al2", ts: new Date(Date.now() - 10*86400000 + 3600000).toISOString(), action: "Status changed: Draft → Approved", detail: "", auto: false },
    { id: "al3", ts: new Date(Date.now() - 8*86400000).toISOString(), action: "Status changed: Approved → Sent", detail: "Triggered automatically when document is emailed", auto: true },
  ]},
  { id: "WO002", ref: "WO-102", status: "Accepted", contractorId: "c4", contractorName: "Ironclad Roofing Co.", contractorContact: "Dave Nguyen", contractorEmail: "dave@ironcladroofing.com.au", contractorPhone: "0455 667 788", trade: "Roofing", jobId: 2, issueDate: orderAddDays(orderToday(), -5), dueDate: orderAddDays(orderToday(), 9), poLimit: "8500", scopeOfWork: "Repair and reseal damaged roof sections.\n\n• Cut out and replace damaged sheeting\n• Apply new waterproof membrane\n• Inspect and reseal all penetrations", notes: "", internalNotes: "Check scaffolding.", attachments: [], auditLog: [
    { id: "al4", ts: new Date(Date.now() - 5*86400000).toISOString(), action: "Created", detail: "Work order created", auto: false },
    { id: "al5", ts: new Date(Date.now() - 4*86400000).toISOString(), action: "Status changed: Draft → Approved", detail: "", auto: false },
    { id: "al6", ts: new Date(Date.now() - 3*86400000).toISOString(), action: "Status changed: Approved → Sent", detail: "Triggered automatically when document is emailed", auto: true },
    { id: "al7", ts: new Date(Date.now() - 2*86400000).toISOString(), action: "Status changed: Sent → Accepted", detail: "", auto: false },
  ]},
  { id: "WO003", ref: "WO-103", status: "Draft", contractorId: "c2", contractorName: "Blue Ridge Plumbing", contractorContact: "Sarah O'Brien", contractorEmail: "sarah@blueridgeplumbing.com.au", contractorPhone: "0421 987 654", trade: "Plumbing", jobId: 3, issueDate: orderToday(), dueDate: orderAddDays(orderToday(), -3), poLimit: "6000", scopeOfWork: "Rough-in plumbing for 6 bathrooms.", notes: "", internalNotes: "", attachments: [], auditLog: [
    { id: "al9", ts: new Date(Date.now() - 86400000).toISOString(), action: "Created", detail: "Work order created", auto: false },
  ]},
];
const SEED_PO = [
  { id: "PO001", ref: "PO-201", status: "Accepted", supplierId: "s1", supplierName: "Reece Plumbing & Bathrooms", supplierContact: "Accounts", supplierEmail: "accounts@reece.com.au", supplierAbn: "12 345 678 901", jobId: 3, issueDate: orderAddDays(orderToday(), -7), dueDate: orderToday(), poLimit: "9500", deliveryAddress: "22 Harbourview Rd, Docklands VIC 3008", lines: [{ id: "f", desc: "Shower mixer — Methven Aio", qty: "6", unit: "ea" }, { id: "g", desc: "Waterproofing membrane", qty: "24", unit: "m2" }], notes: "Please call site 30 mins before delivery.", internalNotes: "", attachments: [], auditLog: [
    { id: "alp1", ts: new Date(Date.now() - 7*86400000).toISOString(), action: "Created", detail: "Purchase order created", auto: false },
    { id: "alp2", ts: new Date(Date.now() - 6*86400000).toISOString(), action: "Status changed: Draft → Approved", detail: "", auto: false },
    { id: "alp3", ts: new Date(Date.now() - 5*86400000).toISOString(), action: "Status changed: Approved → Sent", detail: "Triggered automatically when document is emailed", auto: true },
    { id: "alp4", ts: new Date(Date.now() - 4*86400000).toISOString(), action: "Status changed: Sent → Accepted", detail: "Supplier confirmed", auto: false },
  ]},
  { id: "PO002", ref: "PO-202", status: "Draft", supplierId: "s3", supplierName: "Middy's Electrical", supplierContact: "Sales", supplierEmail: "sales@middys.com.au", supplierAbn: "34 567 890 123", jobId: 2, issueDate: orderToday(), dueDate: orderAddDays(orderToday(), 5), poLimit: "4200", deliveryAddress: "14 Oakwood Ave, Richmond VIC 3121", lines: [{ id: "h", desc: "Cable — 2.5mm TPS", qty: "200", unit: "m" }, { id: "i", desc: "GPO outlets", qty: "40", unit: "ea" }], notes: "", internalNotes: "", attachments: [], auditLog: [
    { id: "alp6", ts: new Date(Date.now() - 7200000).toISOString(), action: "Created", detail: "Purchase order created", auto: false },
  ]},
];

const CONTRACTOR_TRADES = ["Electrical", "Plumbing", "Roofing", "Carpentry", "Painting", "Tiling", "HVAC", "Landscaping", "Other"];

const COMPLIANCE_DOC_TYPES = [
  { id: "workers_comp", label: "Workers Compensation", icon: "shield", reminderDays: [30, 14, 7], fields: ["policyNumber", "insurer", "expiryDate"] },
  { id: "public_liability", label: "Public Liability", icon: "shield", reminderDays: [30, 14, 7], fields: ["policyNumber", "insurer", "coverAmount", "expiryDate"] },
  { id: "white_card", label: "White Card", icon: "badge", reminderDays: [30, 14], fields: ["cardNumber", "holderName", "issueDate"] },
  { id: "trade_license", label: "Trade License", icon: "badge", reminderDays: [30, 14, 7], fields: ["licenseNumber", "licenseClass", "issuingBody", "expiryDate"] },
  { id: "subcontractor_statement", label: "Subcontractor Statement", icon: "file", reminderDays: [14, 7], fields: ["periodFrom", "periodTo", "abn"] },
  { id: "swms", label: "SWMS", icon: "file", reminderDays: [14, 7], fields: ["title", "revision", "approvedBy", "approvalDate"] },
];

const COMPLIANCE_STATUS_COLORS = {
  current: { bg: "#ecfdf5", text: "#059669", label: "Current" },
  expiring_soon: { bg: "#fffbeb", text: "#d97706", label: "Expiring Soon" },
  expired: { bg: "#fef2f2", text: "#dc2626", label: "Expired" },
  missing: { bg: "#f0f0f0", text: "#888", label: "Missing" },
  no_expiry: { bg: "#ecfdf5", text: "#059669", label: "Current" },
};

const getComplianceStatus = (doc) => {
  if (!doc) return "missing";
  if (!doc.expiryDate) return "no_expiry";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(doc.expiryDate + "T00:00:00");
  const diffDays = Math.ceil((expiry - today) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring_soon";
  return "current";
};

const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + "T00:00:00");
  return Math.ceil((expiry - today) / 86400000);
};

const getContractorComplianceCount = (contractor) => {
  const docs = contractor.documents || [];
  let issues = 0;
  COMPLIANCE_DOC_TYPES.forEach(dt => {
    const doc = docs.find(d => d.type === dt.id);
    const status = getComplianceStatus(doc);
    if (status === "expired" || status === "missing") issues++;
  });
  return issues;
};

const SEED_CONTRACTORS = [
  { id: "c1", name: "Apex Electrical Pty Ltd", contact: "Mark Simmons", email: "mark@apexelec.com.au", phone: "0412 345 678", trade: "Electrical", abn: "11 222 333 444", notes: "Preferred electrical contractor. Licensed for commercial.", documents: [
    { id: "d1", type: "workers_comp", policyNumber: "WC-2024-88431", insurer: "iCare NSW", expiryDate: "2026-06-30", fileUrl: null, uploadedAt: "2025-07-01" },
    { id: "d2", type: "public_liability", policyNumber: "PL-990122", insurer: "QBE Insurance", coverAmount: "$20,000,000", expiryDate: "2026-04-15", fileUrl: null, uploadedAt: "2025-04-20" },
    { id: "d3", type: "white_card", cardNumber: "WC-NSW-554321", holderName: "Mark Simmons", issueDate: "2019-03-10", fileUrl: null, uploadedAt: "2025-01-15" },
    { id: "d4", type: "trade_license", licenseNumber: "EC-42891", licenseClass: "Electrical Contractor", issuingBody: "NSW Fair Trading", expiryDate: "2027-01-31", fileUrl: null, uploadedAt: "2025-02-01" },
    { id: "d5", type: "subcontractor_statement", periodFrom: "2025-07-01", periodTo: "2026-06-30", abn: "11 222 333 444", fileUrl: null, uploadedAt: "2025-07-05" },
    { id: "d6", type: "swms", title: "Electrical Installation — Commercial", revision: "Rev 4", approvedBy: "Mark Simmons", approvalDate: "2025-11-01", fileUrl: null, uploadedAt: "2025-11-02" },
  ]},
  { id: "c2", name: "Blue Ridge Plumbing", contact: "Sarah O'Brien", email: "sarah@blueridgeplumbing.com.au", phone: "0421 987 654", trade: "Plumbing", abn: "22 333 444 555", notes: "Handles rough-in and fit-off.", documents: [
    { id: "d7", type: "workers_comp", policyNumber: "WC-2024-66210", insurer: "Allianz", expiryDate: "2026-03-20", fileUrl: null, uploadedAt: "2025-03-25" },
    { id: "d8", type: "public_liability", policyNumber: "PL-445500", insurer: "CGU Insurance", coverAmount: "$10,000,000", expiryDate: "2026-08-01", fileUrl: null, uploadedAt: "2025-08-05" },
    { id: "d9", type: "trade_license", licenseNumber: "PL-29110", licenseClass: "Plumbing Contractor", issuingBody: "NSW Fair Trading", expiryDate: "2026-03-25", fileUrl: null, uploadedAt: "2025-04-01" },
    { id: "d10", type: "swms", title: "Plumbing Rough-in & Fit-off", revision: "Rev 2", approvedBy: "Sarah O'Brien", approvalDate: "2025-09-15", fileUrl: null, uploadedAt: "2025-09-16" },
  ]},
  { id: "c3", name: "Ironclad Roofing Co.", contact: "Dave Nguyen", email: "dave@ironcladroofing.com.au", phone: "0455 667 788", trade: "Roofing", abn: "33 444 555 666", notes: "Specialises in metal and tile roofing.", documents: [
    { id: "d11", type: "workers_comp", policyNumber: "WC-2023-10044", insurer: "iCare NSW", expiryDate: "2025-12-31", fileUrl: null, uploadedAt: "2024-01-10" },
    { id: "d12", type: "public_liability", policyNumber: "PL-778899", insurer: "Zurich", coverAmount: "$20,000,000", expiryDate: "2026-05-30", fileUrl: null, uploadedAt: "2025-06-01" },
  ]},
  { id: "c4", name: "Precision Carpentry", contact: "James Ward", email: "james@precisioncarpentry.com.au", phone: "0433 112 233", trade: "Carpentry", abn: "44 555 666 777", notes: "Custom cabinetry and structural framing.", documents: [
    { id: "d13", type: "workers_comp", policyNumber: "WC-2025-33210", insurer: "GIO", expiryDate: "2026-09-30", fileUrl: null, uploadedAt: "2025-10-01" },
    { id: "d14", type: "public_liability", policyNumber: "PL-221100", insurer: "NRMA", coverAmount: "$10,000,000", expiryDate: "2026-07-15", fileUrl: null, uploadedAt: "2025-07-20" },
    { id: "d15", type: "white_card", cardNumber: "WC-NSW-887654", holderName: "James Ward", issueDate: "2018-06-22", fileUrl: null, uploadedAt: "2025-01-10" },
    { id: "d16", type: "trade_license", licenseNumber: "BC-71543", licenseClass: "Builder — Carpentry", issuingBody: "NSW Fair Trading", expiryDate: "2026-11-30", fileUrl: null, uploadedAt: "2025-12-01" },
    { id: "d17", type: "subcontractor_statement", periodFrom: "2025-07-01", periodTo: "2026-06-30", abn: "44 555 666 777", fileUrl: null, uploadedAt: "2025-07-10" },
    { id: "d18", type: "swms", title: "Structural Framing — Residential", revision: "Rev 3", approvedBy: "James Ward", approvalDate: "2025-10-20", fileUrl: null, uploadedAt: "2025-10-21" },
  ]},
];
const SEED_SUPPLIERS = [
  { id: "s1", name: "Reece Plumbing & Bathrooms", contact: "Accounts", email: "accounts@reece.com.au", phone: "03 9123 4567", abn: "12 345 678 901", notes: "Trade account — 30-day terms." },
  { id: "s2", name: "Middy's Electrical", contact: "Sales", email: "sales@middys.com.au", phone: "03 9876 5432", abn: "34 567 890 123", notes: "Trade pricing on cable & accessories." },
  { id: "s3", name: "BuildRight Supplies", contact: "Orders Desk", email: "orders@buildright.com.au", phone: "03 9111 2222", abn: "45 678 901 234", notes: "General building materials. Free delivery over $500." },
  { id: "s4", name: "ElecPro", contact: "Accounts", email: "accounts@elecpro.com.au", phone: "03 9333 4444", abn: "56 789 012 345", notes: "" },
  { id: "s5", name: "Metro Hire Co", contact: "Bookings", email: "bookings@metrohire.com.au", phone: "03 9555 6666", abn: "67 890 123 456", notes: "Plant & equipment hire." },
  { id: "s6", name: "CoolAir Parts", contact: "Sales", email: "sales@coolairparts.com.au", phone: "03 9777 8888", abn: "78 901 234 567", notes: "HVAC parts supplier." },
];

// ActivityLog display component
const ActivityLog = ({ entries = [] }) => {
  if (!entries.length) return <div style={{ color: "#bbb", fontSize: 13, padding: "20px 0", textAlign: "center" }}>No activity recorded yet.</div>;
  return (
    <div className="timeline">
      {[...entries].reverse().map((e, i) => (
        <div key={i} className="timeline-item">
          <div className="timeline-dot" />
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600 }}>{e.action}</span>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
              <span style={{ fontWeight: 600, color: "#777" }}>{e.user}</span> · {e.ts}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const STATUS_COLORS = {
  draft: "#999",
  scheduled: "#555",
  quoted: "#333",
  in_progress: "#111",
  completed: "#444",
  cancelled: "#bbb",
};
const STATUS_BG = {
  draft: "#f0f0f0",
  scheduled: "#0891b2",
  quoted: "#ca8a04",
  in_progress: "#ea580c",
  completed: "#059669",
  cancelled: "#f5f5f5",
  sent: "#2563eb",
  accepted: "#059669",
  declined: "#dc2626",
  paid: "#059669",
  overdue: "#dc2626",
  void: "#64748b",
  inbox: "#f0f0f0",
  linked: "#2563eb",
  approved: "#059669",
  posted: "#111",
  pending: "#ca8a04",
};
const STATUS_TEXT = {
  draft: "#888",
  scheduled: "#fff",
  quoted: "#fff",
  in_progress: "#fff",
  completed: "#fff",
  cancelled: "#aaa",
  sent: "#fff",
  accepted: "#fff",
  declined: "#fff",
  paid: "#fff",
  overdue: "#fff",
  void: "#fff",
  inbox: "#888",
  linked: "#fff",
  approved: "#fff",
  posted: "#fff",
  pending: "#fff",
};

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

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 15 }) => {
  const icons = {
    dashboard: "M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z",
    jobs: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    clients: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm8 0a4 4 0 100-8 4 4 0 000 8",
    schedule: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    quotes: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    time: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    bills: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
    invoices: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z",
    plus: "M12 5v14M5 12h14",
    close: "M6 18L18 6M6 6l12 12",
    edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0zm-9.197.196C6.678 8.34 9.112 6 12 6s5.322 2.34 6.197 5.196a.5.5 0 010 .608C17.322 14.66 14.888 17 12 17s-5.322-2.34-6.197-4.196a.5.5 0 010-.608z",
    check: "M5 13l4 4L19 7",
    arrow_right: "M9 5l7 7-7 7",
    dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6",
    copy: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
    send: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
    filter: "M3 4h18M7 12h10M11 20h2",
    activity: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    kanban: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v10m0 4v4M9 17H5a2 2 0 01-2-2v-4m6 6h10a2 2 0 002-2v-4",
    list_view: "M4 6h16M4 10h16M4 14h16M4 18h16",
    grid_view: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    notification: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    orders: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h4m-4 4h4m-8-4h.01m-.01 4h.01",
    contractors: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    suppliers: "M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0",
    settings: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {icons[name] && <path d={icons[name]} />}
    </svg>
  );
};

// ── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const labels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled", sent: "Sent", accepted: "Accepted", declined: "Declined", pending: "Pending", approved: "Approved", paid: "Paid", overdue: "Overdue", void: "Void" };
  return (
    <span className="badge" style={{ background: STATUS_BG[status] || "#f0f0f0", color: STATUS_TEXT[status] || "#666" }}>
      {labels[status] || status}
    </span>
  );
};

// ── Xero Sync Badge ─────────────────────────────────────────────────────────
const XeroSyncBadge = ({ syncStatus, xeroId }) => {
  if (!syncStatus && !xeroId) return null;
  const colors = {
    synced: { bg: "#ecfdf5", text: "#16a34a", label: "Synced" },
    pending: { bg: "#fffbeb", text: "#d97706", label: "Pending" },
    error: { bg: "#fef2f2", text: "#dc2626", label: "Error" },
  };
  const c = colors[syncStatus] || (xeroId ? colors.synced : { bg: "#f5f5f5", text: "#888", label: "Not synced" });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: c.bg, color: c.text, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.text }} />
      Xero
    </span>
  );
};

// ── Avatar Group ─────────────────────────────────────────────────────────────
const AvatarGroup = ({ names = [], max = 3 }) => {
  const shown = names.slice(0, max);
  const extra = names.length - max;
  return (
    <div className="avatar-group">
      {shown.map((n, i) => (
        <div key={i} className="avatar" title={n} style={{ background: ["#111","#333","#555","#777","#999"][i % 5] }}>
          {n.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
        </div>
      ))}
      {extra > 0 && <div className="avatar" style={{ background: "#ccc", color: "#666" }}>+{extra}</div>}
    </div>
  );
};

// ── Close Button ─────────────────────────────────────────────────────────────
const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className="btn btn-ghost" style={{ padding: "6px", borderRadius: "6px" }}><Icon name="close" size={16} /></button>
);

// ── Line Items Editor ─────────────────────────────────────────────────────────
const LineItemsEditor = ({ items, onChange }) => {
  const update = (i, field, val) => {
    const next = items.map((it, idx) => idx === i ? { ...it, [field]: field === "qty" || field === "rate" ? parseFloat(val) || 0 : val } : it);
    onChange(next);
  };
  const add = () => onChange([...items, { desc: "", qty: 1, unit: "hrs", rate: 0 }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const sub = items.reduce((s, l) => s + (l.qty * l.rate), 0);
  return (
    <div>
      <table className="line-items-table">
        <thead>
          <tr>
            <th style={{ width: "40%" }}>Description</th>
            <th style={{ width: "10%" }}>Qty</th>
            <th style={{ width: "12%" }}>Unit</th>
            <th style={{ width: "15%" }}>Rate ($)</th>
            <th style={{ width: "15%" }}>Total</th>
            <th style={{ width: "8%" }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><input value={it.desc} onChange={e => update(i, "desc", e.target.value)} placeholder="Description" /></td>
              <td><input type="number" value={it.qty} onChange={e => update(i, "qty", e.target.value)} min="0" /></td>
              <td>
                <select style={{ width: "100%", border: "1.5px solid #e8e8e8", borderRadius: 4, padding: "5px 7px", fontFamily: "'Open Sans', sans-serif", fontSize: 12 }} value={it.unit} onChange={e => update(i, "unit", e.target.value)}>
                  {["hrs","ea","m²","lm","lot","day","m³","kg"].map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td><input type="number" value={it.rate} onChange={e => update(i, "rate", e.target.value)} min="0" /></td>
              <td style={{ fontWeight: 600 }}>{fmt(it.qty * it.rate)}</td>
              <td><button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "#c00", padding: "4px" }}><Icon name="trash" size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="btn btn-secondary btn-sm"><Icon name="plus" size={12} />Add Line</button>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div className="totals-box">
          <div className="totals-row"><span>Subtotal</span><span>{fmt(sub)}</span></div>
          <div className="totals-row"><span>GST (10%)</span><span>{fmt(sub * 0.1)}</span></div>
          <div className="totals-row total"><span>Total</span><span>{fmt(sub * 1.1)}</span></div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

const OrderIcon = ({ name, size = 16, cls = "" }) => {
  const icons = {
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    shopping: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    bar: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    warning: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    upload: <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    paperclip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    chevdown: <polyline points="6 9 12 15 18 9"/>,
    check: <polyline points="20 6 9 17 4 12"/>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} style={{ flexShrink: 0 }}>
      {icons[name]}
    </svg>
  );
};

const OrderStatusBadge = ({ status }) => {
  const c = ORDER_STATUS_COLORS[status] || { bg: "#f0f0f0", text: "#666" };
  return <span className="order-badge" style={{ background: c.bg, color: c.text }}>{status}</span>;
};

const DueDateChip = ({ dateStr, isTerminal }) => {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  const base = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12 };
  if (isTerminal) return <span style={{ ...base, color: "#94a3b8" }}><OrderIcon name="calendar" size={11} /> {orderFmtDate(dateStr)}</span>;
  if (days < 0) return <span style={{ ...base, color: "#dc2626", background: "#fef2f2" }}><OrderIcon name="warning" size={11} /> {Math.abs(days)}d overdue</span>;
  if (days === 0) return <span style={{ ...base, color: "#ea580c", background: "#fff7ed" }}><OrderIcon name="clock" size={11} /> Due today</span>;
  if (days <= 3) return <span style={{ ...base, color: "#d97706", background: "#fffbeb" }}><OrderIcon name="clock" size={11} /> {days}d left</span>;
  return <span style={{ ...base, color: "#64748b" }}><OrderIcon name="calendar" size={11} /> {orderFmtDate(dateStr)}</span>;
};

const OrderProgressBar = ({ status }) => {
  const pct = ORDER_STATUS_PROGRESS[status] ?? 0;
  const color = ORDER_BAR_COLORS[status] || "#cbd5e1";
  if (status === "Cancelled") return <div className="order-progress-track" />;
  return <div className="order-progress-track"><div className="order-progress-fill" style={{ width: pct + "%", background: color }} /></div>;
};

const SectionProgressBar = ({ status, section }) => {
  const configs = {
    jobs: { draft: 0, scheduled: 20, quoted: 40, in_progress: 60, completed: 100, cancelled: 0 },
    quotes: { draft: 0, sent: 50, accepted: 100, declined: 0 },
    invoices: { draft: 0, sent: 33, paid: 100, overdue: 66, void: 0 },
    bills: { inbox: 0, linked: 33, approved: 66, posted: 100 },
  };
  const colors = {
    jobs: { draft: "#cbd5e1", scheduled: "#0891b2", quoted: "#ca8a04", in_progress: "#ea580c", completed: "#059669", cancelled: "#e2e8f0" },
    quotes: { draft: "#cbd5e1", sent: "#2563eb", accepted: "#059669", declined: "#dc2626" },
    invoices: { draft: "#cbd5e1", sent: "#2563eb", paid: "#059669", overdue: "#dc2626", void: "#64748b" },
    bills: { inbox: "#cbd5e1", linked: "#2563eb", approved: "#059669", posted: "#111" },
  };
  const pct = configs[section]?.[status] ?? 0;
  const color = colors[section]?.[status] || "#cbd5e1";
  if (pct === 0 && (status === "cancelled" || status === "declined" || status === "void")) return <div className="order-progress-track" />;
  return <div className="order-progress-track"><div className="order-progress-fill" style={{ width: pct + "%", background: color }} /></div>;
};

const FileIconBadge = ({ name }) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  let icon = "FILE", color = "#64748b", bg = "#f1f5f9";
  if (ext === "pdf") { icon = "PDF"; color = "#ef4444"; bg = "#fef2f2"; }
  else if (["jpg","jpeg","png","gif","webp","heic"].includes(ext)) { icon = "IMG"; color = "#8b5cf6"; bg = "#f5f3ff"; }
  else if (["doc","docx"].includes(ext)) { icon = "DOC"; color = "#2563eb"; bg = "#eff6ff"; }
  else if (["xls","xlsx","csv"].includes(ext)) { icon = "XLS"; color = "#059669"; bg = "#ecfdf5"; }
  return <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, color, background: bg }}>{icon}</span>;
};

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
const buildOrderPdfHtml = (type, order, jobs) => {
  const isWO = type === "wo";
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const partyName = isWO ? order.contractorName : order.supplierName;
  const partyEmail = isWO ? order.contractorEmail : order.supplierEmail;
  const partyContact = isWO ? order.contractorContact : order.supplierContact;
  const accentColor = isWO ? "#2563eb" : "#059669";
  const title = isWO ? "WORK ORDER" : "PURCHASE ORDER";
  const linesHtml = (!isWO && order.lines && order.lines.length > 0) ? `<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;"><thead><tr style="border-bottom:2px solid #e2e8f0;"><th style="text-align:left;padding:8px 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;">Description</th><th style="text-align:center;padding:8px 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;width:60px;">Qty</th><th style="text-align:center;padding:8px 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;width:60px;">Unit</th></tr></thead><tbody>${order.lines.map(l => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 4px;color:#334155;">${l.desc||"—"}</td><td style="padding:10px 4px;text-align:center;color:#475569;">${l.qty}</td><td style="padding:10px 4px;text-align:center;color:#94a3b8;">${l.unit}</td></tr>`).join("")}</tbody></table>` : "";
  const poLimitHtml = order.poLimit ? `<div style="display:flex;justify-content:space-between;align-items:center;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-top:16px;"><span style="font-size:13px;font-weight:600;color:#92400e;">PO Limit</span><span style="font-size:18px;font-weight:800;color:#b45309;">$${parseFloat(order.poLimit).toLocaleString("en-AU",{minimumFractionDigits:2})}</span></div>` : "";
  const scopeHtml = isWO && order.scopeOfWork ? `<div style="background:#eff6ff;border-radius:8px;padding:16px;margin-top:16px;"><p style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;margin:0 0 8px;">Scope of Work</p><p style="font-size:13px;color:#334155;white-space:pre-line;line-height:1.6;margin:0;">${order.scopeOfWork}</p></div>` : "";
  const deliveryHtml = !isWO && order.deliveryAddress ? `<div style="background:#ecfdf5;border-radius:8px;padding:12px 16px;margin-top:16px;"><p style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;margin:0 0 4px;">Delivery Address</p><p style="font-size:13px;color:#334155;margin:0;">${order.deliveryAddress}</p></div>` : "";
  const notesHtml = order.notes ? `<div style="border-top:1px solid #e2e8f0;margin-top:20px;padding-top:16px;"><p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin:0 0 6px;">Notes / Terms</p><p style="font-size:13px;color:#475569;white-space:pre-line;margin:0;">${order.notes}</p></div>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} ${order.ref}</title><style>*{box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:32px;color:#1e293b;font-size:14px;}</style></head><body><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid ${accentColor};"><div><p style="font-size:26px;font-weight:900;color:#0f172a;margin:0;">${title}</p><p style="color:#94a3b8;margin:4px 0 0;font-size:14px;">${order.ref}</p></div><div style="text-align:right;font-size:13px;color:#475569;"><p style="margin:0;"><strong>Issue Date:</strong> ${orderFmtDate(order.issueDate)}</p><p style="margin:4px 0 0;"><strong>${isWO?"Due Date":"Delivery"}:</strong> ${orderFmtDate(order.dueDate)}</p>${jd?`<p style="margin:4px 0 0;"><strong>Job:</strong> ${jd.ref}</p>`:""}</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px;"><div><p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin:0 0 8px;">${isWO?"Contractor":"Supplier"}</p><p style="font-weight:700;font-size:15px;margin:0 0 4px;">${partyName||"—"}</p><p style="color:#475569;margin:0 0 2px;font-size:13px;">${partyContact||""}</p><p style="color:#475569;margin:0;font-size:13px;">${partyEmail||""}</p></div>${jd?`<div><p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin:0 0 8px;">Linked Job</p><p style="font-weight:700;font-size:14px;margin:0 0 2px;">${jd.ref}</p><p style="color:#475569;font-size:13px;margin:0;">${jd.name}</p></div>`:""}</div>${scopeHtml}${deliveryHtml}${linesHtml}${poLimitHtml}${notesHtml}<div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">Generated ${new Date().toLocaleDateString("en-AU")} · FieldOps Order Management</div></body></html>`;
};
const printOrderPdf = (type, order, jobs) => {
  const html = buildOrderPdfHtml(type, order, jobs);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups to generate PDF."); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 400);
};

// ── Orders: Email Modal ───────────────────────────────────────────────────────
const OrderEmailModal = ({ type, order, jobs, onClose, onSent }) => {
  const isWO = type === "wo";
  const partyEmail = isWO ? order.contractorEmail : order.supplierEmail;
  const partyName = isWO ? order.contractorName : order.supplierName;
  const partyContact = isWO ? order.contractorContact : order.supplierContact;
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const acceptUrl = `${window.location.origin}${window.location.pathname}#accept/${order.ref}`;
  const viewUrl = `${window.location.origin}${window.location.pathname}#view/${order.ref}`;
  const [includeAcceptLink, setIncludeAcceptLink] = useState(true);
  const [includeViewLink, setIncludeViewLink] = useState(true);
  const buildBody = (wa, wv) => {
    const greeting = `Hi ${partyContact || partyName || "there"},`;
    const intro = isWO ? `Please find attached Work Order ${order.ref}${jd ? " for " + jd.name : ""}.` : `Please find attached Purchase Order ${order.ref}${jd ? " for " + jd.name : ""}.`;
    const viewBlock = wv ? `\n\n📄 View document online:\n${viewUrl}` : "";
    const acceptBlock = wa ? `\n\n✅ To accept this ${isWO ? "work order" : "purchase order"}, click below:\n${acceptUrl}` : "";
    return `${greeting}\n\n${intro}${viewBlock}${acceptBlock}\n\nKind regards`;
  };
  const defaultSubject = `${isWO?"Work Order":"Purchase Order"} ${order.ref}${jd?" — "+jd.ref:""}`;
  const [to, setTo] = useState(partyEmail || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(() => buildBody(true, true));
  const [includePdf, setIncludePdf] = useState(true);
  const [selectedAttachments, setSelectedAttachments] = useState((order.attachments || []).map(a => a.id));
  const [sent, setSent] = useState(false);
  const attachments = order.attachments || [];
  const toggleAtt = (id) => setSelectedAttachments(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const handleToggleAccept = (val) => { setIncludeAcceptLink(val); setBody(buildBody(val, includeViewLink)); };
  const handleToggleView = (val) => { setIncludeViewLink(val); setBody(buildBody(includeAcceptLink, val)); };
  const handleSend = () => {
    const mailtoBody = encodeURIComponent(body);
    window.location.href = `mailto:${encodeURIComponent(to)}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${mailtoBody}`;
    if (onSent) onSent(`Emailed to ${to}${cc ? ", cc: " + cc : ""}${includeAcceptLink ? " · acceptance link included" : ""}`);
    setSent(true);
  };
  const accent = isWO ? "#2563eb" : "#059669";
  const ToggleBtn = ({ on, onChange, accentCol }) => (
    <button className={`order-toggle ${on ? "on" : ""}`} style={{ background: on ? (accentCol || accent) : "#e2e8f0" }} onClick={() => onChange(!on)}>
      <div className="order-toggle-knob" />
    </button>
  );
  if (sent) return (
    <div className="order-email-overlay">
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxWidth: 400, width: "100%", padding: 32, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, background: "#d1fae5", borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><OrderIcon name="check" size={24} cls="" /></div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Email Client Opened</h3>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Your email client has been opened with the draft pre-filled.</p>
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
          <div className="grid-2">
            <div className="form-group"><label className="form-label">To</label><input className="form-control" type="email" placeholder="recipient@example.com" value={to} onChange={e => setTo(e.target.value)} />{partyName && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{partyName}</div>}</div>
            <div className="form-group"><label className="form-label">CC <span style={{ fontWeight: 400, color: "#cbd5e1", textTransform: "none" }}>optional</span></label><input className="form-control" type="text" placeholder="cc@example.com" value={cc} onChange={e => setCc(e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Subject</label><input className="form-control" value={subject} onChange={e => setSubject(e.target.value)} /></div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#475569" }}>Include in Email</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <ToggleBtn on={includeViewLink} onChange={handleToggleView} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 500 }}>📄 View Document Link</span><button onClick={() => printOrderPdf(type, order, jobs)} style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>Preview PDF</button></div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewUrl}</div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <ToggleBtn on={includeAcceptLink} onChange={handleToggleAccept} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>✅ Acceptance Link</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Recipient clicks to accept — logs acceptance automatically</div>
                </div>
              </div>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Message</label><textarea className="form-control" rows={8} style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", height: "auto" }} value={body} onChange={e => setBody(e.target.value)} /></div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#475569", display: "flex", alignItems: "center", gap: 6 }}><OrderIcon name="paperclip" size={12} /> File Attachments</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ToggleBtn on={includePdf} onChange={v => setIncludePdf(v)} />
                <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", background: "#fef2f2", padding: "2px 6px", borderRadius: 4 }}>PDF</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{order.ref}.pdf</span>
              </div>
              {attachments.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <ToggleBtn on={selectedAttachments.includes(f.id)} onChange={() => toggleAtt(f.id)} />
                  {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{fmtFileSize(f.size)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ background: accent }} disabled={!to} onClick={handleSend}>
            <OrderIcon name="send" size={14} /> Send {isWO ? "to Contractor" : "to Supplier"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Section Drawer (reusable shell) ──────────────────────────────────────────
const SectionDrawer = ({ accent, icon, typeLabel, title, statusBadge, mode, setMode, showToggle = true, isNew, statusStrip, children, footer, onClose, zIndex = 1050 }) => (
  <div className="section-drawer-overlay" style={{ zIndex }}>
    <div className="section-drawer-backdrop" onClick={onClose} />
    <div className="section-drawer">
      {/* Header */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff", background: accent, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {icon && <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>}
          <div style={{ minWidth: 0 }}>
            {typeLabel && <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, letterSpacing: "0.05em", textTransform: "uppercase" }}>{typeLabel}</div>}
            <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          </div>
          {statusBadge}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {showToggle && !isNew && (
            <div style={{ display: "flex", background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 2, gap: 2 }}>
              <button style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: mode === "view" ? "#fff" : "transparent", color: mode === "view" ? "#1e293b" : "rgba(255,255,255,0.8)" }} onClick={() => setMode("view")}>View</button>
              <button style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: mode === "edit" ? "#fff" : "transparent", color: mode === "edit" ? "#1e293b" : "rgba(255,255,255,0.8)" }} onClick={() => setMode("edit")}>Edit</button>
            </div>
          )}
          <button style={{ padding: 6, borderRadius: 8, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", color: "#fff", display: "flex" }} onClick={onClose}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      {/* Status strip */}
      {statusStrip}
      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>{children}</div>
      {/* Footer */}
      {footer && <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>{footer}</div>}
    </div>
  </div>
);

// ── Orders: Order Drawer ──────────────────────────────────────────────────────
const OrderDrawer = ({ type, order, initialMode = "view", onSave, onClose, onTransition, jobs, presetJobId }) => {
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

  if (showEmail) return <OrderEmailModal type={type} order={form} jobs={jobs} onClose={() => setShowEmail(false)}
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
const OrderCard = ({ type, order, onOpen, onDelete, jobs }) => {
  const isWO = type === "wo";
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const partyName = isWO ? order.contractorName : order.supplierName;
  const isTerminal = ORDER_TERMINAL.includes(order.status);
  const attachCount = (order.attachments || []).length;
  const hasPoLimit = order.poLimit && parseFloat(order.poLimit) > 0;
  return (
    <div className="order-card" onClick={() => onOpen(order)}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5", color: isWO ? "#2563eb" : "#059669" }}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={15} />
          </div>
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{order.ref}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{orderFmtDate(order.issueDate)}</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <OrderStatusBadge status={order.status} />
          {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(order.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }} title="Delete"><OrderIcon name="trash" size={13} /></button>}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {partyName || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>{"No " + (isWO ? "contractor" : "supplier")}</span>}
      </div>
      {jd && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><OrderIcon name="link" size={10} /> {jd.ref + " · " + jd.name}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        {hasPoLimit && <span style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fffbeb", padding: "2px 8px", borderRadius: 12, border: "1px solid #fcd34d" }}>${parseFloat(order.poLimit).toLocaleString("en-AU")} limit</span>}
        {attachCount > 0 && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12, display: "flex", alignItems: "center", gap: 4 }}><OrderIcon name="paperclip" size={10} /> {attachCount}</span>}
      </div>
      <OrderProgressBar status={order.status} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
        <span style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}><OrderIcon name="eye" size={11} /> Open</span>
      </div>
    </div>
  );
};

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
const OrdersPage = ({ workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders, jobs }) => {
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
      {modal && <OrderDrawer type={modal.type} order={modal.order} initialMode={modal.order ? (modal.mode || "view") : "edit"} onSave={handleSave} onClose={() => setModal(null)} jobs={jobs} onTransition={(updated) => { (modal.type === "wo" ? setWorkOrders : setPurchaseOrders)(prev => prev.map(o => o.id === updated.id ? updated : o)); setModal(m => m ? { ...m, order: updated } : null); }} />}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGES
// ══════════════════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = ({ jobs, clients, quotes, invoices, bills, timeEntries, schedule, workOrders = [], purchaseOrders = [], contractors = [], suppliers = [], onNav }) => {
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

// ── Section Label ─────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#999", marginBottom: 10, marginTop: 4 }}>{children}</div>
);

// ── Photo Markup Editor (fabric.js) ───────────────────────────────────────────
const MARKUP_COLORS = ["#dc2626", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ffffff", "#000000"];
const PhotoMarkupEditor = ({ imageSrc, onSave, onClose }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);
  const fabricModRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#dc2626");
  const [brushSize, setBrushSize] = useState(3);
  const [fabricLoaded, setFabricLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    import("fabric").then((mod) => {
      if (disposed) return;
      fabricModRef.current = mod;
      setFabricLoaded(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || fabricRef.current) return;
    const fb = fabricModRef.current;
    const cvs = new fb.Canvas(canvasRef.current, { isDrawingMode: true, selection: true });
    fabricRef.current = cvs;

    // Load the background image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const container = containerRef.current;
      const maxW = container ? container.clientWidth - 40 : 800;
      const maxH = (window.innerHeight * 0.65);
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      cvs.setDimensions({ width: w, height: h });
      const bgImg = new fb.FabricImage(img, { scaleX: scale, scaleY: scale });
      cvs.backgroundImage = bgImg;
      cvs.renderAll();
    };
    img.src = imageSrc;

    cvs.freeDrawingBrush = new fb.PencilBrush(cvs);
    cvs.freeDrawingBrush.color = color;
    cvs.freeDrawingBrush.width = brushSize;

    return () => { cvs.dispose(); fabricRef.current = null; };
  }, [imageSrc, fabricLoaded]);

  useEffect(() => {
    const cvs = fabricRef.current;
    if (!cvs) return;
    if (tool === "pen") {
      cvs.isDrawingMode = true;
      cvs.freeDrawingBrush = new (fabricModRef.current.PencilBrush)(cvs);
      cvs.freeDrawingBrush.color = color;
      cvs.freeDrawingBrush.width = brushSize;
    } else {
      cvs.isDrawingMode = false;
    }
  }, [tool, color, brushSize]);

  const addArrow = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const line = new fb.Line([50, 100, 200, 100], { stroke: color, strokeWidth: brushSize, selectable: true });
    const head = new fb.Triangle({ width: 14, height: 14, fill: color, left: 200, top: 100, angle: 90, originX: "center", originY: "center", selectable: false });
    const group = new fb.Group([line, head], { left: 50, top: 80 });
    cvs.add(group);
    cvs.setActiveObject(group);
    cvs.renderAll();
  };

  const addRect = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const rect = new fb.Rect({ left: 60, top: 60, width: 150, height: 100, fill: "transparent", stroke: color, strokeWidth: brushSize, rx: 4, ry: 4 });
    cvs.add(rect);
    cvs.setActiveObject(rect);
    cvs.renderAll();
  };

  const addCircle = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const circle = new fb.Circle({ left: 80, top: 80, radius: 50, fill: "transparent", stroke: color, strokeWidth: brushSize });
    cvs.add(circle);
    cvs.setActiveObject(circle);
    cvs.renderAll();
  };

  const addText = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const text = new fb.IText("Note", { left: 60, top: 60, fontSize: 20, fontFamily: "Open Sans, sans-serif", fontWeight: "700", fill: color, editable: true });
    cvs.add(text);
    cvs.setActiveObject(text);
    cvs.renderAll();
  };

  const deleteSelected = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const active = cvs.getActiveObjects();
    if (active.length) { active.forEach(o => cvs.remove(o)); cvs.discardActiveObject(); cvs.renderAll(); }
  };

  const clearAll = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const objs = cvs.getObjects();
    objs.forEach(o => cvs.remove(o));
    cvs.renderAll();
  };

  const handleSave = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.discardActiveObject();
    cvs.renderAll();
    const dataUrl = cvs.toDataURL({ format: "png", quality: 0.92, multiplier: 2 });
    onSave(dataUrl);
  };

  const tools = [
    { id: "pen", icon: "✏️", label: "Draw" },
    { id: "arrow", icon: "➡️", label: "Arrow", action: addArrow },
    { id: "rect", icon: "▢", label: "Rectangle", action: addRect },
    { id: "circle", icon: "◯", label: "Circle", action: addCircle },
    { id: "text", icon: "T", label: "Text", action: addText },
    { id: "select", icon: "☝️", label: "Select" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "#1e1e1e", borderRadius: "0 0 12px 12px", flexWrap: "wrap", justifyContent: "center", maxWidth: "100%" }}>
        {tools.map(t => (
          <button key={t.id} onClick={() => { if (t.action) t.action(); else setTool(t.id); }}
            style={{ padding: "6px 10px", borderRadius: 6, border: tool === t.id ? "2px solid #fff" : "2px solid transparent", background: tool === t.id ? "rgba(255,255,255,0.15)" : "transparent", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 15 }}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div style={{ width: 1, height: 24, background: "#555", margin: "0 4px" }} />
        <button onClick={deleteSelected} style={{ padding: "6px 10px", borderRadius: 6, border: "2px solid transparent", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 13, fontWeight: 600 }} title="Delete selected">🗑 Delete</button>
        <button onClick={clearAll} style={{ padding: "6px 10px", borderRadius: 6, border: "2px solid transparent", background: "transparent", color: "#fbbf24", cursor: "pointer", fontSize: 13, fontWeight: 600 }} title="Clear all markups">✕ Clear</button>
        <div style={{ width: 1, height: 24, background: "#555", margin: "0 4px" }} />
        {/* Brush size */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#aaa", fontSize: 11, fontWeight: 600 }}>Size</span>
          <input type="range" min="1" max="12" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: 70, accentColor: color }} />
        </div>
        <div style={{ width: 1, height: 24, background: "#555", margin: "0 4px" }} />
        {/* Colors */}
        <div style={{ display: "flex", gap: 3 }}>
          {MARKUP_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "3px solid #fff" : `2px solid ${c === "#ffffff" ? "#666" : "transparent"}`, cursor: "pointer", boxShadow: color === c ? "0 0 6px rgba(255,255,255,0.4)" : "none" }} />
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: 20, overflow: "auto" }}>
        <div style={{ borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", gap: 10, padding: "12px 20px", background: "#1e1e1e", borderRadius: "12px 12px 0 0", width: "100%", justifyContent: "center" }}>
        <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 8, border: "1px solid #555", background: "transparent", color: "#ccc", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
        <button onClick={handleSave} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: "#0891b2", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>💾 Save Markup</button>
      </div>
    </div>
  );
};

// ── Plan Drawing Editor (fabric.js) ───────────────────────────────────────────
const PLAN_GRID_SIZE = 20;
const PLAN_COLORS = ["#111111", "#dc2626", "#2563eb", "#059669", "#d97706", "#8b5cf6", "#0891b2", "#94a3b8"];
const PLAN_LINE_WIDTHS = [1, 2, 3, 5, 8];

const PlanDrawingEditor = ({ onSave, onClose, existingSrc }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const fabricModRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState("line");
  const [color, setColor] = useState("#111111");
  const [lineWidth, setLineWidth] = useState(2);
  const [snapGrid, setSnapGrid] = useState(true);
  const [snapEndpoints, setSnapEndpoints] = useState(true);
  const [showLengths, setShowLengths] = useState(true);
  const [constrainAngle, setConstrainAngle] = useState(false);
  const [angleStep, setAngleStep] = useState(45);
  const [scale, setScale] = useState(100); // pixels per metre (displayed as mm)
  const [cursorInfo, setCursorInfo] = useState(null); // { angle, length, x, y }
  const drawStateRef = useRef(null); // { startX, startY, tempLine }
  const labelGroupsRef = useRef([]); // track measurement labels
  const [fabricLoaded, setFabricLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    import("fabric").then((mod) => {
      if (disposed) return;
      fabricModRef.current = mod;
      setFabricLoaded(true);
    });
    return () => { disposed = true; };
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || fabricRef.current) return;
    const fb = fabricModRef.current;
    const container = containerRef.current;
    const w = container ? container.clientWidth - 40 : 1200;
    const h = window.innerHeight * 0.72;
    const cvs = new fb.Canvas(canvasRef.current, {
      width: w, height: h, selection: true, isDrawingMode: false,
      backgroundColor: "#ffffff"
    });
    fabricRef.current = cvs;

    // Draw grid
    drawGrid(cvs, w, h);

    // Load existing plan if editing
    if (existingSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const scaleF = Math.min(w / img.width, h / img.height, 1);
        const bgImg = new fb.FabricImage(img, { scaleX: scaleF, scaleY: scaleF });
        cvs.backgroundImage = bgImg;
        drawGrid(cvs, w, h);
        cvs.renderAll();
      };
      img.src = existingSrc;
    }

    // Line drawing handlers
    cvs.on("mouse:down", (opt) => {
      if (cvs.__activeTool !== "line" && cvs.__activeTool !== "wall") return;
      if (cvs.getActiveObject()) return;
      const pointer = cvs.getScenePoint(opt.e);
      let sx = pointer.x, sy = pointer.y;
      if (cvs.__snapGrid) { sx = Math.round(sx / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; sy = Math.round(sy / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
      if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, sx, sy, 12); if (sn) { sx = sn.x; sy = sn.y; } }
      const isWall = cvs.__activeTool === "wall";
      const tempLine = new fb.Line([sx, sy, sx, sy], {
        stroke: cvs.__activeColor || "#111", strokeWidth: isWall ? Math.max((cvs.__lineWidth || 2) * 2, 6) : (cvs.__lineWidth || 2),
        selectable: false, evented: false, _isPlanLine: true, _isWall: isWall
      });
      cvs.add(tempLine);
      drawStateRef.current = { startX: sx, startY: sy, tempLine };
    });

    cvs.on("mouse:move", (opt) => {
      const ds = drawStateRef.current;
      if (!ds) {
        // Show cursor info for snapping
        const pointer = cvs.getScenePoint(opt.e);
        let cx = pointer.x, cy = pointer.y;
        if (cvs.__snapGrid) { cx = Math.round(cx / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; cy = Math.round(cy / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
        if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, cx, cy, 12); if (sn) { cx = sn.x; cy = sn.y; } }
        return;
      }
      const pointer = cvs.getScenePoint(opt.e);
      let ex = pointer.x, ey = pointer.y;
      if (cvs.__snapGrid) { ex = Math.round(ex / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; ey = Math.round(ey / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
      if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, ex, ey, 12, ds.tempLine); if (sn) { ex = sn.x; ey = sn.y; } }
      if (cvs.__constrainAngle) {
        const constrained = constrainToAngle(ds.startX, ds.startY, ex, ey, cvs.__angleStep || 45);
        ex = constrained.x; ey = constrained.y;
      }
      ds.tempLine.set({ x2: ex, y2: ey });
      cvs.renderAll();
      // Compute and display info
      const dx = ex - ds.startX, dy = ey - ds.startY;
      const lengthPx = Math.sqrt(dx * dx + dy * dy);
      const lengthMm = (lengthPx / (cvs.__scale || 50)) * 1000;
      let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      setCursorInfo({ angle: Math.round(angle), length: Math.round(lengthMm), x: Math.round(ex), y: Math.round(ey) });
    });

    cvs.on("mouse:up", () => {
      const ds = drawStateRef.current;
      if (!ds) return;
      drawStateRef.current = null;
      const line = ds.tempLine;
      const x1 = line.x1, y1 = line.y1, x2 = line.x2, y2 = line.y2;
      const dx = x2 - x1, dy = y2 - y1;
      const lengthPx = Math.sqrt(dx * dx + dy * dy);
      if (lengthPx < 3) { cvs.remove(line); setCursorInfo(null); cvs.renderAll(); return; }
      line.set({ selectable: true, evented: true, hasControls: true, hasBorders: true });
      // Add endpoint circles
      const dotOpts = { radius: 3, fill: cvs.__activeColor || "#111", stroke: "#fff", strokeWidth: 1, selectable: false, evented: false, _isPlanDot: true, _parentLine: line };
      const dot1 = new fb.Circle({ ...dotOpts, left: x1 - 3, top: y1 - 3 });
      const dot2 = new fb.Circle({ ...dotOpts, left: x2 - 3, top: y2 - 3 });
      cvs.add(dot1, dot2);
      // Add length label
      if (cvs.__showLengths) {
        const lengthMm = Math.round((lengthPx / (cvs.__scale || 50)) * 1000);
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const labelText = new fb.FabricText(lengthMm + "mm", {
          left: midX, top: midY - 12, fontSize: 11, fontFamily: "'Open Sans', monospace",
          fill: "#555", fontWeight: "600", originX: "center", originY: "center",
          selectable: false, evented: false, _isPlanLabel: true, _parentLine: line,
          angle: (angle > 90 || angle < -90) ? angle + 180 : angle
        });
        const labelBg = new fb.Rect({
          left: midX, top: midY - 12, width: labelText.width + 8, height: 16,
          fill: "rgba(255,255,255,0.88)", rx: 3, ry: 3, originX: "center", originY: "center",
          selectable: false, evented: false, _isPlanLabel: true, _parentLine: line,
          angle: (angle > 90 || angle < -90) ? angle + 180 : angle
        });
        cvs.add(labelBg, labelText);
        labelGroupsRef.current.push({ line, bg: labelBg, text: labelText, dot1, dot2 });
      }
      setCursorInfo(null);
      cvs.renderAll();
    });

    return () => { cvs.dispose(); fabricRef.current = null; };
  }, [existingSrc, fabricLoaded]);

  // Sync tool options to canvas
  useEffect(() => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.__activeTool = tool;
    cvs.__activeColor = color;
    cvs.__lineWidth = lineWidth;
    cvs.__snapGrid = snapGrid;
    cvs.__snapEndpoints = snapEndpoints;
    cvs.__showLengths = showLengths;
    cvs.__constrainAngle = constrainAngle;
    cvs.__angleStep = angleStep;
    cvs.__scale = scale;

    if (tool === "pen") {
      cvs.isDrawingMode = true;
      cvs.freeDrawingBrush = new (fabricModRef.current.PencilBrush)(cvs);
      cvs.freeDrawingBrush.color = color;
      cvs.freeDrawingBrush.width = lineWidth;
    } else {
      cvs.isDrawingMode = false;
    }
    if (tool === "select") {
      cvs.selection = true;
      cvs.forEachObject(o => { if (!o._isPlanDot && !o._isPlanLabel && !o._isGrid) { o.selectable = true; o.evented = true; } });
    } else if (tool !== "pen") {
      cvs.selection = false;
      cvs.discardActiveObject();
    }
    cvs.renderAll();
  }, [tool, color, lineWidth, snapGrid, snapEndpoints, showLengths, constrainAngle, angleStep, scale]);

  const drawGrid = (cvs, w, h) => {
    const fb = fabricModRef.current; if (!fb) return;
    // Remove old grid
    cvs.getObjects().filter(o => o._isGrid).forEach(o => cvs.remove(o));
    for (let x = 0; x <= w; x += PLAN_GRID_SIZE) {
      const isMajor = x % (PLAN_GRID_SIZE * 5) === 0;
      cvs.add(new fb.Line([x, 0, x, h], { stroke: isMajor ? "#d4d4d4" : "#ececec", strokeWidth: isMajor ? 0.8 : 0.4, selectable: false, evented: false, _isGrid: true }));
    }
    for (let y = 0; y <= h; y += PLAN_GRID_SIZE) {
      const isMajor = y % (PLAN_GRID_SIZE * 5) === 0;
      cvs.add(new fb.Line([0, y, w, y], { stroke: isMajor ? "#d4d4d4" : "#ececec", strokeWidth: isMajor ? 0.8 : 0.4, selectable: false, evented: false, _isGrid: true }));
    }
    // Send grid to back
    cvs.getObjects().filter(o => o._isGrid).forEach(o => cvs.sendObjectToBack(o));
    cvs.renderAll();
  };

  const findNearestEndpoint = (cvs, x, y, threshold, exclude) => {
    let nearest = null, minDist = threshold;
    cvs.getObjects().forEach(obj => {
      if (obj === exclude || obj._isGrid || obj._isPlanLabel) return;
      if (obj._isPlanLine || obj._isWall) {
        [[obj.x1, obj.y1], [obj.x2, obj.y2]].forEach(([px, py]) => {
          const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
          if (d < minDist) { minDist = d; nearest = { x: px, y: py }; }
        });
      } else if (obj._isPlanDot) {
        const cx = obj.left + 3, cy = obj.top + 3;
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d < minDist) { minDist = d; nearest = { x: cx, y: cy }; }
      }
    });
    return nearest;
  };

  const constrainToAngle = (x1, y1, x2, y2, step) => {
    const dx = x2 - x1, dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle = Math.round(angle / step) * step;
    const rad = angle * (Math.PI / 180);
    return { x: x1 + length * Math.cos(rad), y: y1 + length * Math.sin(rad) };
  };

  const addRect = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const rect = new fb.Rect({ left: 100, top: 100, width: 200, height: 150, fill: "transparent", stroke: color, strokeWidth: lineWidth, rx: 0, ry: 0 });
    cvs.add(rect); cvs.setActiveObject(rect); cvs.renderAll();
  };

  const addText = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const text = new fb.IText("Label", { left: 100, top: 100, fontSize: 16, fontFamily: "'Open Sans', sans-serif", fontWeight: "600", fill: color, editable: true });
    cvs.add(text); cvs.setActiveObject(text); cvs.renderAll();
  };

  const addDimension = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const x1 = 100, y1 = 200, x2 = 300, y2 = 200;
    const mainLine = new fb.Line([x1, y1, x2, y2], { stroke: "#555", strokeWidth: 1, strokeDashArray: [4, 3], _isDimension: true });
    const tick1 = new fb.Line([x1, y1 - 6, x1, y1 + 6], { stroke: "#555", strokeWidth: 1 });
    const tick2 = new fb.Line([x2, y2 - 6, x2, y2 + 6], { stroke: "#555", strokeWidth: 1 });
    const lengthMm = Math.round((Math.abs(x2 - x1) / scale) * 1000);
    const label = new fb.FabricText(lengthMm + "mm", { left: (x1 + x2) / 2, top: y1 - 14, fontSize: 12, fill: "#555", fontWeight: "600", fontFamily: "monospace", originX: "center" });
    const group = new fb.Group([mainLine, tick1, tick2, label], { left: x1, top: y1 - 14 });
    cvs.add(group); cvs.setActiveObject(group); cvs.renderAll();
  };

  const deleteSelected = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const active = cvs.getActiveObjects();
    if (active.length) {
      active.forEach(obj => {
        // Also remove associated dots & labels
        const associated = labelGroupsRef.current.filter(g => g.line === obj);
        associated.forEach(g => { cvs.remove(g.bg); cvs.remove(g.text); cvs.remove(g.dot1); cvs.remove(g.dot2); });
        labelGroupsRef.current = labelGroupsRef.current.filter(g => g.line !== obj);
        cvs.remove(obj);
      });
      cvs.discardActiveObject(); cvs.renderAll();
    }
  };

  const clearAll = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.getObjects().filter(o => !o._isGrid).forEach(o => cvs.remove(o));
    labelGroupsRef.current = [];
    cvs.renderAll();
  };

  const handleSave = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.discardActiveObject();
    // Temporarily hide grid for export
    cvs.getObjects().filter(o => o._isGrid).forEach(o => o.set({ visible: false }));
    cvs.renderAll();
    const dataUrl = cvs.toDataURL({ format: "png", quality: 0.95, multiplier: 2 });
    cvs.getObjects().filter(o => o._isGrid).forEach(o => o.set({ visible: true }));
    cvs.renderAll();
    onSave(dataUrl);
  };

  const tools = [
    { id: "line", icon: "╱", label: "Line" },
    { id: "wall", icon: "▬", label: "Wall" },
    { id: "rect", icon: "▢", label: "Room", action: addRect },
    { id: "pen", icon: "✏️", label: "Freehand" },
    { id: "text", icon: "T", label: "Label", action: addText },
    { id: "dimension", icon: "↔", label: "Dimension", action: addDimension },
    { id: "select", icon: "☝️", label: "Select" },
  ];

  const btnStyle = (active) => ({ padding: "5px 9px", borderRadius: 6, border: active ? "2px solid #fff" : "2px solid transparent", background: active ? "rgba(255,255,255,0.15)" : "transparent", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 });
  const toggleStyle = (on) => ({ padding: "4px 8px", borderRadius: 5, border: "none", background: on ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)", color: on ? "#fff" : "#888", cursor: "pointer", fontSize: 11, fontWeight: 600 });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Top Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", background: "#1e1e1e", borderRadius: "0 0 12px 12px", flexWrap: "wrap", justifyContent: "center", maxWidth: "100%", position: "relative", zIndex: 10 }}>
        {tools.map(t => (
          <button key={t.id} onClick={() => { if (t.action) t.action(); else setTool(t.id); }} style={btnStyle(tool === t.id)}>
            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: "#555", margin: "0 3px" }} />
        <button onClick={deleteSelected} style={{ ...btnStyle(false), color: "#f87171" }}>🗑</button>
        <button onClick={clearAll} style={{ ...btnStyle(false), color: "#fbbf24" }}>✕ Clear</button>
        <div style={{ width: 1, height: 22, background: "#555", margin: "0 3px" }} />
        {/* Line width */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "#aaa", fontSize: 10, fontWeight: 600 }}>Width</span>
          {PLAN_LINE_WIDTHS.map(w => (
            <button key={w} onClick={() => setLineWidth(w)}
              style={{ width: 22, height: 22, borderRadius: 4, border: lineWidth === w ? "2px solid #fff" : "1px solid #555", background: lineWidth === w ? "rgba(255,255,255,0.15)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: Math.min(w * 2, 14), height: Math.min(w, 8), background: "#fff", borderRadius: 1 }} />
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 22, background: "#555", margin: "0 3px" }} />
        {/* Colors */}
        <div style={{ display: "flex", gap: 3 }}>
          {PLAN_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: color === c ? "3px solid #fff" : `1px solid ${c === "#111111" ? "#666" : "transparent"}`, cursor: "pointer" }} />
          ))}
        </div>
      </div>

      {/* Snap/Options Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#161616", width: "100%", justifyContent: "center", flexWrap: "wrap", position: "relative", zIndex: 10 }}>
        <button onClick={() => setSnapGrid(v => !v)} style={toggleStyle(snapGrid)}>⊞ Snap Grid</button>
        <button onClick={() => setSnapEndpoints(v => !v)} style={toggleStyle(snapEndpoints)}>⊙ Snap Endpoints</button>
        <button onClick={() => setShowLengths(v => !v)} style={toggleStyle(showLengths)}>📏 Show Lengths</button>
        <button onClick={() => setConstrainAngle(v => !v)} style={toggleStyle(constrainAngle)}>📐 Constrain Angle</button>
        {constrainAngle && (
          <select value={angleStep} onChange={e => setAngleStep(Number(e.target.value))} style={{ padding: "3px 6px", borderRadius: 4, background: "#333", color: "#fff", border: "1px solid #555", fontSize: 11 }}>
            <option value={15}>15°</option>
            <option value={30}>30°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
          </select>
        )}
        <div style={{ width: 1, height: 18, background: "#444" }} />
        <span style={{ color: "#888", fontSize: 11 }}>Scale:</span>
        <select value={scale} onChange={e => setScale(Number(e.target.value))} style={{ padding: "3px 6px", borderRadius: 4, background: "#333", color: "#fff", border: "1px solid #555", fontSize: 11 }}>
          <option value={100}>100mm = 10px</option>
          <option value={250}>100mm = 25px</option>
          <option value={500}>100mm = 50px</option>
          <option value={1000}>100mm = 100px</option>
        </select>
        {cursorInfo && (
          <>
            <div style={{ width: 1, height: 18, background: "#444" }} />
            <span style={{ color: "#0891b2", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
              {cursorInfo.length}mm &nbsp; {cursorInfo.angle}°
            </span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px 20px", overflow: "auto" }}>
        <div style={{ borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", border: "1px solid #333" }}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", gap: 10, padding: "10px 20px", background: "#1e1e1e", borderRadius: "12px 12px 0 0", width: "100%", justifyContent: "center", position: "relative", zIndex: 10 }}>
        <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 8, border: "1px solid #555", background: "transparent", color: "#ccc", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
        <button onClick={handleSave} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: "#0891b2", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>💾 Save Plan</button>
      </div>
    </div>
  );
};

// ── Job Detail Drawer ─────────────────────────────────────────────────────────
const JobDetail = ({ job, clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, jobs, setJobs, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders, onClose, onEdit }) => {
  const [tab, setTab] = useState("overview");
  const [detailMode, setDetailMode] = useState("view");
  const [detailForm, setDetailForm] = useState({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } });
  const client = clients.find(c => c.id === job.clientId);

  const jobQuotes    = quotes.filter(q => q.jobId === job.id);
  const jobInvoices  = invoices.filter(i => i.jobId === job.id);
  const jobTime      = timeEntries.filter(t => t.jobId === job.id);
  const jobBills     = bills.filter(b => b.jobId === job.id);
  const jobSchedule  = schedule.filter(s => s.jobId === job.id).sort((a,b) => a.date > b.date ? 1 : -1);
  const jobWOs = (workOrders || []).filter(o => o.jobId === job.id);
  const jobPOs = (purchaseOrders || []).filter(o => o.jobId === job.id);

  const totalQuoted   = jobQuotes.filter(q => q.status === "accepted").reduce((s,q) => s + calcQuoteTotal(q), 0);
  const totalInvoiced = jobInvoices.reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalPaid     = jobInvoices.filter(i => i.status === "paid").reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalHours    = jobTime.reduce((s,t) => s + t.hours, 0);
  const totalCosts    = jobBills.filter(b => b.status === "approved").reduce((s,b) => s + b.amount, 0);

  // Quick-add quote from within job
  const addQuoteForJob = async () => {
    try {
      const newQ = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" };
      const saved = await createQuote(newQ);
      setQuotes(qs => [...qs, saved]);
    } catch (err) {
      console.error('Failed to create quote:', err);
    }
  };

  // Convert accepted quote → invoice
  const quoteToInvoice = async (q) => {
    try {
      const newInv = { jobId: job.id, status: "draft", lineItems: [...q.lineItems], tax: q.tax, dueDate: "", notes: q.notes, fromQuoteId: q.id };
      const saved = await createInvoice(newInv);
      setInvoices(is => [...is, saved]);
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${saved.number} created from ${q.number}`) } : j));
    } catch (err) {
      console.error('Failed to create invoice from quote:', err);
    }
  };

  // Quick-add time
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeForm, setTimeForm] = useState({ worker: TEAM[0], date: new Date().toISOString().slice(0,10), startTime: "", endTime: "", hours: 1, description: "", billable: true });
  const quickHours = calcHoursFromTimes(timeForm.startTime, timeForm.endTime) || timeForm.hours;
  const saveTime = async () => {
    const hours = calcHoursFromTimes(timeForm.startTime, timeForm.endTime) || Number(timeForm.hours);
    try {
      const staffMember = staff ? staff.find(s => s.name === timeForm.worker) : null;
      const staffId = staffMember?.id;
      const saved = await createTimeEntry({ ...timeForm, jobId: job.id, hours }, staffId);
      setTimeEntries(ts => [...ts, saved]);
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `${timeForm.worker} logged ${hours}h`) } : j));
    } catch (err) {
      console.error('Failed to save time entry:', err);
    }
    setShowTimeForm(false);
    setTimeForm({ worker: (staff && staff[0]?.name) || TEAM[0], date: new Date().toISOString().slice(0,10), startTime: "", endTime: "", hours: 1, description: "", billable: true });
  };

  // ── Notes state & CRUD ──
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ text: "", category: "general", attachments: [] });
  const [noteFilter, setNoteFilter] = useState("all");
  const [lightboxImg, setLightboxImg] = useState(null);
  const [markupImg, setMarkupImg] = useState(null); // { src, noteId, attachmentId } or { src, target: "new" }
  const [showPlanDrawing, setShowPlanDrawing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteForm, setEditNoteForm] = useState({ text: "", category: "general", attachments: [] });
  // P&L estimate editing
  const [editingEstimate, setEditingEstimate] = useState(false);
  const defaultEstimate = { labour: 0, materials: 0, subcontractors: 0, other: 0 };
  const [estimateForm, setEstimateForm] = useState({ ...defaultEstimate, ...(job.estimate || {}) });

  // ── Gantt state ──
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [editPhase, setEditPhase] = useState(null);
  const defaultPhase = { name: "", startDate: job.startDate || new Date().toISOString().slice(0,10), endDate: job.dueDate || new Date().toISOString().slice(0,10), color: "#3b82f6", progress: 0 };
  const [phaseForm, setPhaseForm] = useState({ ...defaultPhase });

  // ── Tasks state ──
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ text: "", dueDate: "", assignedTo: "" });

  // ── Forms state ──
  const [showFormFiller, setShowFormFiller] = useState(null);
  const [viewingForm, setViewingForm] = useState(null);
  const [showFormMenu, setShowFormMenu] = useState(false);

  // ── PDF Filler state ──
  const [showPdfFiller, setShowPdfFiller] = useState(null); // { pdfData, fileName, existingFields? }
  const pdfInputRef = useRef(null);

  const handlePdfFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setShowPdfFiller({ pdfData: ev.target.result, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handlePdfSave = ({ filledPdfDataUrl, thumbnail, fields: pdfFields, fileName: filledName }) => {
    const note = {
      id: Date.now(), text: `PDF filled: ${filledName}`, category: "general",
      attachments: [{ id: genId(), name: filledName, size: Math.round(filledPdfDataUrl.length * 0.75), type: "application/pdf", dataUrl: filledPdfDataUrl }],
      pdfNote: true, pdfThumbnail: thumbnail, pdfFields: pdfFields, pdfOriginalData: showPdfFiller?.pdfData ? Array.from(new Uint8Array(showPdfFiller.pdfData)) : null,
      createdAt: new Date().toISOString(), createdBy: CURRENT_USER,
    };
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Filled PDF: ${filledName}`) } : j));
    setShowPdfFiller(null);
  };

  const reopenPdfNote = (note) => {
    if (note.pdfOriginalData) {
      const arr = new Uint8Array(note.pdfOriginalData);
      setShowPdfFiller({ pdfData: arr.buffer, fileName: note.attachments?.[0]?.name || "document.pdf", existingFields: note.pdfFields });
    }
  };

  const printFormPdf = (note, tmpl) => {
    const data = note.formData || {};
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${tmpl?.name || "Form"} – ${job.title}</title><style>body{font-family:sans-serif;padding:30px;max-width:700px;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:14px;color:#666;margin-top:0}.field{margin-bottom:16px}.label{font-size:11px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:0.05em;margin-bottom:4px}.value{font-size:13px;color:#333;white-space:pre-wrap}.check{display:flex;gap:6px;align-items:center;font-size:13px;margin:2px 0}.check-y{color:#059669;font-weight:700}.check-n{color:#dc2626;font-weight:700}.sig{max-width:300px;height:80px;border:1px solid #ddd;border-radius:4px}.meta{font-size:11px;color:#888;margin-bottom:16px}</style></head><body>`);
    w.document.write(`<h1>${tmpl?.icon || ""} ${tmpl?.name || "Form"}</h1>`);
    w.document.write(`<h2>${job.title}</h2>`);
    w.document.write(`<div class="meta">Completed ${new Date(note.createdAt).toLocaleString()} by ${note.createdBy}</div>`);
    (tmpl?.fields || []).forEach(field => {
      const val = data[field.key];
      w.document.write(`<div class="field"><div class="label">${field.label}</div>`);
      if (field.type === "checklist") {
        (field.options || []).forEach(opt => {
          const checked = (val || []).includes(opt);
          w.document.write(`<div class="check"><span class="${checked ? "check-y" : "check-n"}">${checked ? "✓" : "✗"}</span><span>${opt}</span></div>`);
        });
      } else if (field.type === "signature") {
        w.document.write(val ? `<img class="sig" src="${val}" />` : `<div class="value">No signature</div>`);
      } else {
        w.document.write(`<div class="value">${val || "—"}</div>`);
      }
      w.document.write(`</div>`);
    });
    w.document.write(`</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const addNote = () => {
    if (!noteForm.text.trim() && noteForm.attachments.length === 0) return;
    const note = { id: Date.now(), text: noteForm.text, category: noteForm.category, attachments: noteForm.attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })), createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
    const catLabel = NOTE_CATEGORIES.find(c => c.id === noteForm.category)?.label || noteForm.category;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Added note (${catLabel})`) } : j));
    setNoteForm({ text: "", category: "general", attachments: [] });
    setShowNoteForm(false);
  };

  const startEditNote = (note) => {
    setEditingNoteId(note.id);
    setEditNoteForm({ text: note.text, category: note.category, attachments: [...(note.attachments || [])] });
  };

  const saveEditNote = () => {
    if (!editNoteForm.text.trim() && editNoteForm.attachments.length === 0) return;
    const catLabel = NOTE_CATEGORIES.find(c => c.id === editNoteForm.category)?.label || editNoteForm.category;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: (j.notes || []).map(n => n.id === editingNoteId ? { ...n, text: editNoteForm.text, category: editNoteForm.category, attachments: editNoteForm.attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })) } : n), activityLog: addLog(j.activityLog, `Edited note (${catLabel})`) } : j));
    setEditingNoteId(null);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNoteForm({ text: "", category: "general", attachments: [] });
  };

  const handleEditNoteFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { setEditNoteForm(prev => ({ ...prev, attachments: prev.attachments.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x) })); };
        reader.readAsDataURL(m._file);
      }
    });
    setEditNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, ...mapped] }));
    e.target.value = "";
  };

  const deleteNote = (noteId) => {
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: (j.notes || []).filter(n => n.id !== noteId), activityLog: addLog(j.activityLog, "Deleted a note") } : j));
  };

  const handleNoteFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { setNoteForm(prev => ({ ...prev, attachments: prev.attachments.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x) })); };
        reader.readAsDataURL(m._file);
      }
    });
    setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, ...mapped] }));
    e.target.value = "";
  };

  const saveMarkup = (dataUrl) => {
    if (markupImg?.noteId && markupImg?.attachmentId) {
      // Replace existing attachment on a saved note
      setJobs(js => js.map(j => j.id === job.id ? {
        ...j,
        notes: (j.notes || []).map(n => n.id === markupImg.noteId ? {
          ...n,
          attachments: n.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
        } : n),
        activityLog: addLog(j.activityLog, "Photo marked up")
      } : j));
    } else if (markupImg?.target === "new" && markupImg?.attachmentId) {
      // Replace attachment in new note form
      setNoteForm(prev => ({
        ...prev,
        attachments: prev.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
      }));
    } else if (markupImg?.target === "new") {
      // Add marked-up image as new attachment to the current note form (from lightbox)
      const att = { id: genId(), name: "markup_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
      setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, att] }));
    } else if (markupImg?.target === "edit") {
      // Replace attachment in edit form
      setEditNoteForm(prev => ({
        ...prev,
        attachments: prev.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
      }));
    }
    setMarkupImg(null);
  };

  const savePlan = (dataUrl) => {
    const att = { id: genId(), name: "plan_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
    if (showNoteForm) {
      setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, att], text: prev.text || "Plan drawing" }));
    } else {
      // Auto-create a note with the plan
      const newNote = { id: Date.now(), text: "Plan drawing", category: "general", attachments: [att], createdAt: new Date().toISOString(), createdBy: "Alex Jones" };
      setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), newNote], activityLog: addLog(j.activityLog, "Added plan drawing") } : j));
    }
    setShowPlanDrawing(false);
  };

  const delTime = async (id) => {
    try {
      await deleteTimeEntry(id);
      setTimeEntries(ts => ts.filter(t => t.id !== id));
    } catch (err) { console.error('Failed to delete time entry:', err); }
  };
  const delQuote = async (id) => {
    try {
      await deleteQuote(id);
      setQuotes(qs => qs.filter(q => q.id !== id));
    } catch (err) { console.error('Failed to delete quote:', err); }
  };
  const delInvoice = async (id) => {
    try {
      await deleteInvoice(id);
      setInvoices(is => is.filter(i => i.id !== id));
    } catch (err) { console.error('Failed to delete invoice:', err); }
  };
  const delBill = async (id) => {
    try {
      await deleteBill(id);
      setBills(bs => bs.filter(b => b.id !== id));
    } catch (err) { console.error('Failed to delete bill:', err); }
  };
  const markInvPaid = async (id) => {
    const inv = invoices.find(i => i.id === id);
    try {
      const saved = await updateInvoice(id, { ...inv, status: "paid" });
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${inv?.number} marked paid`) } : j));
    } catch (err) { console.error('Failed to mark invoice paid:', err); }
  };
  const acceptQuote = async (id) => {
    const q = quotes.find(x => x.id === id);
    try {
      const saved = await updateQuote(id, { ...q, status: "accepted" });
      setQuotes(qs => {
        const updated = qs.map(x => x.id === saved.id ? saved : x);
        // Update job estimate with cumulative accepted quote total
        const acceptedTotal = updated.filter(x => x.jobId === job.id && x.status === "accepted").reduce((s, x) => s + calcQuoteTotal(x), 0);
        setJobs(js => js.map(j => j.id === job.id ? {
          ...j,
          estimate: { ...(j.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 }), total: acceptedTotal },
          activityLog: addLog(j.activityLog, `Quote ${q?.number} accepted · Estimate updated to ${fmt(acceptedTotal)}`)
        } : j));
        return updated;
      });
    } catch (err) { console.error('Failed to accept quote:', err); }
  };

  // ── Edit state for inline modals ──
  const [editingQuote,   setEditingQuote]   = useState(null);
  const [inlineQuoteMode, setInlineQuoteMode] = useState("edit");
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [inlineInvMode, setInlineInvMode] = useState("edit");
  const [editingBill,    setEditingBill]    = useState(null);

  const saveQuote = async (data) => {
    try {
      const saved = await updateQuote(data.id, data);
      setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
      setEditingQuote(saved);
      setInlineQuoteMode("view");
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Quote ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save quote:', err); }
  };
  const saveInvoice = async (data) => {
    try {
      const saved = await updateInvoice(data.id, data);
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      setEditingInvoice(saved);
      setInlineInvMode("view");
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save invoice:', err); }
  };
  const saveBillFromJob = async (data) => {
    try {
      if (editingBill?.id) {
        const saved = await updateBill(editingBill.id, data);
        setBills(bs => bs.map(b => b.id === editingBill.id ? saved : b));
        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill from ${data.supplier} updated`) } : j));
      } else {
        const billData = { ...data, jobId: job.id, status: "linked" };
        const saved = await createBill(billData);
        setBills(bs => [...bs, saved]);
        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill captured: ${data.supplier} ${fmt(data.amount)}`) } : j));
      }
    } catch (err) { console.error('Failed to save bill:', err); }
    setEditingBill(null);
  };

  const saveDetailForm = async () => {
    const data = { ...detailForm, tags: detailForm.tags.split(",").map(t => t.trim()).filter(Boolean), estimate: detailForm.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } };
    try {
      const changes = [];
      if (job.title !== data.title) changes.push(`Title changed to "${data.title}"`);
      if (job.status !== data.status) changes.push(`Status → ${data.status.replace("_"," ")}`);
      if (job.priority !== data.priority) changes.push(`Priority → ${data.priority}`);
      const msg = changes.length ? changes.join(" · ") : "Job updated";
      const saved = await updateJob(job.id, data);
      setJobs(js => js.map(j => j.id === job.id ? { ...saved, activityLog: addLog(j.activityLog, msg) } : j));
      setDetailMode("view");
    } catch (err) { console.error('Failed to save job:', err); }
  };

  const jobNotes = job.notes || [];
  const jobPhases = job.phases || [];
  const jobTasks = job.tasks || [];
  const tasksDone = jobTasks.filter(t => t.done).length;
  const tasksRemaining = jobTasks.length - tasksDone;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "pnl", label: "P&L" },
    { id: "gantt", label: `Gantt (${jobPhases.length})` },
    { id: "tasks", label: `Tasks${tasksRemaining > 0 ? ` (${tasksRemaining})` : jobTasks.length > 0 ? " ✓" : ""}` },
    { id: "notes", label: `Notes (${jobNotes.length})` },
    { id: "quotes", label: `Quotes (${jobQuotes.length})` },
    { id: "invoices", label: `Invoices (${jobInvoices.length})` },
    { id: "time", label: `Time (${totalHours}h)` },
    { id: "costs", label: `Costs (${jobBills.length})` },
    { id: "schedule", label: `Schedule (${jobSchedule.length})` },
    { id: "orders", label: `Orders (${jobWOs.length + jobPOs.length})` },
    { id: "activity", label: `Activity (${(job.activityLog||[]).length})` },
  ];

  const jobAccent = SECTION_COLORS.jobs.accent;
  const jobLight = SECTION_COLORS.jobs.light;

  const jobStatusStrip = detailMode === "view" ? (
    <div style={{ flexShrink: 0 }}>
      <div style={{ padding: "10px 20px", background: jobLight, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
        {["draft","scheduled","in_progress","completed","cancelled"].filter(s => s !== job.status).map(s => (
          <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => {
            const updated = { ...job, status: s, activityLog: addLog(job.activityLog, `Status → ${s.replace("_"," ")}`) };
            setJobs(js => js.map(j => j.id === job.id ? updated : j));
          }}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</button>
        ))}
      </div>
      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 0, padding: "0 20px", overflowX: "auto", flexShrink: 0 }}>
        {tabs.map(t => <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ whiteSpace: "nowrap", borderBottomColor: tab === t.id ? jobAccent : "transparent" }}>{t.label}</div>)}
      </div>
    </div>
  ) : null;

  const jobFooter = detailMode === "view" ? <>
    <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => { setDetailForm({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setDetailMode("edit"); }}>
      <Icon name="edit" size={13} /> Edit
    </button>
  </> : <>
    <button className="btn btn-ghost btn-sm" onClick={() => setDetailMode("view")}>Cancel</button>
    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveDetailForm} disabled={!detailForm.title}>
      <Icon name="check" size={13} /> Save Changes
    </button>
  </>;

  return (
    <>
    <SectionDrawer
      accent={jobAccent}
      icon={<Icon name="jobs" size={16} />}
      typeLabel="Job"
      title={job.title}
      statusBadge={<StatusBadge status={job.status} />}
      mode={detailMode} setMode={setDetailMode}
      showToggle={true}
      statusStrip={jobStatusStrip}
      footer={jobFooter}
      onClose={onClose}
    >
        {detailMode === "edit" ? (
        <div style={{ padding: "20px 24px" }}>
          <div className="form-group">
            <label className="form-label">Job Title *</label>
            <input className="form-control" value={detailForm.title} onChange={e => setDetailForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Fitout – Level 3" />
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Client *</label>
              <select className="form-control" value={detailForm.clientId} onChange={e => setDetailForm(f => ({ ...f, clientId: e.target.value, siteId: "" }))}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Site</label>
              <select className="form-control" value={detailForm.siteId || ""} onChange={e => setDetailForm(f => ({ ...f, siteId: e.target.value || null }))}>
                <option value="">— No specific site —</option>
                {(clients.find(c => String(c.id) === String(detailForm.clientId))?.sites || []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={detailForm.status} onChange={e => setDetailForm(f => ({ ...f, status: e.target.value }))}>
                {["draft","scheduled","quoted","in_progress","completed","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-control" value={detailForm.priority} onChange={e => setDetailForm(f => ({ ...f, priority: e.target.value }))}>
                {["high","medium","low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tags (comma separated)</label>
              <input className="form-control" value={detailForm.tags} onChange={e => setDetailForm(f => ({ ...f, tags: e.target.value }))} placeholder="fitout, commercial, urgent" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input type="date" className="form-control" value={detailForm.startDate} onChange={e => setDetailForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input type="date" className="form-control" value={detailForm.dueDate} onChange={e => setDetailForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Assigned Team Members</label>
            <div className="multi-select">
              {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                <span key={t} className={`multi-option ${detailForm.assignedTo.includes(t) ? "selected" : ""}`}
                  onClick={() => setDetailForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Estimate</div>
            <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Labour ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.labour || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, labour: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Materials ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.materials || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, materials: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Subcontractors ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.subcontractors || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, subcontractors: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Other ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.other || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, other: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              {(() => {
                const t = (detailForm.estimate?.labour || 0) + (detailForm.estimate?.materials || 0) + (detailForm.estimate?.subcontractors || 0) + (detailForm.estimate?.other || 0);
                return <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 13, fontWeight: 800 }}>Total: {fmt(t)}</div>;
              })()}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={detailForm.description} onChange={e => setDetailForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
          </div>
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div>
              {job.description && <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 20 }}>{job.description}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Estimate", val: (() => { const e = job.estimate || {}; const t = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0); return t > 0 ? fmt(t) : "—"; })(), sub: (() => { const e = job.estimate || {}; const t = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0); return t > 0 ? "Budget set" : "Not set"; })() },
                  { label: "Quoted", val: fmt(totalQuoted), sub: `${jobQuotes.filter(q=>q.status==="accepted").length} accepted` },
                  { label: "Invoiced", val: fmt(totalInvoiced), sub: `${fmt(totalPaid)} paid` },
                  { label: "Time Logged", val: `${totalHours}h`, sub: `${jobTime.filter(t=>t.billable).reduce((s,t)=>s+t.hours,0)}h billable` },
                  { label: "Costs", val: fmt(totalCosts), sub: `${jobBills.filter(b=>b.status==="pending").length} pending` },
                ].map((s,i) => (
                  <div key={i} style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="grid-2">
                <div>
                  <SectionLabel>Job Details</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { label: "Client", val: client?.name },
                      { label: "Site", val: (() => { const s = client?.sites?.find(x => x.id === job.siteId); return s ? s.name : "—"; })() },
                      { label: "Site Contact", val: (() => { const s = client?.sites?.find(x => x.id === job.siteId); return s?.contactName ? `${s.contactName}${s.contactPhone ? " · " + s.contactPhone : ""}` : "—"; })() },
                      { label: "Status", val: <StatusBadge status={job.status} /> },
                      { label: "Priority", val: <span style={{ textTransform: "capitalize" }}>{job.priority}</span> },
                      { label: "Start Date", val: job.startDate || "—" },
                      { label: "Due Date", val: job.dueDate || "—" },
                    ].map((r,i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #f5f5f5", paddingBottom: 6 }}>
                        <span style={{ color: "#888" }}>{r.label}</span><span style={{ fontWeight: 600 }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel>Team</SectionLabel>
                  {job.assignedTo.length === 0
                    ? <div style={{ fontSize: 13, color: "#bbb" }}>No team assigned</div>
                    : job.assignedTo.map((w,i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div className="avatar" style={{ margin: 0 }}>{w.split(" ").map(p=>p[0]).join("")}</div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{w}</span>
                        <span style={{ fontSize: 11, color: "#bbb", marginLeft: "auto" }}>{jobTime.filter(t=>t.worker===w).reduce((s,t)=>s+t.hours,0)}h</span>
                      </div>
                    ))
                  }
                  {job.tags.length > 0 && <>
                    <SectionLabel>Tags</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{job.tags.map((t,i) => <span key={i} className="tag">{t}</span>)}</div>
                  </>}
                </div>
              </div>
            </div>
          )}

          {/* ── Quotes ── */}
          {tab === "quotes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.quotes.accent }} onClick={async () => {
                  try {
                    const newQ = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" };
                    const saved = await createQuote(newQ);
                    setQuotes(qs => [...qs, saved]);
                    setEditingQuote(saved);
                    setInlineQuoteMode("edit");
                  } catch (err) { console.error('Failed to create quote:', err); }
                }}><Icon name="plus" size={12} />New Quote</button>
              </div>
              {jobQuotes.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No quotes yet</div><div className="empty-state-sub">Create a quote to send to the client</div></div>
                : jobQuotes.map(q => {
                  const sub = q.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const alreadyInvoiced = invoices.some(i => i.fromQuoteId === q.id);
                  return (
                    <div key={q.id} style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{q.number}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{q.createdAt}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge status={q.status} />
                          {q.status !== "accepted" && <button className="btn btn-secondary btn-xs" onClick={() => acceptQuote(q.id)}>Accept</button>}
                          {q.status === "accepted" && !alreadyInvoiced && (
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => { quoteToInvoice(q); setTab("invoices"); }}>
                              <Icon name="invoices" size={11} />→ Invoice
                            </button>
                          )}
                          {alreadyInvoiced && <span style={{ fontSize: 11, color: "#aaa" }}>Invoiced ✓</span>}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingQuote(q); setInlineQuoteMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delQuote(q.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} style={{ textAlign: "left", color: "#bbb", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "1px solid #f0f0f0" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {q.lineItems.map((l,i) => (
                            <tr key={i}>
                              <td style={{ padding: "5px 0", color: "#444" }}>{l.desc}</td>
                              <td style={{ color: "#666" }}>{l.qty}</td>
                              <td style={{ color: "#666" }}>{l.unit}</td>
                              <td style={{ color: "#666" }}>{fmt(l.rate)}</td>
                              <td style={{ fontWeight: 600 }}>{fmt(l.qty * l.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 20, fontSize: 13 }}>
                        <span style={{ color: "#999" }}>Subtotal <strong style={{ color: "#111" }}>{fmt(sub)}</strong></span>
                        <span style={{ color: "#999" }}>GST <strong style={{ color: "#111" }}>{fmt(sub * q.tax / 100)}</strong></span>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>Total {fmt(calcQuoteTotal(q))}</span>
                      </div>
                      {q.notes && <div style={{ marginTop: 8, fontSize: 12, color: "#999", fontStyle: "italic", borderTop: "1px solid #f5f5f5", paddingTop: 8 }}>{q.notes}</div>}
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Invoices ── */}
          {tab === "invoices" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobInvoices.length > 0 && <span><strong style={{ color: "#111" }}>{fmt(totalPaid)}</strong> paid of <strong style={{ color: "#111" }}>{fmt(totalInvoiced)}</strong> invoiced</span>}
                </div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.invoices.accent }} onClick={async () => {
                  try {
                    const newInv = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" };
                    const saved = await createInvoice(newInv);
                    setInvoices(is => [...is, saved]);
                    setEditingInvoice(saved);
                    setInlineInvMode("edit");
                  } catch (err) { console.error('Failed to create invoice:', err); }
                }}><Icon name="plus" size={12} />New Invoice</button>
              </div>
              {jobInvoices.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices yet</div><div className="empty-state-sub">Create an invoice or convert an accepted quote</div></div>
                : jobInvoices.map(inv => {
                  const sub = inv.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const fromQuote = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                  return (
                    <div key={inv.id} style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{inv.number}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                            {inv.createdAt}
                            {fromQuote && <span style={{ marginLeft: 8, color: "#bbb" }}>from {fromQuote.number}</span>}
                            {inv.dueDate && <span style={{ marginLeft: 8 }}>· Due {inv.dueDate}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge status={inv.status} />
                          <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} />
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => markInvPaid(inv.id)}>Mark Paid</button>
                          )}
                          {!inv.xeroInvoiceId && inv.status !== "draft" && (
                            <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} onClick={() => xeroSyncInvoice("push", inv.id)} title="Send to Xero"><Icon name="send" size={11} /> Xero</button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingInvoice(inv); setInlineInvMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delInvoice(inv.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} style={{ textAlign: "left", color: "#bbb", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "1px solid #f0f0f0" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {inv.lineItems.map((l,i) => (
                            <tr key={i}><td style={{ padding: "5px 0", color: "#444" }}>{l.desc}</td><td style={{ color: "#666" }}>{l.qty}</td><td style={{ color: "#666" }}>{l.unit}</td><td style={{ color: "#666" }}>{fmt(l.rate)}</td><td style={{ fontWeight: 600 }}>{fmt(l.qty*l.rate)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 20, fontSize: 13 }}>
                        <span style={{ color: "#999" }}>Subtotal <strong style={{ color: "#111" }}>{fmt(sub)}</strong></span>
                        <span style={{ color: "#999" }}>GST <strong style={{ color: "#111" }}>{fmt(sub * inv.tax / 100)}</strong></span>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>Total {fmt(calcQuoteTotal(inv))}</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Time ── */}
          {tab === "time" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {totalHours > 0 && <span><strong style={{ color: "#111" }}>{jobTime.filter(t=>t.billable).reduce((s,t)=>s+t.hours,0)}h</strong> billable · <strong style={{ color: "#111" }}>{totalHours}h</strong> total</span>}
                </div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.time.accent }} onClick={() => setShowTimeForm(v => !v)}><Icon name="plus" size={12} />Log Time</button>
              </div>
              {showTimeForm && (
                <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #e8e8e8" }}>
                  <div className="grid-3" style={{ marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Worker</label>
                      <select className="form-control" value={timeForm.worker} onChange={e => setTimeForm(f => ({ ...f, worker: e.target.value }))}>
                        {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Date</label>
                      <input type="date" className="form-control" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Hours</label>
                      <div style={{ background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 6, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: quickHours > 0 ? "#111" : "#ccc", textAlign: "center" }}>
                        {quickHours > 0 ? `${quickHours.toFixed(1)}h` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Start Time</label>
                      <input type="time" className="form-control" value={timeForm.startTime}
                        onChange={e => setTimeForm(f => ({ ...f, startTime: e.target.value, endTime: f.endTime || addMinsToTime(e.target.value, 60) }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">End Time</label>
                      <input type="time" className="form-control" value={timeForm.endTime}
                        onChange={e => setTimeForm(f => ({ ...f, endTime: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Description</label>
                    <input className="form-control" value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} placeholder="Work description" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="checkbox-label"><input type="checkbox" checked={timeForm.billable} onChange={e => setTimeForm(f => ({ ...f, billable: e.target.checked }))} /><span>Billable</span></label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowTimeForm(false)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.time.accent }} onClick={saveTime} disabled={quickHours <= 0}><Icon name="check" size={12} />Save</button>
                    </div>
                  </div>
                </div>
              )}
              {jobTime.length === 0 && !showTimeForm
                ? <div className="empty-state"><div className="empty-state-icon">⏱</div><div className="empty-state-text">No time logged yet</div></div>
                : <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr><th>Worker</th><th>Date</th><th>Hours</th><th>Billable</th><th>Description</th><th></th></tr></thead>
                    <tbody>
                      {[...jobTime].sort((a,b) => b.date > a.date ? 1 : -1).map(t => (
                        <tr key={t.id}>
                          <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="avatar" style={{ width: 26, height: 26, fontSize: 10, background: "#333", margin: 0 }}>{t.worker.split(" ").map(w=>w[0]).join("")}</div><span style={{ fontWeight: 600, fontSize: 13 }}>{t.worker}</span></div></td>
                          <td style={{ fontSize: 12, color: "#999" }}>{t.date}</td>
                          <td><span style={{ fontWeight: 700 }}>{t.hours}h</span></td>
                          <td><span className="badge" style={{ background: t.billable ? "#111" : "#f0f0f0", color: t.billable ? "#fff" : "#999" }}>{t.billable ? "Billable" : "Non-bill"}</span></td>
                          <td style={{ fontSize: 12, color: "#666" }}>{t.description}</td>
                          <td><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delTime(t.id)}><Icon name="trash" size={11} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></div>
              }
            </div>
          )}

          {/* ── Costs / Bills ── */}
          {tab === "costs" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobBills.length > 0 && (
                    <span>
                      <strong style={{ color: "#111" }}>{fmt(jobBills.filter(b=>b.status==="posted"||b.status==="approved").reduce((s,b)=>s+b.amount,0))}</strong> approved
                      {jobBills.filter(b=>b.status==="inbox"||b.status==="linked").length > 0 && (
                        <span> · <strong style={{ color: "#111" }}>{fmt(jobBills.filter(b=>b.status==="inbox"||b.status==="linked").reduce((s,b)=>s+b.amount,0))}</strong> pending</span>
                      )}
                    </span>
                  )}
                </div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setEditingBill({})}><Icon name="plus" size={12} />Capture Bill</button>
              </div>
              {jobBills.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills captured for this job</div><div className="empty-state-sub">Capture receipts and supplier invoices here</div></div>
                : <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr><th>Supplier</th><th>Invoice #</th><th>Category</th><th>Date</th><th>Ex-GST</th><th>Total</th><th>Markup</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {jobBills.map(b => {
                        const exGst = b.hasGst !== false ? (b.amount||0) / 1.1 : (b.amount||0);
                        const onCharge = exGst * (1 + (b.markup||0) / 100);
                        return (
                          <tr key={b.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier || <span style={{ color: "#ccc" }}>—</span>}</div>
                              {b.description && <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>{b.description.slice(0,40)}{b.description.length>40?"…":""}</div>}
                            </td>
                            <td><span style={{ fontFamily: "monospace", fontSize: 12, color: "#666" }}>{b.invoiceNo || "—"}</span></td>
                            <td><span className="chip">{b.category}</span></td>
                            <td style={{ fontSize: 12, color: "#999" }}>{b.date}</td>
                            <td style={{ fontSize: 13 }}>{fmt(exGst)}</td>
                            <td style={{ fontWeight: 700 }}>{fmt(b.amount||0)}</td>
                            <td style={{ fontSize: 12 }}>
                              {(b.markup||0) > 0
                                ? <span style={{ color: "#555" }}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span>
                                : <span style={{ color: "#ddd" }}>—</span>}
                            </td>
                            <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && (
                                  <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>
                                )}
                                {b.status === "linked" && (
                                  <button className="btn btn-ghost btn-xs" style={{ color: "#1e7e34" }} title="Approve"
                                    onClick={async () => {
                                      try {
                                        const saved = await updateBill(b.id, { ...b, status: "approved" });
                                        setBills(bs => bs.map(x => x.id === saved.id ? saved : x));
                                        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill from ${b.supplier} approved`) } : j));
                                      } catch (err) { console.error('Failed to approve bill:', err); }
                                    }}>
                                    <Icon name="check" size={11} />
                                  </button>
                                )}
                                <button className="btn btn-ghost btn-xs" onClick={() => setEditingBill(b)}><Icon name="edit" size={11} /></button>
                                <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delBill(b.id)}><Icon name="trash" size={11} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div></div>
              }
            </div>
          )}

          {/* ── Schedule ── */}
          {tab === "schedule" && (
            <div>
              {jobSchedule.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No schedule entries</div></div>
                : jobSchedule.map(s => {
                  const schClient = clients.find(c => c.id === job.clientId);
                  const schSite = schClient?.sites?.find(st => st.id === job.siteId);
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", borderBottom: "1px solid #f5f5f5", paddingBottom: 14, marginBottom: 14 }}>
                      <div style={{ background: "#111", color: "#fff", borderRadius: 6, padding: "8px 12px", textAlign: "center", minWidth: 68, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{new Date(s.date+"T12:00:00").toLocaleString("en", { month: "short" })}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(s.date+"T12:00:00").getDate()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.date} · {new Date(s.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long"})}</div>
                        {schSite && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>📍 {schSite.name}</div>}
                        {schSite?.contactName && <div style={{ fontSize: 12, color: "#888" }}>👤 {schSite.contactName} {schSite.contactPhone && `· ${schSite.contactPhone}`}</div>}
                        {s.notes && <div style={{ fontSize: 12, color: "#999", fontStyle: "italic", marginTop: 4 }}>{s.notes}</div>}
                        {(s.assignedTo||[]).length > 0 && <div style={{ marginTop: 8 }}><AvatarGroup names={s.assignedTo} max={4} /></div>}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Activity ── */}
          {tab === "orders" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobWOs.length + jobPOs.length > 0
                    ? <span><strong style={{ color: "#111" }}>{jobWOs.length}</strong> WO{jobWOs.length !== 1 ? "s" : ""} · <strong style={{ color: "#111" }}>{jobPOs.length}</strong> PO{jobPOs.length !== 1 ? "s" : ""}</span>
                    : "No orders yet"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-primary btn-sm" style={{ background: "#2563eb" }} onClick={() => {
                    const newWo = { id: genId(), ref: "WO-" + String((workOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", contractorId: "", contractorName: "", contractorContact: "", contractorEmail: "", contractorPhone: "", trade: "", scopeOfWork: "", notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Work order created")] };
                    setWorkOrders(prev => [...prev, newWo]);
                  }}><Icon name="plus" size={12} />New WO</button>
                  <button className="btn btn-primary btn-sm" style={{ background: "#16a34a" }} onClick={() => {
                    const newPo = { id: genId(), ref: "PO-" + String((purchaseOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", supplierId: "", supplierName: "", supplierContact: "", supplierEmail: "", supplierAbn: "", deliveryAddress: "", lines: [{ id: genId(), desc: "", qty: 1, unit: "ea" }], notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Purchase order created")] };
                    setPurchaseOrders(prev => [...prev, newPo]);
                  }}><Icon name="plus" size={12} />New PO</button>
                </div>
              </div>
              {jobWOs.length + jobPOs.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: "#999", fontSize: 13 }}>No work orders or purchase orders linked to this job yet.</div>
                : <div className="order-cards-grid">
                    {[...jobWOs.map(o => ({ ...o, _type: "wo" })), ...jobPOs.map(o => ({ ...o, _type: "po" }))].sort((a,b) => b.id - a.id).map(o => (
                      <OrderCard key={o.id} type={o._type} order={o} jobs={jobs} onOpen={() => {}} onDelete={() => {
                        if (o._type === "wo") setWorkOrders(prev => prev.filter(x => x.id !== o.id));
                        else setPurchaseOrders(prev => prev.filter(x => x.id !== o.id));
                      }} />
                    ))}
                  </div>
              }
            </div>
          )}

          {tab === "pnl" && (() => {
            const est = job.estimate || defaultEstimate;
            const breakdownTotal = (est.labour || 0) + (est.materials || 0) + (est.subcontractors || 0) + (est.other || 0);
            const acceptedQuotesTotal = jobQuotes.filter(q => q.status === "accepted").reduce((s, q) => s + calcQuoteTotal(q), 0);
            const totalEstimate = acceptedQuotesTotal > 0 ? Math.max(breakdownTotal, acceptedQuotesTotal) : breakdownTotal;

            // Client rates
            const clientRates = client?.rates || {};
            const clientLabourRate = clientRates.labourRate || 0;
            const clientMatMargin = clientRates.materialMargin || 0;
            const clientSubMargin = clientRates.subcontractorMargin || 0;

            // Revenue
            const revenue = totalQuoted > 0 ? totalQuoted : totalInvoiced;
            const revenueLabel = totalQuoted > 0 ? "Quoted (Accepted)" : "Invoiced";

            // Labour costs from time entries × staff cost rates
            const labourByWorker = {};
            jobTime.forEach(t => {
              const s = (staff || []).find(x => x.name === t.worker);
              const rate = s?.costRate || 55;
              if (!labourByWorker[t.worker]) labourByWorker[t.worker] = { hours: 0, cost: 0, rate };
              labourByWorker[t.worker].hours += t.hours;
              labourByWorker[t.worker].cost += t.hours * rate;
            });
            const actualLabour = Object.values(labourByWorker).reduce((s, w) => s + w.cost, 0);

            // Material costs from bills
            const matBills = jobBills.filter(b => b.category === "Materials");
            const actualMaterials = matBills.reduce((s, b) => s + b.amount, 0);

            // Subcontractor costs from bills + WO poLimits for accepted/completed WOs
            const subBills = jobBills.filter(b => b.category === "Subcontractor");
            const actualSubs = subBills.reduce((s, b) => s + b.amount, 0);

            // Other costs
            const otherBills = jobBills.filter(b => b.category !== "Materials" && b.category !== "Subcontractor");
            const actualOther = otherBills.reduce((s, b) => s + b.amount, 0);

            const totalActual = actualLabour + actualMaterials + actualSubs + actualOther;

            // Revenue at client rates
            const totalLabourHours = Object.values(labourByWorker).reduce((s, w) => s + w.hours, 0);
            const clientLabourRevenue = totalLabourHours * clientLabourRate;
            const clientMaterialRevenue = clientMatMargin > 0 ? actualMaterials * (1 + clientMatMargin / 100) : actualMaterials;
            const clientSubRevenue = clientSubMargin > 0 ? actualSubs * (1 + clientSubMargin / 100) : actualSubs;
            const clientTotalRevenue = clientLabourRevenue + clientMaterialRevenue + clientSubRevenue + actualOther;
            const clientProfit = clientTotalRevenue - totalActual;
            const clientMarginPct = clientTotalRevenue > 0 ? Math.round((clientProfit / clientTotalRevenue) * 100) : 0;

            const profit = revenue - totalActual;
            const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
            const costPct = totalEstimate > 0 ? Math.min(100, Math.round((totalActual / totalEstimate) * 100)) : 0;

            const varRow = (label, estimated, actual) => {
              const variance = estimated - actual;
              const pct = estimated > 0 ? Math.round((actual / estimated) * 100) : (actual > 0 ? 999 : 0);
              const overBudget = actual > estimated && estimated > 0;
              return (
                <tr key={label}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{label}</td>
                  <td style={{ textAlign: "right", fontSize: 13 }}>{fmt(estimated)}</td>
                  <td style={{ textAlign: "right", fontSize: 13 }}>{fmt(actual)}</td>
                  <td style={{ textAlign: "right", fontSize: 13, color: overBudget ? "#dc2626" : "#059669", fontWeight: 600 }}>{variance >= 0 ? "+" : ""}{fmt(variance)}</td>
                  <td style={{ textAlign: "right", fontSize: 13, color: overBudget ? "#dc2626" : "#059669" }}>{pct}%</td>
                </tr>
              );
            };

            const saveEstimate = () => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, estimate: { ...estimateForm }, activityLog: addLog(j.activityLog, "Updated job estimate") } : j));
              setEditingEstimate(false);
            };

            return (
            <div>
              {/* Hero stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Total Estimate</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{totalEstimate > 0 ? fmt(totalEstimate) : "—"}</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{acceptedQuotesTotal > 0 ? `Incl. ${fmt(acceptedQuotesTotal)} quoted` : totalEstimate > 0 ? "Budget set" : "No estimate set"}</div>
                </div>
                <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Revenue</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{fmt(revenue)}</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{revenueLabel}{totalPaid > 0 ? ` · ${fmt(totalPaid)} paid` : ""}</div>
                </div>
                <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Total Costs</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: totalEstimate > 0 && totalActual > totalEstimate ? "#dc2626" : "#111" }}>{fmt(totalActual)}</div>
                  {totalEstimate > 0 && <div style={{ marginTop: 6 }}>
                    <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${costPct}%`, height: "100%", background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#059669", borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{costPct}% of estimate</div>
                  </div>}
                </div>
                <div style={{ background: profit >= 0 ? "#ecfdf5" : "#fef2f2", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${profit >= 0 ? "#059669" : "#dc2626"}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: profit >= 0 ? "#059669" : "#dc2626", marginBottom: 6 }}>Profit / Margin</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: profit >= 0 ? "#059669" : "#dc2626" }}>{fmt(profit)}</div>
                  <div style={{ fontSize: 11, color: profit >= 0 ? "#059669" : "#dc2626", marginTop: 3 }}>{revenue > 0 ? `${marginPct}% margin` : "No revenue yet"}</div>
                </div>
              </div>

              {/* Estimate Breakdown — editable */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Estimate Breakdown</div>
                  {!editingEstimate && <button className="btn btn-ghost btn-xs" onClick={() => { setEstimateForm({ ...defaultEstimate, ...(job.estimate || {}) }); setEditingEstimate(true); }}><Icon name="edit" size={11} /> Edit</button>}
                </div>
                {editingEstimate ? (
                  <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[{ key: "labour", label: "Labour" }, { key: "materials", label: "Materials" }, { key: "subcontractors", label: "Subcontractors" }, { key: "other", label: "Other" }].map(f => (
                        <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">{f.label}</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 13, color: "#999" }}>$</span>
                            <input type="number" className="form-control" value={estimateForm[f.key] || ""} onChange={e => setEstimateForm(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))} style={{ flex: 1 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>Total: {fmt((estimateForm.labour || 0) + (estimateForm.materials || 0) + (estimateForm.subcontractors || 0) + (estimateForm.other || 0))}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingEstimate(false)}>Cancel</button>
                        <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveEstimate}>Save Estimate</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    {[{ label: "Labour", val: est.labour }, { label: "Materials", val: est.materials }, { label: "Subcontractors", val: est.subcontractors }, { label: "Other", val: est.other }].map(c => (
                      <div key={c.label} style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{c.val ? fmt(c.val) : "—"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cost Breakdown */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>Cost Breakdown</div>

                {/* Labour */}
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Labour</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(actualLabour)}</div>
                  </div>
                  {Object.entries(labourByWorker).length > 0 ? Object.entries(labourByWorker).map(([name, w]) => (
                    <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12, color: "#555" }}>
                      <span>{name} <span style={{ color: "#999" }}>({w.hours}h × ${w.rate}/hr)</span></span>
                      <span style={{ fontWeight: 600 }}>{fmt(w.cost)}</span>
                    </div>
                  )) : <div style={{ fontSize: 12, color: "#999" }}>No time logged</div>}
                </div>

                {/* Materials */}
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Materials</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(actualMaterials)}</div>
                  </div>
                  {matBills.length > 0 ? matBills.map(b => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12, color: "#555" }}>
                      <span>{b.supplier} {b.invoiceNo && <span style={{ color: "#999" }}>({b.invoiceNo})</span>}</span>
                      <span style={{ fontWeight: 600 }}>{fmt(b.amount)}</span>
                    </div>
                  )) : <div style={{ fontSize: 12, color: "#999" }}>No material costs</div>}
                </div>

                {/* Subcontractors */}
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Subcontractors</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(actualSubs)}</div>
                  </div>
                  {subBills.length > 0 ? subBills.map(b => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12, color: "#555" }}>
                      <span>{b.supplier} {b.invoiceNo && <span style={{ color: "#999" }}>({b.invoiceNo})</span>}</span>
                      <span style={{ fontWeight: 600 }}>{fmt(b.amount)}</span>
                    </div>
                  )) : <div style={{ fontSize: 12, color: "#999" }}>No subcontractor costs</div>}
                </div>

                {/* Other */}
                {(otherBills.length > 0 || actualOther > 0) && (
                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Other</div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(actualOther)}</div>
                    </div>
                    {otherBills.map(b => (
                      <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12, color: "#555" }}>
                        <span>{b.supplier} <span style={{ color: "#999" }}>({b.category})</span></span>
                        <span style={{ fontWeight: 600 }}>{fmt(b.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Estimate vs Actual */}
              {totalEstimate > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>Estimate vs Actual</div>
                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f8f8" }}>
                          <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</th>
                          <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Estimate</th>
                          <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actual</th>
                          <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Variance</th>
                          <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {varRow("Labour", est.labour || 0, actualLabour)}
                        {varRow("Materials", est.materials || 0, actualMaterials)}
                        {varRow("Subcontractors", est.subcontractors || 0, actualSubs)}
                        {varRow("Other", est.other || 0, actualOther)}
                        <tr style={{ borderTop: "2px solid #e8e8e8", background: "#f8f8f8" }}>
                          <td style={{ padding: "10px 16px", fontWeight: 800, fontSize: 13 }}>Total</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, fontSize: 13 }}>{fmt(totalEstimate)}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, fontSize: 13 }}>{fmt(totalActual)}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, fontSize: 13, color: totalActual > totalEstimate ? "#dc2626" : "#059669" }}>{totalEstimate - totalActual >= 0 ? "+" : ""}{fmt(totalEstimate - totalActual)}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, fontSize: 13, color: costPct > 100 ? "#dc2626" : "#059669" }}>{costPct}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Revenue Breakdown */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>Revenue Breakdown</div>
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16 }}>
                  {[{ label: "Accepted Quotes", val: totalQuoted, count: jobQuotes.filter(q => q.status === "accepted").length },
                    { label: "Total Invoiced", val: totalInvoiced, count: jobInvoices.length },
                    { label: "Paid", val: totalPaid, count: jobInvoices.filter(i => i.status === "paid").length }
                  ].map((r, i) => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 2 ? "1px solid #f0f0f0" : "none" }}>
                      <span style={{ fontSize: 13, color: "#555" }}>{r.label} <span style={{ color: "#999" }}>({r.count})</span></span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(r.val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue at Client Rates */}
              {clientLabourRate > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>Revenue at Client Rates</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "12px 16px", borderLeft: "3px solid #059669" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#059669", marginBottom: 4 }}>Calculated Revenue</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(clientTotalRevenue)}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Based on {client?.name} rates</div>
                  </div>
                  <div style={{ background: clientProfit >= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 8, padding: "12px 16px", borderLeft: `3px solid ${clientProfit >= 0 ? "#059669" : "#dc2626"}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: clientProfit >= 0 ? "#059669" : "#dc2626", marginBottom: 4 }}>Projected Profit</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: clientProfit >= 0 ? "#059669" : "#dc2626" }}>{fmt(clientProfit)}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{clientMarginPct}% margin</div>
                  </div>
                </div>
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 13, color: "#555" }}>Labour <span style={{ color: "#999" }}>({totalLabourHours}h × ${clientLabourRate}/hr)</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(clientLabourRevenue)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 13, color: "#555" }}>Materials <span style={{ color: "#999" }}>({fmt(actualMaterials)} + {clientMatMargin}% margin)</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(clientMaterialRevenue)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 13, color: "#555" }}>Subcontractors <span style={{ color: "#999" }}>({fmt(actualSubs)} + {clientSubMargin}% margin)</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(clientSubRevenue)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                    <span style={{ fontSize: 13, color: "#555" }}>Other</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(actualOther)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 2px", borderTop: "2px solid #e8e8e8", marginTop: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>Total</span>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{fmt(clientTotalRevenue)}</span>
                  </div>
                </div>
              </div>
              )}
            </div>
            );
          })()}

          {/* ── Gantt Tab ── */}
          {tab === "gantt" && (() => {
            const phases = job.phases || [];
            if (phases.length === 0 && !showPhaseForm) {
              return (
                <div>
                  <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-text">No project phases yet</div></div>
                  <div style={{ textAlign: "center", marginTop: 12 }}>
                    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
                  </div>
                </div>
              );
            }
            const allDates = phases.flatMap(p => [p.startDate, p.endDate]).filter(Boolean);
            const minDate = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : job.startDate || new Date().toISOString().slice(0,10);
            const maxDate = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : job.dueDate || new Date().toISOString().slice(0,10);
            const startMs = new Date(minDate + "T00:00:00").getTime();
            const endMs = new Date(maxDate + "T23:59:59").getTime();
            const rangeMs = Math.max(endMs - startMs, 86400000);
            const todayStr = new Date().toISOString().slice(0,10);
            const todayMs = new Date(todayStr + "T12:00:00").getTime();
            const todayPct = Math.max(0, Math.min(100, ((todayMs - startMs) / rangeMs) * 100));

            const printGanttPdf = () => {
              const w = window.open("", "_blank");
              w.document.write(`<html><head><title>Gantt – ${job.title}</title><style>body{font-family:sans-serif;padding:30px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:13px}th{background:#f5f5f5;font-weight:700}.bar-cell{position:relative;height:24px}.bar{position:absolute;height:20px;border-radius:4px;top:2px}.bar-prog{height:100%;border-radius:4px;opacity:0.7}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#888;margin-top:0}</style></head><body>`);
              w.document.write(`<h1>${job.title}</h1><h2>Project Schedule — Gantt Chart</h2>`);
              w.document.write(`<table><thead><tr><th style="width:160px">Phase</th><th>Start</th><th>End</th><th>Progress</th><th style="width:40%">Timeline</th></tr></thead><tbody>`);
              phases.forEach(p => {
                const pStart = ((new Date(p.startDate + "T00:00:00").getTime() - startMs) / rangeMs) * 100;
                const pWidth = Math.max(2, ((new Date(p.endDate + "T23:59:59").getTime() - new Date(p.startDate + "T00:00:00").getTime()) / rangeMs) * 100);
                w.document.write(`<tr><td style="font-weight:600">${p.name}</td><td>${p.startDate}</td><td>${p.endDate}</td><td>${p.progress}%</td><td class="bar-cell"><div class="bar" style="left:${pStart}%;width:${pWidth}%;background:${p.color}30"><div class="bar-prog" style="width:${p.progress}%;background:${p.color}"></div></div></td></tr>`);
              });
              w.document.write(`</tbody></table></body></html>`);
              w.document.close();
              setTimeout(() => w.print(), 300);
            };

            const savePhase = () => {
              if (!phaseForm.name.trim()) return;
              const updated = editPhase
                ? (job.phases || []).map(p => p.id === editPhase.id ? { ...p, ...phaseForm } : p)
                : [...(job.phases || []), { ...phaseForm, id: Date.now() }];
              setJobs(js => js.map(j => j.id === job.id ? { ...j, phases: updated, activityLog: addLog(j.activityLog, editPhase ? `Updated phase "${phaseForm.name}"` : `Added phase "${phaseForm.name}"`) } : j));
              setShowPhaseForm(false); setEditPhase(null);
            };
            const deletePhase = (pid) => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, phases: (j.phases || []).filter(p => p.id !== pid), activityLog: addLog(j.activityLog, "Removed a project phase") } : j));
            };

            return (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, fontSize: 12, color: "#888" }}>{phases.length} phase{phases.length !== 1 ? "s" : ""} · {minDate} → {maxDate}</div>
                <button className="btn btn-ghost btn-sm" onClick={printGanttPdf}>🖨️ Export PDF</button>
                <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
              </div>

              {showPhaseForm && (
                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Phase Name</label><input className="form-control" value={phaseForm.name} onChange={e => setPhaseForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Demolition" /></div>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Color</label><input type="color" value={phaseForm.color} onChange={e => setPhaseForm(f => ({ ...f, color: e.target.value }))} style={{ width: "100%", height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }} /></div>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Start Date</label><input type="date" className="form-control" value={phaseForm.startDate} onChange={e => setPhaseForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>End Date</label><input type="date" className="form-control" value={phaseForm.endDate} onChange={e => setPhaseForm(f => ({ ...f, endDate: e.target.value }))} /></div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Progress: {phaseForm.progress}%</label>
                    <input type="range" min="0" max="100" step="5" value={phaseForm.progress} onChange={e => setPhaseForm(f => ({ ...f, progress: parseInt(e.target.value) }))} style={{ width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowPhaseForm(false); setEditPhase(null); }}>Cancel</button>
                    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={savePhase} disabled={!phaseForm.name.trim()}>
                      {editPhase ? "Update Phase" : "Add Phase"}
                    </button>
                  </div>
                </div>
              )}

              {/* Gantt Chart */}
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, overflow: "hidden" }}>
                {/* Header with date markers */}
                <div style={{ display: "flex", borderBottom: "1px solid #e8e8e8" }}>
                  <div style={{ width: 160, minWidth: 160, padding: "8px 12px", fontWeight: 700, fontSize: 11, color: "#888", borderRight: "1px solid #e8e8e8" }}>Phase</div>
                  <div style={{ flex: 1, position: "relative", padding: "8px 0", fontSize: 10, color: "#aaa" }}>
                    <span style={{ position: "absolute", left: 4 }}>{minDate}</span>
                    <span style={{ position: "absolute", right: 4 }}>{maxDate}</span>
                  </div>
                </div>
                {phases.map(p => {
                  const pStartMs = new Date(p.startDate + "T00:00:00").getTime();
                  const pEndMs = new Date(p.endDate + "T23:59:59").getTime();
                  const leftPct = ((pStartMs - startMs) / rangeMs) * 100;
                  const widthPct = Math.max(2, ((pEndMs - pStartMs) / rangeMs) * 100);
                  return (
                    <div key={p.id} style={{ display: "flex", borderBottom: "1px solid #f0f0f0", minHeight: 40, alignItems: "center" }}>
                      <div style={{ width: 160, minWidth: 160, padding: "6px 12px", borderRight: "1px solid #e8e8e8", display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.name}</span>
                        <button className="btn btn-ghost" style={{ padding: 2, fontSize: 10 }} onClick={() => { setEditPhase(p); setPhaseForm({ name: p.name, startDate: p.startDate, endDate: p.endDate, color: p.color, progress: p.progress }); setShowPhaseForm(true); }}>✏️</button>
                        <button className="btn btn-ghost" style={{ padding: 2, fontSize: 10, color: "#c00" }} onClick={() => deletePhase(p.id)}>🗑</button>
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 24, margin: "0 8px" }}>
                        {todayPct > 0 && todayPct < 100 && <div style={{ position: "absolute", left: `${todayPct}%`, top: -2, bottom: -2, width: 2, background: "#ef4444", zIndex: 2, borderRadius: 1 }} />}
                        <div style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: "100%", background: p.color + "25", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${p.progress}%`, height: "100%", background: p.color, borderRadius: 4, transition: "width 0.3s" }} />
                        </div>
                        <div style={{ position: "absolute", left: `${leftPct + widthPct + 1}%`, top: 3, fontSize: 10, color: "#888", whiteSpace: "nowrap" }}>{p.progress}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {/* ── Tasks Tab ── */}
          {tab === "tasks" && (() => {
            const tasks = job.tasks || [];
            const done = tasks.filter(t => t.done).length;
            const todayStr = new Date().toISOString().slice(0,10);

            const toggleTask = (taskId) => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: (j.tasks || []).map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : j));
            };
            const addTask = () => {
              if (!taskForm.text.trim()) return;
              const task = { id: Date.now(), text: taskForm.text, done: false, dueDate: taskForm.dueDate, assignedTo: taskForm.assignedTo, createdAt: new Date().toISOString() };
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: [...(j.tasks || []), task], activityLog: addLog(j.activityLog, `Added task "${task.text}"`) } : j));
              setTaskForm({ text: "", dueDate: "", assignedTo: "" });
              setShowTaskForm(false);
            };
            const deleteTask = (taskId) => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: (j.tasks || []).filter(t => t.id !== taskId) } : j));
            };
            const copyFromGantt = () => {
              const phases = job.phases || [];
              if (phases.length === 0) return;
              const existingTexts = new Set((job.tasks || []).map(t => t.text));
              const newTasks = phases.filter(p => !existingTexts.has(p.name)).map(p => ({
                id: Date.now() + Math.random(), text: p.name, done: p.progress >= 100, dueDate: p.endDate, assignedTo: "", createdAt: new Date().toISOString()
              }));
              if (newTasks.length === 0) return;
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: [...(j.tasks || []), ...newTasks], activityLog: addLog(j.activityLog, `Copied ${newTasks.length} tasks from Gantt phases`) } : j));
            };

            return (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                {tasks.length > 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{done} of {tasks.length} complete</span>
                    <div style={{ flex: 1, maxWidth: 200, height: 6, background: "#e8e8e8", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${tasks.length > 0 ? (done / tasks.length) * 100 : 0}%`, height: "100%", background: done === tasks.length ? "#059669" : jobAccent, borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}
                {!tasks.length && <div style={{ flex: 1 }} />}
                {(job.phases || []).length > 0 && <button className="btn btn-ghost btn-sm" onClick={copyFromGantt}>📋 Copy from Gantt</button>}
                <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => setShowTaskForm(true)}>+ Add Task</button>
              </div>

              {showTaskForm && (
                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16 }}>
                  <input className="form-control" value={taskForm.text} onChange={e => setTaskForm(f => ({ ...f, text: e.target.value }))} placeholder="Task description…" style={{ marginBottom: 10 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Due Date</label><input type="date" className="form-control" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Assigned To</label>
                      <select className="form-control" value={taskForm.assignedTo} onChange={e => setTaskForm(f => ({ ...f, assignedTo: e.target.value }))}>
                        <option value="">Unassigned</option>
                        {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowTaskForm(false)}>Cancel</button>
                    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={addTask} disabled={!taskForm.text.trim()}>Add Task</button>
                  </div>
                </div>
              )}

              {tasks.length === 0 && !showTaskForm && (
                <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">No tasks yet</div></div>
              )}

              {tasks.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {tasks.map(task => {
                    const isOverdue = !task.done && task.dueDate && task.dueDate < todayStr;
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: task.done ? "#f9fafb" : "#fff", border: "1px solid #e8e8e8", borderRadius: 8, borderLeft: `3px solid ${task.done ? "#059669" : isOverdue ? "#dc2626" : jobAccent}` }}>
                        <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} style={{ width: 18, height: 18, cursor: "pointer", accentColor: jobAccent }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, textDecoration: task.done ? "line-through" : "none", color: task.done ? "#999" : "#333" }}>{task.text}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 11, color: "#888" }}>
                            {task.dueDate && <span style={{ color: isOverdue ? "#dc2626" : "#888", fontWeight: isOverdue ? 700 : 400 }}>{isOverdue ? "⚠️ " : ""}{task.dueDate}</span>}
                            {task.assignedTo && <span>· {task.assignedTo}</span>}
                          </div>
                        </div>
                        <button className="btn btn-ghost" style={{ padding: 4, color: "#ccc", fontSize: 12 }} onClick={() => deleteTask(task.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })()}

          {tab === "notes" && (
            <div>
              {/* Toolbar */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <select value={noteFilter} onChange={e => setNoteFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", background: "#fff" }}>
                  <option value="all">All Categories</option>
                  {NOTE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <div style={{ position: "relative" }}>
                  <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} onClick={() => setShowFormMenu(m => !m)}>
                    📋 New Form ▾
                  </button>
                  {showFormMenu && (
                    <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 20, minWidth: 180, overflow: "hidden" }}>
                      {FORM_TEMPLATES.map(tmpl => (
                        <button key={tmpl.id} style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", textAlign: "left", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                          onMouseEnter={e => e.target.style.background = "#f8fafc"}
                          onMouseLeave={e => e.target.style.background = "none"}
                          onClick={() => { setShowFormMenu(false); setShowFormFiller(tmpl); }}>
                          {tmpl.icon} {tmpl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none" }} onClick={() => setShowPlanDrawing(true)}>
                  📐 Draw Plan
                </button>
                <button className="btn btn-sm" style={{ background: "#7c3aed", color: "#fff", border: "none" }} onClick={() => pdfInputRef.current?.click()}>
                  📄 Fill PDF
                </button>
                <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handlePdfFileSelect} />
                <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => setShowNoteForm(true)}>
                  + Add Note
                </button>
              </div>

              {/* New note form */}
              {showNoteForm && (
                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16 }}>
                  <textarea value={noteForm.text} onChange={e => setNoteForm(prev => ({ ...prev, text: e.target.value }))} placeholder="Write a note…" rows={3} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                  {/* Category pills */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {NOTE_CATEGORIES.map(c => (
                      <button key={c.id} onClick={() => setNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: noteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: noteForm.category === c.id ? c.color + "18" : "#fff", color: noteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                    ))}
                  </div>
                  {/* File attachments */}
                  <div style={{ marginTop: 12 }}>
                    {noteForm.attachments.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        {noteForm.attachments.map(f => (
                          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                            {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155" }}>{f.name}</span>
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>{fmtFileSize(f.size)}</span>
                            {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "new", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
                            <button onClick={() => setNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} style={{ padding: 2, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
                      <OrderIcon name="upload" size={14} />
                      Attach photos / files
                      <input type="file" multiple style={{ display: "none" }} onChange={handleNoteFiles} accept="*/*" />
                    </label>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowNoteForm(false); setNoteForm({ text: "", category: "general", attachments: [] }); }}>Cancel</button>
                    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={addNote} disabled={!noteForm.text.trim() && noteForm.attachments.length === 0}>Save Note</button>
                  </div>
                </div>
              )}

              {/* Notes list */}
              {(() => {
                const filtered = [...jobNotes].filter(n => noteFilter === "all" || n.category === noteFilter).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                if (filtered.length === 0) return (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{jobNotes.length === 0 ? "No notes yet" : "No notes match this filter"}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Note" to get started</div>
                  </div>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {filtered.map(note => {
                      const cat = NOTE_CATEGORIES.find(c => c.id === note.category) || NOTE_CATEGORIES[0];
                      const isEditing = editingNoteId === note.id;
                      if (isEditing) {
                        const eCat = NOTE_CATEGORIES.find(c => c.id === editNoteForm.category) || NOTE_CATEGORIES[0];
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#f8fafc", borderRadius: 10, border: `2px solid ${eCat.color}`, borderLeft: `3px solid ${eCat.color}` }}>
                            <textarea value={editNoteForm.text} onChange={e => setEditNoteForm(prev => ({ ...prev, text: e.target.value }))} rows={3} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                              {NOTE_CATEGORIES.map(c => (
                                <button key={c.id} onClick={() => setEditNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: editNoteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: editNoteForm.category === c.id ? c.color + "18" : "#fff", color: editNoteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                              ))}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              {editNoteForm.attachments.length > 0 && (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                                  {editNoteForm.attachments.map(f => (
                                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                                      {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                                      <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155" }}>{f.name}</span>
                                      {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "edit", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
                                      <button onClick={() => setEditNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} style={{ padding: 2, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
                                <OrderIcon name="upload" size={14} />
                                Attach photos / files
                                <input type="file" multiple style={{ display: "none" }} onChange={handleEditNoteFiles} accept="*/*" />
                              </label>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                              <button className="btn btn-ghost btn-sm" onClick={cancelEditNote}>Cancel</button>
                              <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveEditNote} disabled={!editNoteForm.text.trim() && editNoteForm.attachments.length === 0}>Save</button>
                            </div>
                          </div>
                        );
                      }
                      // ── PDF note card ──
                      if (note.pdfNote) {
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: "3px solid #7c3aed" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {note.pdfThumbnail && <img src={note.pdfThumbnail} alt="PDF" style={{ width: 48, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid #e2e8f0" }} />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <span style={{ padding: "2px 10px", borderRadius: 20, background: "#7c3aed18", color: "#7c3aed", fontSize: 11, fontWeight: 700 }}>PDF</span>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.attachments?.[0]?.name || "Filled PDF"}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()} · {note.createdBy}</div>
                              </div>
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); reopenPdfNote(note); }} style={{ fontSize: 11 }}>✏️ Edit</button>
                              {note.attachments?.[0]?.dataUrl && (
                                <a href={note.attachments[0].dataUrl} download={note.attachments[0].name} onClick={e => e.stopPropagation()} style={{ padding: "4px 10px", borderRadius: 6, background: "#f1f5f9", border: "none", color: "#3b82f6", fontSize: 11, fontWeight: 600, textDecoration: "none", cursor: "pointer" }}>⬇ Download</a>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete">🗑</button>
                            </div>
                          </div>
                        );
                      }
                      // ── Form note card ──
                      if (note.category === "form" && note.formType) {
                        const tmpl = FORM_TEMPLATES.find(t => t.id === note.formType);
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: `3px solid ${cat.color}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 16 }}>{tmpl?.icon || "📋"}</span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{tmpl?.name || note.formType}</span>
                              <span style={{ padding: "2px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 11, fontWeight: 700 }}>Form</span>
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()}</span>
                              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{note.createdBy}</span>
                              <div style={{ flex: 1 }} />
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); setViewingForm(note); }} style={{ fontSize: 11 }}>👁 View</button>
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); printFormPdf(note, tmpl); }} style={{ fontSize: 11 }}>🖨️ PDF</button>
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete">🗑</button>
                            </div>
                            {note.text && <div style={{ fontSize: 12, color: "#666" }}>{note.text}</div>}
                          </div>
                        );
                      }
                      // ── Regular note card ──
                      return (
                        <div key={note.id} onClick={() => startEditNote(note)} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: `3px solid ${cat.color}`, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ padding: "2px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 11, fontWeight: 700 }}>{cat.label}</span>
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()}</span>
                            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{note.createdBy}</span>
                            <div style={{ flex: 1 }} />
                            <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete note">🗑</button>
                          </div>
                          {note.text && <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note.text}</div>}
                          {note.attachments && note.attachments.length > 0 && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                              {note.attachments.map(att => (
                                att.type && att.type.startsWith("image/") && att.dataUrl ? (
                                  <div key={att.id} style={{ position: "relative", display: "inline-block" }} onClick={e => e.stopPropagation()}>
                                    <img src={att.dataUrl} alt={att.name} onClick={() => setLightboxImg(att.dataUrl)} style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #e2e8f0", cursor: "pointer" }} />
                                    <button onClick={() => setMarkupImg({ src: att.dataUrl, noteId: note.id, attachmentId: att.id })}
                                      style={{ position: "absolute", bottom: 2, right: 2, width: 20, height: 20, borderRadius: 4, background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                      title="Mark up photo">✏️</button>
                                  </div>
                                ) : (
                                  <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}>
                                    <FileIconBadge name={att.name} />
                                    <span style={{ color: "#334155", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                                  </div>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {tab === "activity" && (
            <div>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#888" }}>{(job.activityLog||[]).length} event{(job.activityLog||[]).length !== 1 ? "s" : ""} recorded</div>
              </div>
              <ActivityLog entries={job.activityLog || []} />
            </div>
          )}

        </div>
        )}
    </SectionDrawer>

    {/* ── Image Lightbox ────────────────────────────────────────────── */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <img src={lightboxImg} alt="Attachment" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} />
        <button onClick={(e) => { e.stopPropagation(); setMarkupImg({ src: lightboxImg, target: "new" }); setLightboxImg(null); }}
          style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 8, background: "#0891b2", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
    )}

    {/* ── Photo Markup Editor ──────────────────────────────────────── */}
    {markupImg && (
      <PhotoMarkupEditor
        imageSrc={markupImg.src}
        onSave={saveMarkup}
        onClose={() => setMarkupImg(null)}
      />
    )}

    {/* ── Plan Drawing Editor ────────────────────────────────────────── */}
    {showPlanDrawing && (
      <PlanDrawingEditor
        onSave={savePlan}
        onClose={() => setShowPlanDrawing(false)}
      />
    )}

    {/* ── PDF Form Filler ────────────────────────────────────────────── */}
    {showPdfFiller && (
      <PdfFormFiller
        pdfData={showPdfFiller.pdfData}
        fileName={showPdfFiller.fileName}
        existingFields={showPdfFiller.existingFields}
        onSave={handlePdfSave}
        onClose={() => setShowPdfFiller(null)}
      />
    )}

    {/* ── Form Filler Modal ──────────────────────────────────────────── */}
    {showFormFiller && (() => {
      const tmpl = showFormFiller;
      const client = clients.find(c => c.id === job.clientId);
      const site = client?.sites?.find(s => s.id === job.siteId);
      return <FormFillerModal template={tmpl} job={job} client={client} site={site}
        onSave={(formData, andPrint) => {
          const note = { id: Date.now(), text: `${tmpl.name} completed`, category: "form", formType: tmpl.id, formData, attachments: [], createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
          setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Completed ${tmpl.name} form`) } : j));
          setShowFormFiller(null);
          if (andPrint) printFormPdf(note, tmpl);
        }}
        onClose={() => setShowFormFiller(null)}
      />;
    })()}

    {/* ── Form Viewer Modal ──────────────────────────────────────────── */}
    {viewingForm && (() => {
      const tmpl = FORM_TEMPLATES.find(t => t.id === viewingForm.formType);
      const data = viewingForm.formData || {};
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setViewingForm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>{tmpl?.icon}</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{tmpl?.name || "Form"}</h3>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => { printFormPdf(viewingForm, tmpl); }}>🖨️ Print PDF</button>
              <button onClick={() => setViewingForm(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>Completed {new Date(viewingForm.createdAt).toLocaleString()} by {viewingForm.createdBy}</div>
            {(tmpl?.fields || []).map(field => {
              const val = data[field.key];
              return (
                <div key={field.key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{field.label}</div>
                  {field.type === "checklist" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(field.options || []).map((opt, i) => (
                        <div key={i} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ color: (val || []).includes(opt) ? "#059669" : "#dc2626", fontWeight: 700 }}>{(val || []).includes(opt) ? "✓" : "✗"}</span>
                          <span style={{ color: (val || []).includes(opt) ? "#333" : "#999" }}>{opt}</span>
                        </div>
                      ))}
                    </div>
                  ) : field.type === "signature" ? (
                    val ? <img src={val} alt="Signature" style={{ maxWidth: 300, height: 80, border: "1px solid #e2e8f0", borderRadius: 6 }} /> : <span style={{ fontSize: 13, color: "#999" }}>No signature</span>
                  ) : (
                    <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{val || "—"}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}

    {/* ── Inline Quote Drawer ─────────────────────────────────────────── */}
    {editingQuote && (() => {
      const qTotal = calcQuoteTotal(editingQuote);
      const qSub = (editingQuote.lineItems||[]).reduce((s,li) => s + (li.qty||0)*(li.rate||0), 0);
      const qGst = qSub * ((editingQuote.tax||0)/100);
      const qAccent = SECTION_COLORS.quotes.accent;
      return (
      <SectionDrawer
        accent={qAccent}
        icon={<Icon name="quotes" size={16} />}
        typeLabel="Quote"
        title={editingQuote.number || "New Quote"}
        statusBadge={<StatusBadge status={editingQuote.status} />}
        mode={inlineQuoteMode} setMode={setInlineQuoteMode}
        showToggle={true}
        statusStrip={inlineQuoteMode === "edit" ?
          <div style={{ padding: "8px 20px", background: SECTION_COLORS.quotes.light, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
            {["draft","sent","accepted","declined"].filter(s => s !== editingQuote.status).map(s => (
              <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8 }}
                onClick={() => setEditingQuote(q => ({ ...q, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineQuoteMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingQuote(null)}>Close</button>
          <button className="btn btn-sm" style={{ background: qAccent, color: "#fff", border: "none" }} onClick={() => setInlineQuoteMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineQuoteMode("view")}>Cancel</button>
          <button className="btn btn-sm" style={{ background: qAccent, color: "#fff", border: "none" }} onClick={() => saveQuote(editingQuote)}>
            <Icon name="check" size={13} /> Save Quote
          </button>
        </>}
        onClose={() => setEditingQuote(null)}
        zIndex={1060}
      >
        {inlineQuoteMode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <ViewField label="Status" value={editingQuote.status?.charAt(0).toUpperCase() + editingQuote.status?.slice(1)} />
            <ViewField label="GST" value={`${editingQuote.tax}%`} />
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
                {(editingQuote.lineItems||[]).map((li, i) => (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(qSub)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({editingQuote.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(qGst)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: qAccent }}>{fmt(qTotal)}</span></div>
          </div>
          {editingQuote.notes && <ViewField label="Notes / Terms" value={editingQuote.notes} />}
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={editingQuote.status}
                onChange={e => setEditingQuote(q => ({ ...q, status: e.target.value }))}>
                {["draft","sent","accepted","declined"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">GST %</label>
              <input type="number" className="form-control" value={editingQuote.tax}
                onChange={e => setEditingQuote(q => ({ ...q, tax: parseFloat(e.target.value)||0 }))} min="0" max="100" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Line Items</label>
            <LineItemsEditor items={editingQuote.lineItems}
              onChange={items => setEditingQuote(q => ({ ...q, lineItems: items }))} />
          </div>
          <div style={{ marginTop: 12, padding: "12px 16px", background: "#f8f8f8", borderRadius: 8, display: "flex", justifyContent: "flex-end", gap: 16 }}>
            <span style={{ fontSize: 12, color: "#888" }}>Subtotal <strong>{fmt(qSub)}</strong></span>
            <span style={{ fontSize: 12, color: "#888" }}>GST <strong>{fmt(qGst)}</strong></span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total {fmt(qTotal)}</span>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Notes / Terms</label>
            <textarea className="form-control" value={editingQuote.notes||""}
              onChange={e => setEditingQuote(q => ({ ...q, notes: e.target.value }))}
              placeholder="Payment terms, inclusions/exclusions, validity period…" />
          </div>
        </div>
        )}
      </SectionDrawer>
      );
    })()}

    {/* ── Inline Invoice Drawer ───────────────────────────────────────── */}
    {editingInvoice && (() => {
      const iSub = (editingInvoice.lineItems||[]).reduce((s,li) => s + (li.qty||0)*(li.rate||0), 0);
      const iGst = iSub * ((editingInvoice.tax||0)/100);
      const iTotal = iSub + iGst;
      const iAccent = SECTION_COLORS.invoices.accent;
      return (
      <SectionDrawer
        accent={iAccent}
        icon={<Icon name="invoices" size={16} />}
        typeLabel="Invoice"
        title={editingInvoice.number || "New Invoice"}
        statusBadge={<StatusBadge status={editingInvoice.status} />}
        mode={inlineInvMode} setMode={setInlineInvMode}
        showToggle={true}
        statusStrip={inlineInvMode === "edit" ?
          <div style={{ padding: "8px 20px", background: SECTION_COLORS.invoices.light, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
            {["draft","sent","paid","overdue","void"].filter(s => s !== editingInvoice.status).map(s => (
              <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8 }}
                onClick={() => setEditingInvoice(i => ({ ...i, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineInvMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingInvoice(null)}>Close</button>
          <button className="btn btn-sm" style={{ background: iAccent, color: "#fff", border: "none" }} onClick={() => setInlineInvMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineInvMode("view")}>Cancel</button>
          <button className="btn btn-sm" style={{ background: iAccent, color: "#fff", border: "none" }} onClick={() => saveInvoice(editingInvoice)}>
            <Icon name="check" size={13} /> Save Invoice
          </button>
        </>}
        onClose={() => setEditingInvoice(null)}
        zIndex={1060}
      >
        {inlineInvMode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <ViewField label="Status" value={editingInvoice.status?.charAt(0).toUpperCase() + editingInvoice.status?.slice(1)} />
            <ViewField label="Due Date" value={editingInvoice.dueDate || "—"} />
            <ViewField label="GST" value={`${editingInvoice.tax}%`} />
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
                {(editingInvoice.lineItems||[]).map((li, i) => (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({editingInvoice.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(iGst)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: iAccent }}>{fmt(iTotal)}</span></div>
          </div>
          {editingInvoice.notes && <ViewField label="Notes" value={editingInvoice.notes} />}
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={editingInvoice.status}
                onChange={e => setEditingInvoice(i => ({ ...i, status: e.target.value }))}>
                {["draft","sent","paid","overdue","void"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input type="date" className="form-control" value={editingInvoice.dueDate||""}
                onChange={e => setEditingInvoice(i => ({ ...i, dueDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">GST %</label>
              <input type="number" className="form-control" value={editingInvoice.tax}
                onChange={e => setEditingInvoice(i => ({ ...i, tax: parseFloat(e.target.value)||0 }))} min="0" max="100" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Line Items</label>
            <LineItemsEditor items={editingInvoice.lineItems}
              onChange={items => setEditingInvoice(i => ({ ...i, lineItems: items }))} />
          </div>
          <div style={{ marginTop: 12, padding: "12px 16px", background: "#f8f8f8", borderRadius: 8, display: "flex", justifyContent: "flex-end", gap: 16 }}>
            <span style={{ fontSize: 12, color: "#888" }}>Subtotal <strong>{fmt(iSub)}</strong></span>
            <span style={{ fontSize: 12, color: "#888" }}>GST <strong>{fmt(iGst)}</strong></span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total {fmt(iTotal)}</span>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Notes</label>
            <textarea className="form-control" value={editingInvoice.notes||""}
              onChange={e => setEditingInvoice(i => ({ ...i, notes: e.target.value }))}
              placeholder="Payment instructions, bank details, thank you note…" />
          </div>
        </div>
        )}
      </SectionDrawer>
      );
    })()}

    {/* ── Inline Bill Capture / Edit Modal ───────────────────────────────── */}
    {editingBill !== null && (
      <BillModal
        bill={editingBill?.id ? editingBill : null}
        jobs={jobs || []}
        onSave={saveBillFromJob}
        onClose={() => setEditingBill(null)}
        defaultJobId={job.id}
      />
    )}
    </>
  );
};

// ── Jobs ──────────────────────────────────────────────────────────────────────
const Jobs = ({ jobs, setJobs, clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders }) => {
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
          clients={clients}
          quotes={quotes} setQuotes={setQuotes}
          invoices={invoices} setInvoices={setInvoices}
          timeEntries={timeEntries} setTimeEntries={setTimeEntries}
          bills={bills} setBills={setBills}
          schedule={schedule} setSchedule={setSchedule}
          jobs={jobs} setJobs={setJobs}
          staff={staff}
          workOrders={workOrders} setWorkOrders={setWorkOrders}
          purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders}
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
const Clients = ({ clients, setClients, jobs, templates = [] }) => {
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
const Contractors = ({ contractors, setContractors, workOrders, bills }) => {
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
const Suppliers = ({ suppliers, setSuppliers, purchaseOrders, bills }) => {
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
const FormFillerModal = ({ template, job, client, site, onSave, onClose }) => {
  const canvasRef = useRef(null);
  const [formData, setFormData] = useState(() => {
    const defaults = {};
    template.fields.forEach(f => {
      if (f.type === "checklist") defaults[f.key] = [];
      else if (f.type === "date") defaults[f.key] = new Date().toISOString().slice(0, 10);
      else if (f.type === "time") defaults[f.key] = "";
      else if (f.key === "jobDescription" || f.key === "workPerformed") defaults[f.key] = job?.description || "";
      else if (f.key === "location" || f.key === "site") defaults[f.key] = site?.name || site?.address || "";
      else if (f.key === "client") defaults[f.key] = client?.name || "";
      else if (f.key === "supervisor" || f.key === "technician" || f.key === "worker") defaults[f.key] = (job?.assignedTo || [])[0] || "";
      else defaults[f.key] = "";
    });
    return defaults;
  });
  const [sigField, setSigField] = useState(null);
  const [drawing, setDrawing] = useState(false);

  const startDraw = (e) => {
    setDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };
  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    if (sigField && canvasRef.current) {
      setFormData(d => ({ ...d, [sigField]: canvasRef.current.toDataURL() }));
    }
  };
  const clearSig = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (sigField) setFormData(d => ({ ...d, [sigField]: "" }));
    }
  };

  const toggleChecklist = (key, opt) => {
    setFormData(d => {
      const arr = d[key] || [];
      return { ...d, [key]: arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt] };
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 20 }}>{template.icon}</span>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{template.name}</h3>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {template.fields.map(field => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4, display: "block" }}>{field.label}</label>
            {field.type === "text" && (
              <input className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "date" && (
              <input type="date" className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "time" && (
              <input type="time" className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "textarea" && (
              <textarea className="form-control" rows={3} value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} style={{ resize: "vertical", fontFamily: "inherit" }} />
            )}
            {field.type === "checklist" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {(field.options || []).map((opt, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
                    <input type="checkbox" checked={(formData[field.key] || []).includes(opt)} onChange={() => toggleChecklist(field.key, opt)} style={{ width: 16, height: 16, accentColor: "#2563eb" }} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {field.type === "signature" && (
              <div>
                {formData[field.key] && sigField !== field.key ? (
                  <div>
                    <img src={formData[field.key]} alt="Signature" style={{ maxWidth: 300, height: 80, border: "1px solid #e2e8f0", borderRadius: 6, marginBottom: 4 }} />
                    <button className="btn btn-ghost btn-xs" onClick={() => { setSigField(field.key); setFormData(d => ({ ...d, [field.key]: "" })); }}>Re-sign</button>
                  </div>
                ) : (
                  <div>
                    <canvas ref={sigField === field.key ? canvasRef : undefined} width={400} height={120}
                      style={{ border: "2px solid #e2e8f0", borderRadius: 8, cursor: "crosshair", touchAction: "none", display: "block", background: "#fafafa" }}
                      onMouseDown={e => { setSigField(field.key); startDraw(e); }}
                      onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                      onTouchStart={e => { setSigField(field.key); startDraw(e); }}
                      onTouchMove={draw} onTouchEnd={endDraw}
                      onClick={() => setSigField(field.key)}
                    />
                    <button className="btn btn-ghost btn-xs" style={{ marginTop: 4 }} onClick={clearSig}>Clear</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} onClick={() => onSave(formData, false)}>Save to Notes</button>
          <button className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none" }} onClick={() => onSave(formData, true)}>Save & Print PDF</button>
        </div>
      </div>
    </div>
  );
};

// ── Schedule ──────────────────────────────────────────────────────────────────
const Schedule = ({ schedule, setSchedule, futureSchedule, setFutureSchedule, jobs, clients, staff }) => {
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
const Quotes = ({ quotes, setQuotes, jobs, clients, invoices }) => {
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
      await sendEmail("quote", client.email, { ...q, clientName: client.name, jobTitle: job?.title, jobReference: job?.title });
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

function calcHoursFromTimes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return Math.round(diff / 60 * 10) / 10;
}

function addMinsToTime(timeStr, mins) {
  const [h, m] = (timeStr || "09:00").split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`;
}

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
const TimeTracking = ({ timeEntries, setTimeEntries, jobs, setJobs, clients, staff }) => {
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

const BILL_STATUSES = ["inbox", "linked", "approved", "posted"];
const BILL_STATUS_LABELS = { inbox: "Inbox", linked: "Linked", approved: "Approved", posted: "Posted to Job" };
const BILL_STATUS_COLORS = {
  inbox:    { bg: "#f5f5f5", text: "#777" },
  linked:   { bg: "#e8f0fe", text: "#2c5fa8" },
  approved: { bg: "#e6f4ea", text: "#1e7e34" },
  posted:   { bg: "#111",    text: "#fff" },
};
const BILL_CATEGORIES = ["Materials", "Subcontractor", "Plant & Equipment", "Labour", "Other"];

const BillStatusBadge = ({ status }) => {
  const c = BILL_STATUS_COLORS[status] || { bg: "#f0f0f0", text: "#666" };
  return (
    <span className="badge" style={{ background: c.bg, color: c.text }}>
      {BILL_STATUS_LABELS[status] || status}
    </span>
  );
};

// ── Capture / Edit Bill Modal ──────────────────────────────────────────────────
const BillModal = ({ bill, jobs, onSave, onClose, defaultJobId }) => {
  const blank = {
    supplier: "", invoiceNo: "", date: new Date().toISOString().slice(0,10),
    amount: "", hasGst: true, markup: 0,
    jobId: defaultJobId || null, category: "Materials", description: "", notes: "", status: "inbox",
    capturedAt: new Date().toISOString().slice(0,10),
  };
  const isNew = !bill;
  const [form, setForm] = useState(bill ? { ...bill } : blank);
  const [mode, setMode] = useState(isNew ? "edit" : "view");
  const [imagePreview, setImagePreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extracted, setExtracted] = useState(false);
  const [lineItems, setLineItems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const exGst = form.hasGst ? (parseFloat(form.amount) || 0) / 1.1 : (parseFloat(form.amount) || 0);
  const gst   = form.hasGst ? (parseFloat(form.amount) || 0) - exGst : 0;
  const withMarkup = exGst * (1 + (parseFloat(form.markup) || 0) / 100);

  const handleFile = async (file) => {
    if (!file) return;
    setExtractError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setExtracting(true);
      try {
        const data = await extractBillFromImage(base64, mimeType);
        if (data) {
          setForm(f => ({
            ...f,
            supplier: data.supplier || f.supplier,
            invoiceNo: data.invoiceNo || f.invoiceNo,
            date: data.date || f.date,
            amount: data.amount != null ? data.amount : f.amount,
            hasGst: data.hasGst != null ? data.hasGst : f.hasGst,
            category: data.category || f.category,
            description: data.description || f.description,
            notes: data.notes || f.notes,
          }));
          if (Array.isArray(data.lineItems) && data.lineItems.length > 0) {
            setLineItems(data.lineItems);
          }
          setExtracted(true);
        } else {
          setExtractError("AI extraction not available — fill in manually.");
        }
      } catch (err) {
        setExtractError(err.message || "Extraction failed — fill in manually.");
      } finally {
        setExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

  const handleSave = () => {
    const amt = parseFloat(form.amount) || 0;
    const exG = form.hasGst ? amt / 1.1 : amt;
    onSave({
      ...form,
      ...(bill?.id ? { id: bill.id } : {}),
      amount: amt,
      amountExGst: parseFloat(exG.toFixed(2)),
      gstAmount: parseFloat((amt - exG).toFixed(2)),
      jobId: form.jobId || null,
      markup: parseFloat(form.markup) || 0,
      capturedAt: bill?.capturedAt || new Date().toISOString().slice(0,10),
      status: form.jobId && form.status === "inbox" ? "linked" : form.status,
    });
  };

  const handleSaveAndView = () => { handleSave(); setMode("view"); };
  const linkedJob = jobs.find(j => String(j.id) === String(form.jobId));

  return (
    <SectionDrawer
      accent={SECTION_COLORS.bills.accent}
      icon={<Icon name="bills" size={16} />}
      typeLabel="Bill"
      title={bill ? (bill.invoiceNo || bill.supplier || "Edit Bill") : "Capture Receipt"}
      statusBadge={bill ? <StatusBadge status={form.status} /> : null}
      mode={mode} setMode={setMode}
      showToggle={!isNew}
      isNew={isNew}
      footer={mode === "view" ? <>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.bills.accent, color: "#fff", border: "none" }} onClick={() => setMode("edit")}>
          <Icon name="edit" size={13} /> Edit
        </button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => bill ? setMode("view") : onClose()}>{bill ? "Cancel" : "Cancel"}</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.bills.accent, color: "#fff", border: "none" }} onClick={isNew ? handleSave : handleSaveAndView} disabled={!form.supplier || !form.amount}>
          <Icon name="check" size={13} /> {isNew ? "Capture Bill" : "Save Changes"}
        </button>
      </>}
      onClose={onClose}
      zIndex={1060}
    >
      {mode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Supplier Details</div>
          <div className="grid-2">
            <ViewField label="Supplier" value={form.supplier} />
            <ViewField label="Invoice / Receipt #" value={form.invoiceNo} />
          </div>
          <div className="grid-2">
            <ViewField label="Date" value={form.date} />
            <ViewField label="Category" value={form.category} />
          </div>
          <ViewField label="Description" value={form.description} />

          <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Amount & Tax</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: SECTION_COLORS.bills.accent, marginBottom: 8 }}>{fmt(parseFloat(form.amount) || 0)}</div>
            {parseFloat(form.amount) > 0 && (
              <div style={{ background: SECTION_COLORS.bills.light, borderRadius: 8, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: "#999" }}>Ex-GST </span><strong>{fmt(exGst)}</strong></div>
                <div><span style={{ color: "#999" }}>GST </span><strong>{fmt(gst)}</strong></div>
                <div style={{ marginLeft: "auto" }}><span style={{ color: "#999" }}>Total </span><strong>{fmt(parseFloat(form.amount)||0)}</strong></div>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Job Allocation</div>
            <ViewField label="Linked Job" value={linkedJob?.title || "Unallocated"} />
            {parseFloat(form.markup) > 0 && <ViewField label="Markup" value={`${form.markup}% → ${fmt(withMarkup)} ex-GST`} />}
          </div>

          {form.notes && (
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
              <ViewField label="Internal Notes" value={form.notes} />
            </div>
          )}
        </div>
      ) : (
      <div style={{ padding: "20px 24px" }}>

          {/* AI Image Upload — only for new bills */}
          {isNew && (
            <div style={{ marginBottom: 20 }}>
              {!imagePreview ? (
                <div
                  className={`bill-upload-zone${dragging ? " dragging" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={e => handleFile(e.target.files?.[0])}
                  />
                  <Icon name="camera" size={28} />
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>Upload receipt or invoice</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Take a photo or drag & drop an image — AI will extract the details</div>
                </div>
              ) : (
                <div className="bill-preview-wrap">
                  <img src={imagePreview} alt="Receipt preview" className="bill-preview-img" />
                  <div className="bill-preview-info">
                    {extracting && (
                      <div className="bill-extracting">
                        <div className="bill-spinner" />
                        <span>Analysing receipt with AI...</span>
                      </div>
                    )}
                    {extracted && !extracting && (
                      <div style={{ color: "#1e7e34", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon name="check" size={14} /> Data extracted — review below
                      </div>
                    )}
                    {extractError && !extracting && (
                      <div style={{ color: "#c0392b", fontSize: 13 }}>{extractError}</div>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setImagePreview(null); setExtracted(false); setExtractError(null); setLineItems([]); }}>
                      Remove image
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extracted Line Items */}
          {lineItems.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 8 }}>Extracted Line Items</div>
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th style={{ width: "50%" }}>Item</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td style={{ textAlign: "right" }}>{item.qty ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{item.unitPrice != null ? fmt(item.unitPrice) : "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{item.total != null ? fmt(item.total) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Supplier & Reference */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Supplier Details</div>
          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label className="form-label">Supplier Name *</label>
              <input className="form-control" value={form.supplier} onChange={e => setForm(f=>({...f, supplier: e.target.value}))} placeholder="e.g. Bunnings, ElecPro…" />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice / Receipt #</label>
              <input className="form-control" value={form.invoiceNo} onChange={e => setForm(f=>({...f, invoiceNo: e.target.value}))} placeholder="e.g. INV-1234" />
            </div>
          </div>
          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label className="form-label">Bill Date</label>
              <input type="date" className="form-control" value={form.date} onChange={e => setForm(f=>({...f, date: e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={e => setForm(f=>({...f, category: e.target.value}))}>
                {BILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" value={form.description} onChange={e => setForm(f=>({...f, description: e.target.value}))} placeholder="What was purchased / what work was performed…" />
          </div>

          {/* Amount & GST */}
          <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 16, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Amount & Tax</div>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label className="form-label">Total Amount (as on receipt)</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>$</span>
                  <input type="number" className="form-control" style={{ paddingLeft: 24 }} value={form.amount} onChange={e => setForm(f=>({...f, amount: e.target.value}))} placeholder="0.00" min="0" step="0.01" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">GST</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16, height: 40 }}>
                  <label className="checkbox-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    <input type="checkbox" checked={form.hasGst} onChange={e => setForm(f=>({...f, hasGst: e.target.checked}))} />
                    Includes GST (10%)
                  </label>
                </div>
              </div>
            </div>
            {/* GST breakdown */}
            {parseFloat(form.amount) > 0 && (
              <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: "#999" }}>Ex-GST </span><strong>{fmt(exGst)}</strong></div>
                <div><span style={{ color: "#999" }}>GST </span><strong>{fmt(gst)}</strong></div>
                <div style={{ marginLeft: "auto" }}><span style={{ color: "#999" }}>Total (inc.) </span><strong>{fmt(parseFloat(form.amount)||0)}</strong></div>
              </div>
            )}
          </div>

          {/* Link to job & markup */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Job Allocation & Markup</div>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label className="form-label">Link to Job</label>
                <select className="form-control" value={form.jobId || ""} onChange={e => setForm(f=>({...f, jobId: e.target.value || null}))}>
                  <option value="">— Unallocated (Inbox) —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Markup % (on-charge to client)</label>
                <div style={{ position: "relative" }}>
                  <input type="number" className="form-control" style={{ paddingRight: 32 }} value={form.markup} onChange={e => setForm(f=>({...f, markup: e.target.value}))} placeholder="0" min="0" max="200" />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>%</span>
                </div>
                {parseFloat(form.markup) > 0 && parseFloat(form.amount) > 0 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    On-charge: <strong style={{ color: "#111" }}>{fmt(withMarkup)}</strong> (ex-GST + {form.markup}%)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Internal Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f=>({...f, notes: e.target.value}))} placeholder="Any notes for approver, discrepancies, receipt condition…" style={{ minHeight: 60 }} />
            </div>
          </div>

      </div>
      )}
    </SectionDrawer>
  );
};

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
const Bills = ({ bills, setBills, jobs, setJobs, clients }) => {
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
const Invoices = ({ invoices, setInvoices, jobs, clients, quotes }) => {
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
      await sendEmail("invoice", client.email, { ...inv, clientName: client.name, jobTitle: job?.title });
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
const Actions = ({ jobs, quotes, invoices, bills, workOrders, purchaseOrders, contractors, reminders, onNav }) => {
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
const Reminders = ({ reminders, setReminders, jobs }) => {
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
const ActivityPage = ({ jobs, clients, quotes, invoices, bills, timeEntries, schedule }) => {
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

const DisplaySchedule = ({ schedule, jobs, clients }) => {
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

const DisplayOverview = ({ jobs, quotes, timeEntries, schedule, clients }) => {
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

// ── Xero Settings Tab (extracted as a proper component to follow Rules of Hooks) ──
const BILL_CATEGORIES = ["Materials", "Subcontractor", "Plant & Equipment", "Labour", "Other"];

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

const Settings = ({ staff = [], setStaff, templates = SEED_TEMPLATES, setTemplates, companyInfo, setCompanyInfo }) => {
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
  const [voiceSettings, setVoiceSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("fieldops_voice_settings");
      if (!saved) return DEFAULT_VOICE_SETTINGS;
      const parsed = JSON.parse(saved);
      // Migrate old localKnowledge key to generalKnowledge
      if (parsed.localKnowledge && !parsed.generalKnowledge) {
        parsed.generalKnowledge = parsed.localKnowledge;
        delete parsed.localKnowledge;
      }
      return { ...DEFAULT_VOICE_SETTINGS, ...parsed };
    } catch { return DEFAULT_VOICE_SETTINGS; }
  });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const updateVoice = (key, value) => {
    setVoiceSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const saveVoiceSettings = async () => {
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
  const [outboundSettings, setOutboundSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("fieldops_outbound_settings");
      return saved ? JSON.parse(saved) : {
        enabled: false, name: "Iris", voice: "sage",
        personality: "Professional and direct. Explain the urgent items clearly and ask if they can action them. Be respectful of their time.",
        greetingStyle: "Greet the person by name and explain you are calling from FieldOps about items that need their attention.",
        team: [
          { id: 1, name: "Tom Baker", phone: "+61400000001", role: "Site Manager", callEnabled: true },
          { id: 2, name: "Sarah Lee", phone: "+61400000002", role: "Project Manager", callEnabled: true },
        ],
        callRules: { minSeverity: "high", maxCallsPerDay: 3, callWindowStart: "07:00", callWindowEnd: "18:00" },
      };
    } catch { return { enabled: false, name: "Iris", voice: "sage", personality: "", greetingStyle: "", team: [], callRules: { minSeverity: "high", maxCallsPerDay: 3, callWindowStart: "07:00", callWindowEnd: "18:00" } }; }
  });
  const [outboundDirty, setOutboundDirty] = useState(false);
  const [outboundSaved, setOutboundSaved] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editTeamMember, setEditTeamMember] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: "", phone: "", role: "" });
  const [testCallStatus, setTestCallStatus] = useState(null);

  const updateOutbound = (key, value) => { setOutboundSettings(prev => ({ ...prev, [key]: value })); setOutboundDirty(true); setOutboundSaved(false); };
  const updateCallRule = (key, value) => { setOutboundSettings(prev => ({ ...prev, callRules: { ...prev.callRules, [key]: value } })); setOutboundDirty(true); setOutboundSaved(false); };
  const saveOutboundSettings = async () => {
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

  const OptionCard = ({ option, selected, onSelect }) => (
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
          background: selected ? "#fff" : "#fff", flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "#111" : "#333" }}>{option.label}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{option.desc}</div>
        </div>
      </div>
    </div>
  );

  const VoiceIntegration = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Voice Assistant</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Configure your Iris voice assistant — powered by OpenAI Realtime + Twilio</div>
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
            <OptionCard key={v.id} option={v} selected={voiceSettings.voice === v.id} onSelect={() => updateVoice("voice", v.id)} />
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
    const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", password: "" });
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState(null);
    const [inviteSuccess, setInviteSuccess] = useState(null);
    const [updateError, setUpdateError] = useState(null);
    const [permEditId, setPermEditId] = useState(null);
    const [permData, setPermData] = useState(null);

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
        setInviteSuccess(result.user);
        setInviteForm({ fullName: "", email: "", password: "" });
        if (setStaff) {
          setStaff(prev => [...prev, { id: result.user.id, name: result.user.fullName, email: result.user.email, active: true }]);
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
                    <div style={{ fontSize: 11, color: "#888" }}>{s.email}</div>
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
      {tab === "integrations" && <VoiceIntegration />}
      {tab === "outbound" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Outbound Call Assistant</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Configure AI-powered outbound calls to team members about urgent tasks</div>
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
const FilesPage = ({ jobs = [], bills = [], contractors = [], quotes = [], invoices = [], workOrders = [], purchaseOrders = [] }) => {
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
const CallLog = ({ callLog = [], onNav }) => {
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
const PdfFormFiller = ({ pdfData, fileName, onSave, onClose, existingFields }) => {
  const containerRef = useRef(null);
  const canvasRefs = useRef([]);
  const [pages, setPages] = useState([]);
  const [scale, setScale] = useState(1.2);
  const [tool, setTool] = useState("select"); // select | text | checkbox | signature | delete
  const [fields, setFields] = useState(existingFields || []);
  const [selectedField, setSelectedField] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [sigModal, setSigModal] = useState(null); // field id to assign signature to
  const sigCanvasRef = useRef(null);
  const sigPadRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fitWidth, setFitWidth] = useState(true);
  const pdfBytesRef = useRef(pdfData);
  const pdfLibRef = useRef(null); // { PDFDocument, rgb, StandardFonts }
  const sigPadClassRef = useRef(null); // SignaturePad constructor

  // Load PDF and detect existing form fields
  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;
    const load = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
        setPdfDoc(doc);
        const pgs = [];
        const detectedFields = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          pgs.push({ page, width: vp.width, height: vp.height });

          // Detect AcroForm fields on this page
          const annotations = await page.getAnnotations();
          for (const annot of annotations) {
            if (!annot.rect || annot.rect.length < 4) continue;
            const fieldType = annot.fieldType;
            const subtype = annot.subtype;
            if (subtype !== "Widget" && !fieldType) continue;

            // Convert PDF coords (bottom-left origin) to canvas coords (top-left origin)
            const [x1, y1, x2, y2] = annot.rect;
            const canvasX = x1;
            const canvasY = vp.height - y2;
            const canvasW = Math.max(20, x2 - x1);
            const canvasH = Math.max(16, y2 - y1);

            const id = genId();
            const fieldName = annot.fieldName || annot.alternativeText || "";
            const fieldValue = annot.fieldValue || annot.buttonValue || "";

            if (fieldType === "Tx" || (!fieldType && canvasW > 30 && canvasH >= 14 && canvasH <= 60)) {
              // Text field
              detectedFields.push({ id, type: "text", page: i - 1, x: canvasX, y: canvasY, width: canvasW, height: canvasH, value: typeof fieldValue === "string" ? fieldValue : "", label: fieldName, acroField: true });
            } else if (fieldType === "Btn") {
              if (annot.checkBox) {
                // Checkbox
                detectedFields.push({ id, type: "checkbox", page: i - 1, x: canvasX, y: canvasY, width: Math.min(canvasW, canvasH), height: Math.min(canvasW, canvasH), value: fieldValue === "Yes" || fieldValue === "On" || annot.exportValue === fieldValue, label: fieldName, acroField: true });
              } else if (annot.radioButton) {
                // Radio button — treat as checkbox
                detectedFields.push({ id, type: "checkbox", page: i - 1, x: canvasX, y: canvasY, width: Math.min(canvasW, canvasH), height: Math.min(canvasW, canvasH), value: false, label: fieldName, acroField: true });
              }
            } else if (fieldType === "Sig") {
              // Signature field
              detectedFields.push({ id, type: "signature", page: i - 1, x: canvasX, y: canvasY, width: canvasW, height: canvasH, value: "", label: fieldName, acroField: true });
            } else if (fieldType === "Ch") {
              // Choice/dropdown — treat as text
              detectedFields.push({ id, type: "text", page: i - 1, x: canvasX, y: canvasY, width: canvasW, height: canvasH, value: typeof fieldValue === "string" ? fieldValue : "", label: fieldName, acroField: true });
            }
          }
        }
        if (!cancelled) {
          setPages(pgs);
          // Only set detected fields if we don't already have existing fields and we found AcroForm fields
          if (detectedFields.length > 0 && (!existingFields || existingFields.length === 0)) {
            setFields(detectedFields);
            setTool("select"); // Switch to select mode so user can just click and fill
          }
        }
      } catch (err) {
        console.error("Failed to load PDF:", err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pdfData]);

  // Render pages to canvases
  useEffect(() => {
    if (pages.length === 0) return;
    pages.forEach((pg, idx) => {
      const canvas = canvasRefs.current[idx];
      if (!canvas) return;
      const vp = pg.page.getViewport({ scale });
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, vp.width, vp.height);
      pg.page.render({ canvasContext: ctx, viewport: vp });
    });
  }, [pages, scale]);

  // Fit to width
  useEffect(() => {
    if (!fitWidth || pages.length === 0 || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth - 48;
    const pageW = pages[0].width;
    if (pageW > 0) {
      setScale(containerW / pageW);
      setFitWidth(false);
    }
  }, [pages, fitWidth]);

  // Signature pad setup
  useEffect(() => {
    if (sigModal && sigCanvasRef.current && !sigPadRef.current) {
      const initSigPad = async () => {
        if (!sigPadClassRef.current) {
          const mod = await import("signature_pad");
          sigPadClassRef.current = mod.default;
        }
        if (sigCanvasRef.current && !sigPadRef.current) {
          sigPadRef.current = new sigPadClassRef.current(sigCanvasRef.current, {
            backgroundColor: "rgba(255,255,255,0)",
            penColor: "#000",
          });
        }
      };
      initSigPad();
    }
    if (!sigModal) {
      sigPadRef.current = null;
    }
  }, [sigModal]);

  const handlePageClick = (e, pageIdx) => {
    if (tool === "select" || tool === "delete") return;
    const canvas = canvasRefs.current[pageIdx];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const id = genId();
    if (tool === "text") {
      setFields(prev => [...prev, { id, type: "text", page: pageIdx, x, y, width: 180, height: 28, value: "" }]);
      setSelectedField(id);
    } else if (tool === "checkbox") {
      setFields(prev => [...prev, { id, type: "checkbox", page: pageIdx, x: x - 10, y: y - 10, width: 20, height: 20, value: false }]);
      setSelectedField(id);
    } else if (tool === "signature") {
      setFields(prev => [...prev, { id, type: "signature", page: pageIdx, x: x - 75, y: y - 25, width: 150, height: 50, value: "" }]);
      setSigModal(id);
      setSelectedField(id);
    }
  };

  const handleFieldMouseDown = (e, field) => {
    e.stopPropagation();
    if (tool === "delete") {
      setFields(prev => prev.filter(f => f.id !== field.id));
      if (selectedField === field.id) setSelectedField(null);
      return;
    }
    setSelectedField(field.id);
    if (tool === "select") {
      const rect = e.currentTarget.getBoundingClientRect();
      setDragging({ id: field.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (dragging) {
      const field = fields.find(f => f.id === dragging.id);
      if (!field) return;
      const canvas = canvasRefs.current[field.page];
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - dragging.offsetX;
      const y = e.clientY - rect.top - dragging.offsetY;
      setFields(prev => prev.map(f => f.id === dragging.id ? { ...f, x: Math.max(0, x), y: Math.max(0, y) } : f));
    }
    if (resizing) {
      const field = fields.find(f => f.id === resizing.id);
      if (!field) return;
      const canvas = canvasRefs.current[field.page];
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(30, e.clientX - rect.left - field.x);
      const h = Math.max(16, e.clientY - rect.top - field.y);
      setFields(prev => prev.map(f => f.id === resizing.id ? { ...f, width: w, height: h } : f));
    }
  }, [dragging, resizing, fields]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  const saveSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return;
    const dataUrl = sigPadRef.current.toDataURL("image/png");
    setFields(prev => prev.map(f => f.id === sigModal ? { ...f, value: dataUrl } : f));
    setSigModal(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!pdfLibRef.current) {
        pdfLibRef.current = await import("pdf-lib");
      }
      const { PDFDocument: PDFDoc, rgb: pdfRgb, StandardFonts: Fonts } = pdfLibRef.current;
      const pdfDocLib = await PDFDoc.load(pdfBytesRef.current);
      const helvetica = await pdfDocLib.embedFont(Fonts.Helvetica);
      const pdfPages = pdfDocLib.getPages();

      for (const field of fields) {
        if (field.page >= pdfPages.length) continue;
        const page = pdfPages[field.page];
        const { width: pw, height: ph } = page.getSize();
        const pageInfo = pages[field.page];
        if (!pageInfo) continue;
        const scaleX = pw / (pageInfo.width * scale);
        const scaleY = ph / (pageInfo.height * scale);
        const pdfX = field.x * scaleX;
        const pdfY = ph - (field.y + field.height) * scaleY;

        if (field.type === "text" && field.value) {
          const fontSize = Math.min(14, field.height * scaleY * 0.6);
          page.drawText(field.value, { x: pdfX + 2, y: pdfY + 4, size: fontSize, font: helvetica, color: pdfRgb(0, 0, 0) });
        } else if (field.type === "checkbox" && field.value) {
          const sz = Math.min(field.width, field.height) * scaleX;
          page.drawRectangle({ x: pdfX, y: pdfY, width: sz, height: sz, color: pdfRgb(0, 0, 0) });
          page.drawText("✓", { x: pdfX + 2, y: pdfY + 2, size: sz * 0.8, font: helvetica, color: pdfRgb(1, 1, 1) });
        } else if (field.type === "signature" && field.value) {
          try {
            const sigBytes = await fetch(field.value).then(r => r.arrayBuffer());
            const sigImg = await pdfDocLib.embedPng(new Uint8Array(sigBytes));
            const sigW = field.width * scaleX;
            const sigH = field.height * scaleY;
            page.drawImage(sigImg, { x: pdfX, y: pdfY, width: sigW, height: sigH });
          } catch (err) {
            console.error("Failed to embed signature:", err);
          }
        }
      }

      const filledBytes = await pdfDocLib.save();
      const blob = new Blob([filledBytes], { type: "application/pdf" });

      // Generate thumbnail from first page
      let thumbnail = null;
      if (canvasRefs.current[0]) {
        const thumbCanvas = document.createElement("canvas");
        const srcCanvas = canvasRefs.current[0];
        const thumbScale = 120 / srcCanvas.width;
        thumbCanvas.width = 120;
        thumbCanvas.height = srcCanvas.height * thumbScale;
        const ctx = thumbCanvas.getContext("2d");
        ctx.drawImage(srcCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbnail = thumbCanvas.toDataURL("image/png", 0.7);
      }

      // Download
      const baseName = (fileName || "document").replace(/\.pdf$/i, "");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = baseName + "_filled.pdf";
      link.click();
      URL.revokeObjectURL(link.href);

      // Convert blob to data URL for storage
      const reader = new FileReader();
      reader.onload = () => {
        onSave({ filledPdfDataUrl: reader.result, thumbnail, fields, fileName: baseName + "_filled.pdf" });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Failed to save PDF:", err);
      alert("Failed to save PDF: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const tools = [
    { id: "select", label: "Select", icon: "🔘" },
    { id: "text", label: "Text", icon: "T" },
    { id: "checkbox", label: "Check", icon: "☑" },
    { id: "signature", label: "Sign", icon: "✍️" },
    { id: "delete", label: "Delete", icon: "🗑" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "#1e293b", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#0f172a", borderBottom: "1px solid #334155", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>✕</button>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginRight: 12 }}>{fileName || "PDF Form Filler"}</div>
        <div style={{ display: "flex", gap: 2, background: "#1e293b", borderRadius: 8, padding: 2 }}>
          {tools.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: tool === t.id ? "#3b82f6" : "transparent", color: tool === t.id ? "#fff" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        {fields.some(f => f.acroField) && (
          <div style={{ fontSize: 11, color: "#34d399", background: "rgba(52,211,153,0.1)", padding: "4px 10px", borderRadius: 6, fontWeight: 600 }}>
            {fields.filter(f => f.acroField).length} form fields detected
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setScale(s => Math.max(0.3, s - 0.15))} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #475569", background: "#1e293b", color: "#e2e8f0", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>−</button>
          <span style={{ color: "#94a3b8", fontSize: 12, minWidth: 42, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.15))} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #475569", background: "#1e293b", color: "#e2e8f0", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>+</button>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, marginLeft: 12 }}>
          {saving ? "Saving…" : "Save & Download"}
        </button>
      </div>

      {/* PDF Pages */}
      <div ref={containerRef} style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {pages.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 80 }}>Loading PDF…</div>
        )}
        {pages.map((pg, idx) => (
          <div key={idx} style={{ position: "relative", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", borderRadius: 4, overflow: "hidden", cursor: tool === "text" ? "crosshair" : tool === "checkbox" ? "crosshair" : tool === "signature" ? "crosshair" : tool === "delete" ? "not-allowed" : "default" }}
            onClick={(e) => handlePageClick(e, idx)}>
            <canvas ref={el => canvasRefs.current[idx] = el} style={{ display: "block" }} />
            {/* Overlay fields */}
            {fields.filter(f => f.page === idx).map(field => (
              <div key={field.id}
                onMouseDown={(e) => handleFieldMouseDown(e, field)}
                style={{
                  position: "absolute", left: field.x, top: field.y, width: field.width, height: field.height,
                  border: selectedField === field.id ? "2px solid #3b82f6" : "1px dashed rgba(59,130,246,0.5)",
                  borderRadius: 3, cursor: tool === "delete" ? "not-allowed" : tool === "select" ? "move" : "default",
                  background: field.type === "text" ? "rgba(255,255,255,0.85)" : field.type === "checkbox" ? "rgba(255,255,255,0.7)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: field.type === "checkbox" ? "center" : "flex-start",
                  boxSizing: "border-box",
                }}>
                {field.type === "text" && (
                  <>
                    {field.acroField && field.label && !field.value && (
                      <div style={{ position: "absolute", top: -14, left: 0, fontSize: 8, color: "#3b82f6", fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none" }}>{field.label}</div>
                    )}
                    <input type="text" value={field.value} placeholder={field.label || "Type here…"}
                      onChange={(e) => setFields(prev => prev.map(f => f.id === field.id ? { ...f, value: e.target.value } : f))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", height: "100%", border: "none", background: "transparent", padding: "2px 4px", fontSize: Math.min(14, field.height * 0.6), fontFamily: "inherit", outline: "none", color: "#000", boxSizing: "border-box" }} />
                  </>
                )}
                {field.type === "checkbox" && (
                  <div onClick={(e) => { e.stopPropagation(); setFields(prev => prev.map(f => f.id === field.id ? { ...f, value: !f.value } : f)); }}
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: Math.min(16, field.height * 0.8), fontWeight: 700, color: field.value ? "#059669" : "#ccc", userSelect: "none" }}>
                    {field.value ? "✓" : "☐"}
                  </div>
                )}
                {field.type === "signature" && (
                  <div onClick={(e) => { e.stopPropagation(); setSigModal(field.id); }}
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}>
                    {field.value ? (
                      <img src={field.value} alt="Signature" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                      <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Click to sign</span>
                    )}
                  </div>
                )}
                {/* Resize handle */}
                {selectedField === field.id && tool === "select" && (
                  <div onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: field.id }); }}
                    style={{ position: "absolute", right: -4, bottom: -4, width: 10, height: 10, background: "#3b82f6", borderRadius: 2, cursor: "nwse-resize", border: "1px solid #fff" }} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Signature Modal */}
      {sigModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSigModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, maxWidth: "90vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Draw Signature</h3>
              <button onClick={() => setSigModal(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>✕</button>
            </div>
            <canvas ref={sigCanvasRef} width={380} height={150} style={{ border: "2px solid #e2e8f0", borderRadius: 8, width: "100%", height: 150, touchAction: "none" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => sigPadRef.current?.clear()} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Clear</button>
              <button onClick={saveSignature} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Apply Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
};
const PATH_TO_ID = Object.fromEntries(
  Object.entries(ROUTE_MAP).map(([id, path]) => [path, id])
);

export default function App() {
  const auth = useAuth();
  // Update module-level CURRENT_USER from auth context
  if (auth.staff) CURRENT_USER = auth.staff.name;

  const location = useLocation();
  const routerNavigate = useNavigate();
  const page = PATH_TO_ID[location.pathname] || "dashboard";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hoverNav, setHoverNav] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [futureSchedule, setFutureSchedule] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [bills, setBills] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [reminders, setReminders] = useState(SEED_REMINDERS);
  const [callLog] = useState(SEED_CALL_LOG);
  const [templates, setTemplates] = useState(() => {
    try { const saved = localStorage.getItem("fieldops_templates"); return saved ? JSON.parse(saved) : SEED_TEMPLATES; } catch { return SEED_TEMPLATES; }
  });
  const [companyInfo, setCompanyInfo] = useState(() => {
    try { const saved = localStorage.getItem("fieldops_company_info"); return saved ? JSON.parse(saved) : { ...DEFAULT_COMPANY }; } catch { return { ...DEFAULT_COMPANY }; }
  });
  const [workOrders, setWorkOrders] = useState(SEED_WO);
  const [purchaseOrders, setPurchaseOrders] = useState(SEED_PO);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      // No Supabase config — use seed data for local preview
      setClients(SEED_CLIENTS);
      setJobs(SEED_JOBS);
      setQuotes(SEED_QUOTES);
      setInvoices(SEED_INVOICES);
      setTimeEntries(SEED_TIME);
      setBills(SEED_BILLS);
      setSchedule(SEED_SCHEDULE);
      setFutureSchedule(SEED_FUTURE_SCHEDULE);
      setContractors(SEED_CONTRACTORS);
      setSuppliers(SEED_SUPPLIERS);
      setStaff(TEAM_DATA.map((t, i) => ({ id: i + 1, name: t.name, costRate: t.costRate, chargeRate: t.chargeRate })));
      setLoading(false);
      return;
    }
    fetchAll()
      .then(data => {
        setClients(data.clients);
        // Attach phases, tasks, notes from Supabase to jobs
        setJobs(data.jobs.map(job => ({
          ...job,
          phases: (data.phases || []).filter(p => p.jobId === job.id),
          tasks: (data.tasks || []).filter(t => t.jobId === job.id),
          notes: (data.notes || []).filter(n => n.jobId === job.id),
        })));
        setQuotes(data.quotes);
        setInvoices(data.invoices);
        setTimeEntries(data.timeEntries);
        setBills(data.bills);
        setSchedule(data.schedule);
        setStaff(data.staff);
        if (data.workOrders) setWorkOrders(data.workOrders);
        if (data.purchaseOrders) setPurchaseOrders(data.purchaseOrders);
        if (data.contractors) setContractors(data.contractors);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setDbError(err.message);
        setLoading(false);
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
    // Main — 4..5
    { id: "jobs", label: "Jobs", icon: "jobs", badge: activeJobsCount || null },
    { id: "orders", label: "Orders", icon: "orders", badge: ordersOverdueCount || null },
    // Finance — 6..9
    { id: "time", label: "Time", icon: "time" },
    { id: "bills", label: "Bills", icon: "bills", badge: pendingBillsCount || null },
    { id: "quotes", label: "Quotes", icon: "quotes" },
    { id: "invoices", label: "Invoices", icon: "invoices", badge: unpaidInvCount || null },
    // Partners — 10..12
    { id: "clients", label: "Clients", icon: "clients" },
    { id: "contractors", label: "Contractors", icon: "contractors", badge: contractorComplianceIssues || null, badgeColor: "#dc2626" },
    { id: "suppliers", label: "Suppliers", icon: "suppliers" },
    // System — 13+
    ...((auth.isAdmin || auth.isLocalDev) ? [{ id: "settings", label: "Settings", icon: "settings" }] : []),
    { id: "files", label: "Files", icon: "quotes" },
    { id: "calllog", label: "Call Log", icon: "send" },
    { id: "activity", label: "Activity", icon: "notification" },
    { id: "status", label: "System Status", icon: "activity" },
  ];

  // Bottom nav shows first 5; rest in "More"
  const bottomNavItems = navItems.slice(0, 5);
  const moreNavItems = navItems.slice(5);
  const moreIsActive = moreNavItems.some(n => n.id === page);

  const pageTitles = { dashboard: "Dashboard", jobs: "Jobs", orders: "Orders", clients: "Clients", contractors: "Contractors", suppliers: "Suppliers", schedule: "Schedule", quotes: "Quotes", time: "Time Tracking", bills: "Bills & Costs", invoices: "Invoices", actions: "Actions", reminders: "Reminders", activity: "Activity Log", status: "System Status", settings: "Settings", files: "Files", calllog: "Call Log" };

  const navigate = (id) => {
    routerNavigate(ROUTE_MAP[id] || "/");
    setSidebarOpen(false);
    setMoreOpen(false);
  };

  const routeElements = (
    <Routes>
      <Route path="/" element={<Dashboard jobs={jobs} clients={clients} quotes={quotes} invoices={invoices} bills={bills} timeEntries={timeEntries} schedule={schedule} workOrders={workOrders} purchaseOrders={purchaseOrders} contractors={contractors} suppliers={suppliers} onNav={navigate} />} />
      <Route path="/jobs" element={<Jobs jobs={jobs} setJobs={setJobs} clients={clients} quotes={quotes} setQuotes={setQuotes} invoices={invoices} setInvoices={setInvoices} timeEntries={timeEntries} setTimeEntries={setTimeEntries} bills={bills} setBills={setBills} schedule={schedule} setSchedule={setSchedule} staff={staff} workOrders={workOrders} setWorkOrders={setWorkOrders} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} />} />
      <Route path="/orders" element={<OrdersPage workOrders={workOrders} setWorkOrders={setWorkOrders} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} jobs={jobs} />} />
      <Route path="/clients" element={<Clients clients={clients} setClients={setClients} jobs={jobs} templates={templates} />} />
      <Route path="/contractors" element={<Contractors contractors={contractors} setContractors={setContractors} workOrders={workOrders} bills={bills} />} />
      <Route path="/suppliers" element={<Suppliers suppliers={suppliers} setSuppliers={setSuppliers} purchaseOrders={purchaseOrders} bills={bills} />} />
      <Route path="/schedule" element={<Schedule schedule={schedule} setSchedule={setSchedule} futureSchedule={futureSchedule} setFutureSchedule={setFutureSchedule} jobs={jobs} clients={clients} staff={staff} />} />
      <Route path="/quotes" element={<Quotes quotes={quotes} setQuotes={setQuotes} jobs={jobs} clients={clients} invoices={invoices} />} />
      <Route path="/time" element={<TimeTracking timeEntries={timeEntries} setTimeEntries={setTimeEntries} jobs={jobs} setJobs={setJobs} clients={clients} staff={staff} />} />
      <Route path="/bills" element={<Bills bills={bills} setBills={setBills} jobs={jobs} setJobs={setJobs} clients={clients} />} />
      <Route path="/invoices" element={<Invoices invoices={invoices} setInvoices={setInvoices} jobs={jobs} clients={clients} quotes={quotes} />} />
      <Route path="/actions" element={<Actions jobs={jobs} quotes={quotes} invoices={invoices} bills={bills} workOrders={workOrders} purchaseOrders={purchaseOrders} contractors={contractors} reminders={reminders} onNav={navigate} />} />
      <Route path="/reminders" element={<Reminders reminders={reminders} setReminders={setReminders} jobs={jobs} />} />
      <Route path="/activity" element={<ActivityPage jobs={jobs} clients={clients} quotes={quotes} invoices={invoices} bills={bills} timeEntries={timeEntries} schedule={schedule} />} />
      <Route path="/status" element={<SystemStatus />} />
      <Route path="/settings" element={(auth.isAdmin || auth.isLocalDev) ? <Settings staff={staff} setStaff={setStaff} templates={templates} setTemplates={setTemplates} companyInfo={companyInfo} setCompanyInfo={setCompanyInfo} /> : <Navigate to="/" replace />} />
      <Route path="/call-log" element={<CallLog callLog={callLog} onNav={navigate} />} />
      <Route path="/files" element={<FilesPage jobs={jobs} bills={bills} contractors={contractors} quotes={quotes} invoices={invoices} workOrders={workOrders} purchaseOrders={purchaseOrders} />} />
      <Route path="/display/schedule" element={<DisplaySchedule schedule={schedule} jobs={jobs} clients={clients} />} />
      <Route path="/display/overview" element={<DisplayOverview jobs={jobs} quotes={quotes} timeEntries={timeEntries} schedule={schedule} clients={clients} />} />
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
          {/* Top — Dashboard, Actions, Schedule, Reminders (no section header) */}
          {navItems.slice(0, 4).map(n => {
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
          {navItems.slice(4, 6).map(n => {
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
          {navItems.slice(6, 10).map(n => {
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
          {navItems.slice(10, 13).map(n => {
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
          {navItems.slice(13).map(n => {
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
