import { create } from 'zustand';
import { fetchAll, fetchCompanyInfo, fetchTemplates, fetchAllUserPermissions, saveCompanyInfo as dbSaveCompanyInfo, saveTemplates as dbSaveTemplates } from './db';

// ── App Store ────────────────────────────────────────────────────────────────
// Holds all business data state previously managed via useState in App.
// Auth stays in AuthContext — this store is for app/domain data only.

export const useAppStore = create((set) => ({
  // ── Data slices ──────────────────────────────────────────────────────────
  clients: [],
  jobs: [],
  quotes: [],
  schedule: [],
  futureSchedule: [],
  timeEntries: [],
  bills: [],
  invoices: [],
  staff: [],
  contractors: [],
  suppliers: [],
  reminders: [],
  callLog: [],
  templates: [],
  companyInfo: {},
  workOrders: [],
  purchaseOrders: [],
  userPermissions: {},

  // ── Loading / error ──────────────────────────────────────────────────────
  loading: true,
  dbError: null,

  // ── UI preferences ─────────────────────────────────────────────────────
  sectionView: 'list',   // shared view mode across sections: "list" | "grid" | "kanban"

  // ── Setters (mirror the old setState calls) ──────────────────────────────
  setClients: (v) => set({ clients: typeof v === 'function' ? v(useAppStore.getState().clients) : v }),
  setJobs: (v) => set({ jobs: typeof v === 'function' ? v(useAppStore.getState().jobs) : v }),
  setQuotes: (v) => set({ quotes: typeof v === 'function' ? v(useAppStore.getState().quotes) : v }),
  setSchedule: (v) => set({ schedule: typeof v === 'function' ? v(useAppStore.getState().schedule) : v }),
  setFutureSchedule: (v) => set({ futureSchedule: typeof v === 'function' ? v(useAppStore.getState().futureSchedule) : v }),
  setTimeEntries: (v) => set({ timeEntries: typeof v === 'function' ? v(useAppStore.getState().timeEntries) : v }),
  setBills: (v) => set({ bills: typeof v === 'function' ? v(useAppStore.getState().bills) : v }),
  setInvoices: (v) => set({ invoices: typeof v === 'function' ? v(useAppStore.getState().invoices) : v }),
  setStaff: (v) => set({ staff: typeof v === 'function' ? v(useAppStore.getState().staff) : v }),
  setContractors: (v) => set({ contractors: typeof v === 'function' ? v(useAppStore.getState().contractors) : v }),
  setSuppliers: (v) => set({ suppliers: typeof v === 'function' ? v(useAppStore.getState().suppliers) : v }),
  setReminders: (v) => set({ reminders: typeof v === 'function' ? v(useAppStore.getState().reminders) : v }),
  setTemplates: (v) => {
    const next = typeof v === 'function' ? v(useAppStore.getState().templates) : v;
    set({ templates: next });
  },
  setCompanyInfo: (v) => {
    const next = typeof v === 'function' ? v(useAppStore.getState().companyInfo) : v;
    set({ companyInfo: next });
  },
  setWorkOrders: (v) => set({ workOrders: typeof v === 'function' ? v(useAppStore.getState().workOrders) : v }),
  setPurchaseOrders: (v) => set({ purchaseOrders: typeof v === 'function' ? v(useAppStore.getState().purchaseOrders) : v }),
  setUserPermissions: (v) => set({ userPermissions: typeof v === 'function' ? v(useAppStore.getState().userPermissions) : v }),
  setSectionView: (v) => set({ sectionView: v }),

  // ── Initialise: load from Supabase or seed data ──────────────────────────
  // Called once from App's useEffect. Receives seed data constants from the
  // monolith so we don't need to duplicate/move them yet.
  init: async (seedData) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // No Supabase — use seed data for local preview
      set({
        clients: seedData.clients,
        jobs: seedData.jobs,
        quotes: seedData.quotes,
        invoices: seedData.invoices,
        timeEntries: seedData.timeEntries,
        bills: seedData.bills,
        schedule: seedData.schedule,
        futureSchedule: seedData.futureSchedule,
        contractors: seedData.contractors,
        suppliers: seedData.suppliers,
        staff: seedData.staff,
        reminders: seedData.reminders,
        callLog: seedData.callLog,
        templates: seedData.templates,
        companyInfo: seedData.companyInfo,
        workOrders: seedData.workOrders,
        purchaseOrders: seedData.purchaseOrders,
        loading: false,
        dbError: null,
      });
      return;
    }

    try {
      // Fetch all business data + settings in parallel
      const [data, companyInfoData, templatesData, userPermsData] = await Promise.all([
        fetchAll(),
        fetchCompanyInfo(),
        fetchTemplates(),
        fetchAllUserPermissions(),
      ]);

      // One-time migration: if Supabase is empty but localStorage has data, push it up
      let resolvedCompanyInfo = companyInfoData;
      if (!resolvedCompanyInfo) {
        try {
          const local = localStorage.getItem('fieldops_company_info');
          if (local) {
            resolvedCompanyInfo = JSON.parse(local);
            dbSaveCompanyInfo(resolvedCompanyInfo).catch(() => {});
          }
        } catch { /* ignore */ }
      }

      let resolvedTemplates = templatesData;
      if (!resolvedTemplates) {
        try {
          const local = localStorage.getItem('fieldops_templates');
          if (local) {
            resolvedTemplates = JSON.parse(local);
            dbSaveTemplates(resolvedTemplates).catch(() => {});
          }
        } catch { /* ignore */ }
      }

      set({
        clients: data.clients,
        jobs: data.jobs.map(job => ({
          ...job,
          phases: (data.phases || []).filter(p => p.jobId === job.id),
          tasks: (data.tasks || []).filter(t => t.jobId === job.id),
          notes: (data.notes || []).filter(n => n.jobId === job.id),
        })),
        quotes: data.quotes,
        invoices: data.invoices,
        timeEntries: data.timeEntries,
        bills: data.bills,
        schedule: data.schedule,
        staff: data.staff,
        ...(data.workOrders ? { workOrders: data.workOrders } : {}),
        ...(data.purchaseOrders ? { purchaseOrders: data.purchaseOrders } : {}),
        ...(data.contractors ? { contractors: data.contractors } : {}),
        templates: resolvedTemplates || seedData.templates,
        companyInfo: resolvedCompanyInfo || seedData.companyInfo,
        userPermissions: userPermsData || {},
        loading: false,
        dbError: null,
      });
    } catch (err) {
      console.error('Failed to load data:', err);
      set({ dbError: err.message, loading: false });
    }
  },
}));
