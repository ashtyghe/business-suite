import { orderToday, orderAddDays } from '../utils/helpers';

export const SEED_CLIENTS = [
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

export const SEED_JOBS = [
  { id: 1, jobNumber: "J-0001", title: "Office Fitout – Level 3", clientId: 1, siteId: 101, status: "in_progress", priority: "high", description: "Full office refurbishment including partition walls, electrical and plumbing.", startDate: "2026-02-10", dueDate: "2026-03-25", assignedTo: ["Tom Baker", "Sarah Lee"], tags: ["fitout", "commercial"], createdAt: "2026-02-01", estimate: { labour: 4200, materials: 3800, subcontractors: 3500, other: 500 },
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
  { id: 2, jobNumber: "J-0002", title: "Roof Repair & Waterproofing", clientId: 2, siteId: 201, status: "quoted", priority: "medium", description: "Replace damaged roof sheets and apply waterproof membrane to flat section.", startDate: "2026-03-15", dueDate: "2026-03-30", assignedTo: ["Mike Chen"], tags: ["roofing", "maintenance"], createdAt: "2026-02-15", estimate: { labour: 1800, materials: 4200, subcontractors: 0, other: 300 },
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
  { id: 3, jobNumber: "J-0003", title: "Kitchen Renovation", clientId: 3, siteId: 301, status: "scheduled", priority: "medium", description: "Full kitchen demo and rebuild with new cabinetry, benchtops and appliances.", startDate: "2026-03-20", dueDate: "2026-04-20", assignedTo: ["Sarah Lee", "Dan Wright"], tags: ["renovation", "residential"], createdAt: "2026-02-20", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 }, phases: [], tasks: [], notes: [], activityLog: [{ ts: "2026-02-20 11:00", user: "Alex Jones", action: "Job created" }] },
  { id: 4, jobNumber: "J-0004", title: "HVAC Maintenance – Q1", clientId: 4, siteId: 401, status: "completed", priority: "low", description: "Quarterly service and filter replacement across all HVAC units.", startDate: "2026-01-15", dueDate: "2026-01-20", assignedTo: ["Tom Baker"], tags: ["hvac", "maintenance"], createdAt: "2026-01-10", estimate: { labour: 800, materials: 400, subcontractors: 0, other: 100 }, phases: [], tasks: [], notes: [], activityLog: [{ ts: "2026-01-10 08:00", user: "Alex Jones", action: "Job created" }, { ts: "2026-01-20 16:00", user: "Tom Baker", action: "Status changed to Completed" }] },
  { id: 5, jobNumber: "J-0005", title: "Bathroom Tiling & Fixtures", clientId: 1, siteId: null, status: "draft", priority: "low", description: "Re-tile master bathroom and replace all fixtures.", startDate: "", dueDate: "", assignedTo: [], tags: ["tiling", "plumbing"], createdAt: "2026-02-28", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 }, phases: [], tasks: [], notes: [], activityLog: [{ ts: "2026-02-28 15:00", user: "Alex Jones", action: "Job created" }] },
];

export const SEED_QUOTES = [
  { id: 1, jobId: 1, number: "Q-0001", status: "accepted", lineItems: [{ desc: "Labour – Demolition", qty: 16, unit: "hrs", rate: 95 }, { desc: "Partition Walls (supply & install)", qty: 4, unit: "ea", rate: 1200 }, { desc: "Electrical Works", qty: 1, unit: "lot", rate: 3500 }], tax: 10, notes: "Quote valid for 30 days.", createdAt: "2026-02-01" },
  { id: 2, jobId: 2, number: "Q-0002", status: "sent", lineItems: [{ desc: "Roof Sheet Replacement", qty: 24, unit: "m²", rate: 85 }, { desc: "Waterproof Membrane", qty: 40, unit: "m²", rate: 65 }, { desc: "Labour", qty: 20, unit: "hrs", rate: 90 }], tax: 10, notes: "Materials subject to availability.", createdAt: "2026-02-16" },
  { id: 3, jobId: 3, number: "Q-0003", status: "draft", lineItems: [{ desc: "Cabinetry Supply & Install", qty: 1, unit: "lot", rate: 8500 }, { desc: "Benchtops – Stone", qty: 6, unit: "lm", rate: 650 }, { desc: "Tiling", qty: 18, unit: "m²", rate: 95 }], tax: 10, notes: "", createdAt: "2026-02-21" },
];

export const SEED_SCHEDULE = [
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

export const SEED_FUTURE_SCHEDULE = [
  { id: 1, jobId: 1, weekStart: "2026-03-30", title: "Painting & Touch-ups", assignedTo: ["Tom Baker", "Dan Wright"], notes: "All Level 3 walls and ceilings." },
  { id: 2, jobId: 3, weekStart: "2026-03-30", title: "Benchtop Measure & Template", assignedTo: ["Sarah Lee"], notes: "Stone mason on site." },
  { id: 3, jobId: 2, weekStart: "2026-04-06", title: "Membrane Application", assignedTo: ["Mike Chen", "Dan Wright"], notes: "Weather dependent — need 3 dry days." },
  { id: 4, jobId: 1, weekStart: "2026-04-06", title: "Final Fix Electrical", assignedTo: ["Mike Chen"], notes: "GPOs, switches, downlights." },
  { id: 5, jobId: 3, weekStart: "2026-04-13", title: "Benchtop Install", assignedTo: ["Sarah Lee", "Tom Baker"], notes: "Crane may be required for stone." },
  { id: 6, jobId: 2, weekStart: "2026-04-20", title: "New Roof Sheets Install", assignedTo: ["Dan Wright", "Mike Chen"], notes: "24m² Colorbond sheets." },
  { id: 7, jobId: 3, weekStart: "2026-04-27", title: "Splashback & Appliances", assignedTo: ["Sarah Lee"], notes: "Tiler + plumber on site." },
  { id: 8, jobId: 1, weekStart: "2026-05-04", title: "Handover & Defects", assignedTo: ["Tom Baker", "Priya Sharma"], notes: "Client walkthrough and sign-off." },
];

export const SEED_TIME = [
  { id: 1, jobId: 1, worker: "Tom Baker",   date: "2026-03-10", startTime: "07:00", endTime: "15:00", hours: 8,   description: "Demolition works", billable: true },
  { id: 2, jobId: 1, worker: "Sarah Lee",   date: "2026-03-10", startTime: "07:00", endTime: "15:00", hours: 8,   description: "Demolition works", billable: true },
  { id: 3, jobId: 1, worker: "Tom Baker",   date: "2026-03-11", startTime: "07:00", endTime: "16:00", hours: 9,   description: "Partition framing", billable: true },
  { id: 4, jobId: 4, worker: "Tom Baker",   date: "2026-01-17", startTime: "09:00", endTime: "12:00", hours: 3,   description: "HVAC filter replacement x6", billable: true },
  { id: 5, jobId: 1, worker: "Mike Chen",   date: "2026-03-09", startTime: "08:00", endTime: "14:00", hours: 6,   description: "Electrical rough-in coordination", billable: true },
  { id: 6, jobId: 3, worker: "Sarah Lee",   date: "2026-03-05", startTime: "08:00", endTime: "12:00", hours: 4,   description: "Kitchen site measure-up", billable: false },
  { id: 7, jobId: 1, worker: "Dan Wright",  date: "2026-03-11", startTime: "08:00", endTime: "15:30", hours: 7.5, description: "Plasterboard installation", billable: true },
];

export const SEED_BILLS = [
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

export const SEED_REMINDERS = [
  { id: 1, text: "Chase Tom for site photos from Level 3 fitout", type: "text", dueDate: "2026-03-14", status: "pending", jobId: 1, createdAt: "2026-03-10T08:00:00Z" },
  { id: 2, text: "HVAC maintenance prep", type: "checklist", items: [{ id: 1, text: "Order replacement filters", done: false }, { id: 2, text: "Book technician for Thursday", done: true }, { id: 3, text: "Notify tenant of scheduled downtime", done: false }], dueDate: "2026-03-15", status: "pending", jobId: 4, createdAt: "2026-03-11T09:30:00Z" },
  { id: 3, text: "Follow up with council on DA approval", type: "text", dueDate: "2026-03-12", status: "pending", jobId: null, createdAt: "2026-03-08T14:00:00Z" },
  { id: 4, text: "Send updated quote to Hartwell Properties", type: "text", dueDate: "2026-03-17", status: "pending", jobId: 1, createdAt: "2026-03-12T10:00:00Z" },
  { id: 5, text: "Kitchen demo day prep", type: "checklist", items: [{ id: 1, text: "Book skip bin", done: false }, { id: 2, text: "Confirm demolition crew", done: false }, { id: 3, text: "Disconnect plumbing", done: true }], dueDate: "2026-03-19", status: "pending", jobId: 3, createdAt: "2026-03-13T07:45:00Z" },
  { id: 6, text: "Review contractor insurance docs before they expire", type: "text", dueDate: "2026-03-10", status: "pending", jobId: null, createdAt: "2026-03-05T11:00:00Z" },
  { id: 7, text: "Roof delivery checklist", type: "checklist", items: [{ id: 1, text: "Confirm delivery time with supplier", done: true }, { id: 2, text: "Clear site access for truck", done: true }], dueDate: "2026-03-11", status: "completed", jobId: 2, createdAt: "2026-03-07T08:30:00Z" },
  { id: 8, text: "Submit BAS for Q3", type: "text", dueDate: "2026-03-08", status: "completed", jobId: null, createdAt: "2026-03-01T09:00:00Z" },
];

export const SEED_CALL_LOG = [
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

export const SEED_INVOICES = [
  { id: 1, jobId: 4, number: "INV-0001", status: "paid", lineItems: [{ desc: "HVAC Quarterly Maintenance", qty: 1, unit: "lot", rate: 950 }, { desc: "Replacement Filters x6", qty: 6, unit: "ea", rate: 95 }], tax: 10, dueDate: "2026-02-17", notes: "Thank you for your business.", createdAt: "2026-01-20" },
];

export const DEFAULT_COMPANY = { companyName: "FieldOps Pty Ltd", abn: "12 345 678 901", address: "22 King St, Sydney NSW 2000", phone: "02 9000 1234", email: "admin@fieldops.com", timezone: "Australia/Sydney" };
export const DEFAULT_COLUMNS = { description: true, qty: true, unit: true, unitPrice: true, lineTotal: true, gst: true };
export const SEED_TEMPLATES = [
  { id: 1, name: "Default", type: "quote", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#111111", footer: "Thank you for your business.", terms: "This quote is valid for 30 days from the date of issue.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Quote {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached quote {{number}} for {{jobTitle}}.\n\nTotal: {{total}} (inc. GST)\n\nIf you have any questions, please don't hesitate to get in touch.\n\nKind regards,\n{{companyName}}" },
  { id: 2, name: "Default", type: "invoice", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#4f46e5", footer: "Thank you for your prompt payment.", terms: "Payment due within 14 days of invoice date. Please reference the invoice number with your payment.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Invoice {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached invoice {{number}} for {{jobTitle}}.\n\nTotal: {{total}} (inc. GST)\nDue: {{dueDate}}\n\nKind regards,\n{{companyName}}" },
  { id: 3, name: "Default", type: "work_order", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#2563eb", footer: "", terms: "Please confirm acceptance of this work order within 48 hours.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Work Order {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached work order {{number}} for {{jobTitle}}.\n\nScope and pricing details are included in the attached document.\n\nPlease confirm your acceptance at your earliest convenience.\n\nKind regards,\n{{companyName}}" },
  { id: 4, name: "Default", type: "purchase_order", isDefault: true, ...DEFAULT_COMPANY, logo: null, accentColor: "#059669", footer: "", terms: "Please deliver by the date specified. Reference this PO number on your invoice.", showGst: true, columns: { ...DEFAULT_COLUMNS }, emailSubject: "Purchase Order {{number}} from {{companyName}}", emailBody: "Hi {{clientName}},\n\nPlease find attached purchase order {{number}}.\n\nPlease confirm receipt and expected delivery date.\n\nKind regards,\n{{companyName}}" },
];

export const TEAM_DATA = [
  { name: "Tom Baker", costRate: 55, chargeRate: 95 },
  { name: "Sarah Lee", costRate: 50, chargeRate: 85 },
  { name: "Mike Chen", costRate: 60, chargeRate: 100 },
  { name: "Dan Wright", costRate: 48, chargeRate: 80 },
  { name: "Priya Sharma", costRate: 52, chargeRate: 90 },
];
export const TEAM = TEAM_DATA.map(t => t.name);

export const NOTE_CATEGORIES = [
  { id: "general", label: "General", color: "#64748b" },
  { id: "site_update", label: "Site Update", color: "#0891b2" },
  { id: "issue", label: "Issue", color: "#dc2626" },
  { id: "inspection", label: "Inspection", color: "#7c3aed" },
  { id: "delivery", label: "Delivery", color: "#d97706" },
  { id: "safety", label: "Safety", color: "#059669" },
  { id: "form", label: "Form", color: "#2563eb" },
];

export const FORM_TEMPLATES = [
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

export const ORDER_CONTRACTORS = [
  { id: "c1", name: "Apex Electrical Pty Ltd", contact: "Mark Simmons", email: "mark@apexelec.com.au", phone: "0412 345 678", trade: "Electrical" },
  { id: "c2", name: "Blue Ridge Plumbing", contact: "Sarah O'Brien", email: "sarah@blueridgeplumbing.com.au", phone: "0421 987 654", trade: "Plumbing" },
  { id: "c3", name: "Coastal Civil Works", contact: "Tom Fletcher", email: "tom@coastalcivil.com.au", phone: "0433 112 233", trade: "Civil" },
  { id: "c4", name: "Ironclad Roofing Co.", contact: "Dave Nguyen", email: "dave@ironcladroofing.com.au", phone: "0455 667 788", trade: "Roofing" },
];
export const ORDER_SUPPLIERS = [
  { id: "s1", name: "Reece Plumbing & Bathrooms", contact: "Accounts", email: "accounts@reece.com.au", phone: "1300 555 000", abn: "12 345 678 901" },
  { id: "s2", name: "Bunnings Trade", contact: "Trade Desk", email: "trade@bunnings.com.au", phone: "1300 888 111", abn: "23 456 789 012" },
  { id: "s3", name: "Middy's Electrical", contact: "Sales", email: "sales@middys.com.au", phone: "03 9412 5555", abn: "34 567 890 123" },
  { id: "s4", name: "Clark Rubber & Foam", contact: "Warehouse", email: "orders@clarkrubber.com.au", phone: "1800 252 759", abn: "45 678 901 234" },
];
export const ORDER_UNITS = ["hr", "day", "ea", "m", "m2", "m3", "kg", "t", "L", "lm", "set", "lot"];

export const ORDER_STATUSES = ["Draft", "Approved", "Sent", "Viewed", "Accepted", "Completed", "Billed", "Cancelled"];
export const ORDER_TRANSITIONS = {
  Draft: ["Approved", "Cancelled"], Approved: ["Sent", "Draft", "Cancelled"], Sent: ["Viewed", "Accepted", "Cancelled"],
  Viewed: ["Accepted", "Cancelled"], Accepted: ["Completed", "Cancelled"], Completed: ["Billed"], Billed: [], Cancelled: ["Draft"],
};
export const ORDER_TERMINAL = ["Billed", "Cancelled"];
export const ORDER_ACTIVE = ["Approved", "Sent", "Viewed", "Accepted", "Completed"];
export const ORDER_STATUS_PROGRESS = { Draft: 0, Approved: 15, Sent: 30, Viewed: 45, Accepted: 60, Completed: 80, Billed: 100, Cancelled: 0 };

export const ORDER_STATUS_COLORS = {
  Draft: { bg: "#f1f5f9", text: "#475569" }, Approved: { bg: "#e0f2fe", text: "#0369a1" }, Sent: { bg: "#dbeafe", text: "#1d4ed8" },
  Viewed: { bg: "#ede9fe", text: "#6d28d9" }, Accepted: { bg: "#fef3c7", text: "#b45309" }, Completed: { bg: "#d1fae5", text: "#047857" },
  Billed: { bg: "#ccfbf1", text: "#0f766e" }, Cancelled: { bg: "#fee2e2", text: "#dc2626" },
};
export const ORDER_BAR_COLORS = {
  Draft: "#cbd5e1", Approved: "#38bdf8", Sent: "#60a5fa", Viewed: "#a78bfa", Accepted: "#fbbf24", Completed: "#34d399", Billed: "#2dd4bf", Cancelled: "#fca5a5",
};

export const SECTION_COLORS = {
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
  assistant: { accent: "#6366f1", light: "#eef2ff" },
  memory: { accent: "#8b5cf6", light: "#f5f3ff" },
  account: { accent: "#6b7280", light: "#f9fafb" },
};

export const ViewField = ({ label, value }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 14, color: '#111', fontWeight: 500 }}>{value || '—'}</div>
  </div>
);

export const SEED_WO = [
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
export const SEED_PO = [
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

export const CONTRACTOR_TRADES = ["Electrical", "Plumbing", "Roofing", "Carpentry", "Painting", "Tiling", "HVAC", "Landscaping", "Other"];


export const SEED_CONTRACTORS = [
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
export const SEED_SUPPLIERS = [
  { id: "s1", name: "Reece Plumbing & Bathrooms", contact: "Accounts", email: "accounts@reece.com.au", phone: "03 9123 4567", abn: "12 345 678 901", notes: "Trade account — 30-day terms." },
  { id: "s2", name: "Middy's Electrical", contact: "Sales", email: "sales@middys.com.au", phone: "03 9876 5432", abn: "34 567 890 123", notes: "Trade pricing on cable & accessories." },
  { id: "s3", name: "BuildRight Supplies", contact: "Orders Desk", email: "orders@buildright.com.au", phone: "03 9111 2222", abn: "45 678 901 234", notes: "General building materials. Free delivery over $500." },
  { id: "s4", name: "ElecPro", contact: "Accounts", email: "accounts@elecpro.com.au", phone: "03 9333 4444", abn: "56 789 012 345", notes: "" },
  { id: "s5", name: "Metro Hire Co", contact: "Bookings", email: "bookings@metrohire.com.au", phone: "03 9555 6666", abn: "67 890 123 456", notes: "Plant & equipment hire." },
  { id: "s6", name: "CoolAir Parts", contact: "Sales", email: "sales@coolairparts.com.au", phone: "03 9777 8888", abn: "78 901 234 567", notes: "HVAC parts supplier." },
];

export const STATUS_COLORS = {
  draft: "#999",
  scheduled: "#555",
  quoted: "#333",
  in_progress: "#111",
  completed: "#444",
  cancelled: "#bbb",
};
export const STATUS_BG = {
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
export const STATUS_TEXT = {
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
