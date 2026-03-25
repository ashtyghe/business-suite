import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useAppStore } from "../lib/store";
import { useAuth } from "../lib/AuthContext";
import { Icon } from "../components/Icon";
import { CloseBtn, BILL_CATEGORIES } from "../components/shared";
import { SECTION_COLORS, DEFAULT_COLUMNS, SEED_TEMPLATES } from "../fixtures/seedData.jsx";
import { supabase, inviteUser, updateStaffRecord, xeroOAuth, xeroSyncInvoice, xeroSyncBill, xeroSyncContact, xeroPollUpdates, xeroFetchAccounts, xeroGetMappings, xeroSaveMappings } from "../lib/supabase";
import { adminResetUserPassword } from "../lib/auth";
import { saveCompanyInfo as dbSaveCompanyInfo, saveTemplates as dbSaveTemplates, saveUserPermissions as dbSaveUserPermissions } from "../lib/db";
import { hexToRgba, formatAddress } from "../utils/helpers";
import { TIMEZONE_OPTIONS } from "../utils/timezone";
import AddressFields from '../components/AddressFields';
import s from './Settings.module.css';

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
      <label className={s.label}>{label}</label>
      <select
        value={getMappingValue(entityType, category)}
        onChange={e => setMappingValue(entityType, category, e.target.value)}
        className={s.selectBase}
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
        <div className={s.alertErrorSmallFlex}>
          {mappingError}
          <button onClick={() => setMappingError(null)} className={s.alertDismiss}>&times;</button>
        </div>
      )}
      {mappingSaved && (
        <div className={s.alertSuccessSmall}>
          Account mappings saved successfully.
        </div>
      )}

      {(!xeroAccounts || xeroAccounts.length === 0) ? (
        <div>
          <div className={s.setupHelp}>Pull your Chart of Accounts from Xero to configure which accounts invoices and bills sync to.</div>
          <button onClick={handleFetchAccounts} disabled={fetchingAccounts} className={s.btnAccent} style={{ background: accent }}>
            {fetchingAccounts ? "Fetching..." : "Fetch Accounts from Xero"}
          </button>
        </div>
      ) : (
        <div>
          <div className={s.flexBetweenMbSm}>
            <div className={s.accountsInfo}>{xeroAccounts.length} accounts loaded from Xero ({revenueAccounts.length} revenue, {expenseAccounts.length} expense)</div>
            <button onClick={handleFetchAccounts} disabled={fetchingAccounts} className={s.refreshBtn}>
              {fetchingAccounts ? "Refreshing..." : "Refresh Accounts"}
            </button>
          </div>

          {/* Revenue Accounts (Invoices) */}
          <div className={s.mb20}>
            <div className={s.accountsSectionTitle}>Revenue Accounts (Invoices)</div>
            <div className={s.gridGap12} style={{ gridTemplateColumns: compact ? "1fr" : "1fr 1fr" }}>
              {renderAccountSelect("invoice", "", "Default Invoice Account", revenueAccounts)}
            </div>
          </div>

          {/* Expense Accounts (Bills) */}
          <div className={s.mb16}>
            <div className={s.accountsSectionTitle}>Expense Accounts (Bills)</div>
            <div className={s.gridGap12} style={{ gridTemplateColumns: compact ? "1fr" : "1fr 1fr" }}>
              {BILL_CATEGORIES.map(cat =>
                renderAccountSelect("bill", cat, cat, expenseAccounts)
              )}
            </div>
          </div>

          <button onClick={handleSaveMappings} disabled={savingMappings} className={s.btnAccent} style={{ background: accent }}>
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

  if (xeroLoading) return <div className={s.xeroLoading}>Loading Xero status...</div>;

  // Build current mapping summary for display
  const getMappingSummary = (entityType, category = "") => {
    const m = mappings.find(x => x.entity_type === entityType && (x.category || "") === category);
    return m ? `${m.xero_account_code} — ${m.xero_account_name}` : null;
  };

  return (
    <div>
      <div className={s.pageHeading} style={{ marginBottom: 4 }}>Xero Accounting Integration</div>
      <div className={s.sectionSubtitleSm}>Sync invoices, bills, and contacts with your Xero organisation</div>
      {xeroError && (
        <div className={s.alertErrorFlex}>
          <Icon name="notification" size={14} /> {xeroError}
          <button onClick={() => setXeroError(null)} className={s.alertDismiss}>&times;</button>
        </div>
      )}
      <div className={s.card}>
        <div className={s.flexBetween}>
          <div className={s.flexGap12}>
            <div className={xeroStatus?.connected ? s.xeroIconConnected : s.xeroIconDisconnected}>X</div>
            <div>
              <div className={s.xeroStatusTitle}>{xeroStatus?.connected ? `Connected to ${xeroStatus.tenantName}` : "Not connected"}</div>
              <div className={s.xeroStatusSub}>{xeroStatus?.connected ? `Connected ${xeroStatus.connectedAt ? new Date(xeroStatus.connectedAt).toLocaleDateString() : ""}` : "Connect to your Xero organisation to start syncing"}</div>
            </div>
          </div>
          {xeroStatus?.connected
            ? <button onClick={handleDisconnect} className={s.btnDisconnect}>Disconnect</button>
            : <button onClick={handleConnect} className={s.btnAccent} style={{ background: accent }}>Connect to Xero</button>}
        </div>
      </div>
      {xeroStatus?.connected && xeroSetupStep > 0 && xeroSetupStep <= 4 && (
        <div className={s.card} style={{ border: `2px solid ${accent}` }}>
          <div className={s.setupWizardTitle}>Setup Wizard — Step {xeroSetupStep} of 4</div>
          <div className={s.setupWizardDesc}>
            {xeroSetupStep === 1 && "Match your existing contacts with Xero to avoid duplicates"}
            {xeroSetupStep === 2 && "Map your Xero account codes for invoices and bills"}
            {xeroSetupStep === 3 && "Mark items that are already in Xero to skip during sync"}
            {xeroSetupStep === 4 && "Preview what will be synced before running"}
          </div>
          {xeroSetupStep === 1 && (<div>{!xeroMatchResults ? <button onClick={runContactMatch} disabled={xeroSyncing} className={s.btnAccent} style={{ background: accent }}>{xeroSyncing ? "Matching..." : "Run Contact Matching"}</button> : (<div><div className={s.setupHelp}>Found {xeroMatchResults.xeroContactCount} contacts in Xero. {xeroMatchResults.matches?.length || 0} FieldOps contacts to review.</div>{(xeroMatchResults.matches || []).map((m, i) => (<div key={i} className={s.contactRow}><input type="checkbox" checked={m.confirmed || false} onChange={() => { const updated = [...xeroMatchResults.matches]; updated[i] = { ...updated[i], confirmed: !updated[i].confirmed }; setXeroMatchResults({ ...xeroMatchResults, matches: updated }); }} /><div className={s.flex1}><span className={s.contactName}>{m.name}</span><span className={s.contactType}>({m.entityType})</span></div><div className={m.xeroMatch ? s.contactMatch : s.contactNoMatch}>{m.xeroMatch ? `→ ${m.xeroMatch.name} (${m.xeroMatch.confidence})` : "No match — will create new"}</div></div>))}<div className={s.flexEndMt}><button onClick={() => confirmMatches(xeroMatchResults.matches)} className={s.btnAccent} style={{ background: accent }}>Confirm & Continue</button><button onClick={() => setXeroSetupStep(2)} className={s.btnSecondary}>Skip</button></div></div>)}</div>)}
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
              <div className={s.flexEndMt}>
                <button onClick={() => setXeroSetupStep(3)} className={s.btnAccent} style={{ background: accent }}>Continue</button>
                <button onClick={() => setXeroSetupStep(3)} className={s.btnSecondary}>Skip</button>
              </div>
            </div>
          )}
          {xeroSetupStep === 3 && (<div><div className={s.setupHelp}>If any invoices or bills have already been entered in Xero manually, mark them here to prevent duplicates.</div><div className={s.flexGap8}><button onClick={() => setXeroSetupStep(4)} className={s.btnAccent} style={{ background: accent }}>Continue to Preview</button><button onClick={() => setXeroSetupStep(4)} className={s.btnSecondary}>Skip — None to mark</button></div></div>)}
          {xeroSetupStep === 4 && (<div>{!xeroDryRun ? <button onClick={runDryRun} disabled={xeroSyncing} className={s.btnAccent} style={{ background: accent }}>{xeroSyncing ? "Checking..." : "Preview Sync"}</button> : (<div><div className={s.grid2Gap16} style={{ marginBottom: 12 }}><div className={s.dryRunInvoices}><div className={s.dryRunNumberGreen}>{xeroDryRun.invoices?.wouldSync || 0}</div><div className={s.dryRunLabel}>Invoices to sync</div></div><div className={s.dryRunBills}><div className={s.dryRunNumberBlue}>{xeroDryRun.bills?.wouldSync || 0}</div><div className={s.dryRunLabel}>Bills to sync</div></div></div><div className={s.flexGap8}><button onClick={() => { runBulkSync("invoices"); runBulkSync("bills"); setXeroSetupStep(0); }} className={s.btnAccent} style={{ background: accent }}>Start Sync</button><button onClick={() => setXeroSetupStep(0)} className={s.btnSecondary}>Close Wizard</button></div></div>)}</div>)}
        </div>
      )}
      {xeroStatus?.connected && xeroSetupStep === 0 && (
        <>
          {/* Account Mapping Section */}
          <div className={s.card}>
            <div className={s.sectionTitleMb}>Account Mapping</div>
            <div className={s.sectionSubtitle}>Configure which Xero accounts invoices and bills are posted to</div>
            {/* Current mappings summary */}
            {mappings.length > 0 && !xeroAccounts.length && (
              <div className={s.mb16}>
                <div className={s.gridGap8}>
                  {getMappingSummary("invoice") && (
                    <div className={s.mappingRow}>
                      <div className={s.mappingDotGreen} />
                      <span className={s.mappingLabel}>Invoices:</span>
                      <span className={s.mappingValue}>{getMappingSummary("invoice")}</span>
                    </div>
                  )}
                  {BILL_CATEGORIES.map(cat => {
                    const summary = getMappingSummary("bill", cat);
                    return summary ? (
                      <div key={cat} className={s.mappingRow}>
                        <div className={s.mappingDotBlue} />
                        <span className={s.mappingLabel}>Bills ({cat}):</span>
                        <span className={s.mappingValue}>{summary}</span>
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

          <div className={s.card}>
            <div className={s.sectionTitle} style={{ marginBottom: 16 }}>Sync Actions</div>
            <div className={s.flexWrap}>
              <button onClick={() => runBulkSync("invoices")} disabled={xeroSyncing} className={s.btnSyncInvoices}>{xeroSyncing ? "Syncing..." : "Sync All Invoices"}</button>
              <button onClick={() => runBulkSync("bills")} disabled={xeroSyncing} className={s.btnSyncBills}>{xeroSyncing ? "Syncing..." : "Sync All Bills"}</button>
              <button onClick={handlePoll} disabled={xeroSyncing} className={s.btnSyncPoll}>{xeroSyncing ? "Checking..." : "Check for Updates"}</button>
              <button onClick={() => setXeroSetupStep(1)} className={s.btnLight}>Re-run Setup Wizard</button>
            </div>
            {xeroSyncResult && <div className={xeroSyncResult.errors > 0 ? s.syncResultWarn : s.syncResultSuccess}><span className={s.syncResultBold}>{xeroSyncResult.type}:</span> {xeroSyncResult.synced} synced, {xeroSyncResult.errors} errors, {xeroSyncResult.total} total</div>}
            {xeroPollResult && <div className={s.syncResultSuccess}><span className={s.syncResultBold}>Updates:</span> {xeroPollResult.invoices?.updated || 0} invoices, {xeroPollResult.bills?.updated || 0} bills updated</div>}
          </div>
          {xeroSyncLog.length > 0 && (
            <div className={s.card}>
              <div className={s.sectionTitle} style={{ marginBottom: 12 }}>Recent Sync Activity</div>
              {xeroSyncLog.map((log, i) => (
                <div key={i} className={s.syncLogRow} style={{ borderBottom: i < xeroSyncLog.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <div className={log.status === "success" ? s.syncLogDotSuccess : log.status === "error" ? s.syncLogDotError : s.syncLogDotWarn} />
                  <div className={s.syncLogEntity}><span className={s.syncLogEntityType}>{log.entity_type}</span><span className={s.syncLogDirection}>{log.direction}</span></div>
                  <div className={log.status === "error" ? s.syncLogStatusError : s.syncLogStatusNormal}>{log.error_message ? log.error_message.slice(0, 50) : log.status}</div>
                  <div className={s.syncLogTime}>{log.created_at ? new Date(log.created_at).toLocaleString() : ""}</div>
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

const VoiceOptionCard = ({ option, selected, onSelect, accent }) => (
  <div
    onClick={onSelect}
    className={s.voiceCard}
    style={{
      border: selected ? `2px solid ${accent}` : undefined,
      background: selected ? hexToRgba(accent, 0.06) : undefined,
    }}
  >
    <div className={s.voiceCardFlex}>
      <div
        className={s.voiceRadio}
        style={selected ? { border: `5px solid ${accent}` } : undefined}
      />
      <div>
        <div className={selected ? s.voiceLabelSelected : s.voiceLabel}>{option.label}</div>
        <div className={s.voiceDesc}>{option.desc}</div>
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
  const saveCompanyInfo = async () => {
    try {
      await dbSaveCompanyInfo(companyForm);
      setCompanyInfo(companyForm);
      setCompanyDirty(false); setCompanySaved(true);
      setTimeout(() => setCompanySaved(false), 2500);
    } catch (err) {
      console.error('Failed to save company info:', err);
      alert('Failed to save company info. Please try again.');
    }
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
      <div className={s.flexBetweenMb}>
        <div>
          <div className={s.pageHeading}>Voice Assistant</div>
          <div className={s.pageSubheading}>Configure your Iris voice assistant — powered by OpenAI Realtime + Twilio</div>
          <div className={s.pageSubheadingMuted}>These are the company defaults. Staff can personalise their own assistant in My Assistant.</div>
        </div>
        <div className={s.flexGap8}>
          <button className="btn btn-ghost btn-sm" onClick={resetVoiceSettings} style={{ fontSize: 11 }}>Reset Defaults</button>
          <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: dirty ? 1 : 0.5 }} onClick={saveVoiceSettings} disabled={!dirty}>
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>

      {saved && (
        <div className={s.alertSuccessFlex}>
          <Icon name="check" size={14} /> Voice settings saved. Changes will apply to the next call.
        </div>
      )}

      {/* Assistant Name */}
      <div className={s.card}>
        <div className={s.sectionHeading}>Assistant Name</div>
        <input
          type="text" value={voiceSettings.name}
          onChange={e => updateVoice("name", e.target.value)}
          placeholder="e.g. Iris, Billy, Sage"
          className={s.inputNarrowLg}
        />
        <div className={s.hint}>The name your assistant introduces itself as on calls</div>
      </div>

      {/* Voice Selection */}
      <div className={s.card}>
        <div className={s.sectionHeading}>Voice</div>
        <div className={s.gridAutoFill}>
          {VOICE_OPTIONS.voices.map(v => (
            <VoiceOptionCard key={v.id} option={v} selected={voiceSettings.voice === v.id} onSelect={() => updateVoice("voice", v.id)} accent={accent} />
          ))}
        </div>
      </div>

      {/* Greeting Style */}
      <div className={s.card}>
        <div className={s.sectionHeading}>Greeting Style</div>
        <textarea
          value={voiceSettings.greetingStyle}
          onChange={e => updateVoice("greetingStyle", e.target.value)}
          placeholder={VOICE_OPTIONS.greetingStylePlaceholder}
          rows={3}
          className={s.textarea}
        />
        <div className={s.hint}>Describe how Iris should greet callers</div>
      </div>

      {/* Personality */}
      <div className={s.card}>
        <div className={s.sectionHeading}>Personality</div>
        <textarea
          value={voiceSettings.personality}
          onChange={e => updateVoice("personality", e.target.value)}
          placeholder={VOICE_OPTIONS.personalityPlaceholder}
          rows={3}
          className={s.textarea}
        />
        <div className={s.hint}>Describe the tone, style, and personality of your assistant</div>
      </div>

      {/* General Knowledge */}
      <div className={s.card}>
        <div className={s.sectionHeading}>General Knowledge</div>
        <textarea
          value={voiceSettings.generalKnowledge}
          onChange={e => updateVoice("generalKnowledge", e.target.value)}
          placeholder={VOICE_OPTIONS.generalKnowledgePlaceholder}
          rows={3}
          className={s.textarea}
        />
        <div className={s.hint}>Any background knowledge your assistant should have — local area, industry, etc.</div>
      </div>

      {/* Advanced Settings */}
      <div className={s.card}>
        <div className={s.sectionHeadingLg}>Advanced</div>
        <div className={s.gridGap16}>
          <div className={s.flexBetween}>
            <div>
              <div className={s.settingTitle}>Confirm before writing</div>
              <div className={s.settingDesc}>Ask for confirmation before creating or updating records</div>
            </div>
            <button
              onClick={() => updateVoice("confirmWrites", !voiceSettings.confirmWrites)}
              className={s.toggle}
              style={{ background: voiceSettings.confirmWrites ? accent : "#ccc" }}
            >
              <div className={s.toggleKnob} style={{ left: voiceSettings.confirmWrites ? 23 : 3 }} />
            </button>
          </div>
          <div>
            <div className={s.flexBetweenMb6}>
              <div>
                <div className={s.settingTitle}>Silence detection (ms)</div>
                <div className={s.settingDesc}>How long to wait after the caller stops speaking before responding</div>
              </div>
              <span className={s.rangeValue} style={{ color: accent }}>{voiceSettings.silenceDuration}ms</span>
            </div>
            <input
              type="range" min={200} max={1500} step={100} value={voiceSettings.silenceDuration}
              onChange={e => updateVoice("silenceDuration", Number(e.target.value))}
              className={s.rangeInput} style={{ accentColor: accent }}
            />
            <div className={s.rangeLabels}>
              <span>200ms (fast)</span><span>1500ms (patient)</span>
            </div>
          </div>
          <div>
            <div className={s.flexBetweenMb6}>
              <div>
                <div className={s.settingTitle}>Voice detection sensitivity</div>
                <div className={s.settingDesc}>How sensitive the mic is to picking up speech (lower = more sensitive)</div>
              </div>
              <span className={s.rangeValue} style={{ color: accent }}>{voiceSettings.vadThreshold}</span>
            </div>
            <input
              type="range" min={0.1} max={0.9} step={0.1} value={voiceSettings.vadThreshold}
              onChange={e => updateVoice("vadThreshold", Number(e.target.value))}
              className={s.rangeInput} style={{ accentColor: accent }}
            />
            <div className={s.rangeLabels}>
              <span>0.1 (very sensitive)</span><span>0.9 (less sensitive)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Config Summary */}
      <div className={s.cardMuted}>
        <div className={s.sectionHeading}>Current Configuration</div>
        <div className={s.gridAutoFillGap12}>
          <div><span className={s.configLabel}>Name:</span> <span className={s.configValue}>{voiceSettings.name}</span></div>
          <div><span className={s.configLabel}>Voice:</span> <span className={s.configValue}>{VOICE_OPTIONS.voices.find(v => v.id === voiceSettings.voice)?.label || voiceSettings.voice}</span></div>
          <div><span className={s.configLabel}>Greeting:</span> <span className={s.configValue}>{voiceSettings.greetingStyle ? (voiceSettings.greetingStyle.length > 60 ? voiceSettings.greetingStyle.slice(0, 60) + "…" : voiceSettings.greetingStyle) : "Not set"}</span></div>
          <div><span className={s.configLabel}>Personality:</span> <span className={s.configValue}>{voiceSettings.personality ? (voiceSettings.personality.length > 60 ? voiceSettings.personality.slice(0, 60) + "…" : voiceSettings.personality) : "Not set"}</span></div>
          <div><span className={s.configLabel}>General Knowledge:</span> <span className={s.configValue}>{voiceSettings.generalKnowledge ? (voiceSettings.generalKnowledge.length > 60 ? voiceSettings.generalKnowledge.slice(0, 60) + "…" : voiceSettings.generalKnowledge) : "Not set"}</span></div>
          <div><span className={s.configLabel}>Silence:</span> <span className={s.configValue}>{voiceSettings.silenceDuration}ms</span></div>
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
    const allPerms = useAppStore.getState().userPermissions;
    const getUserPerms = (userId) => {
      return allPerms[userId] || { ...DEFAULT_PERMISSIONS };
    };
    const saveUserPerms = async (userId, perms) => {
      useAppStore.getState().setUserPermissions(prev => ({ ...prev, [userId]: perms }));
      try { await dbSaveUserPermissions(userId, perms); } catch {}
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

    const handleSavePhone = async (st) => {
      setUpdateError(null);
      try {
        await updateStaffRecord(st.id, { phone: editPhoneVal.trim() });
        if (setStaff) { setStaff(prev => prev.map(x => x.id === st.id ? { ...x, phone: editPhoneVal.trim() } : x)); }
        setEditPhoneId(null);
        setEditPhoneVal("");
      } catch (err) { setUpdateError(`Failed to update phone: ${err.message}`); }
    };

    const [permEditRole, setPermEditRole] = useState(null);
    const openPermissions = (st) => { setPermEditId(st.id); setPermData(JSON.parse(JSON.stringify(getUserPerms(st.id)))); setPermEditRole(st.role || "staff"); };
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
        const sec = PERMISSION_SECTIONS.find(x => x.id === sectionId);
        const current = prev[sectionId] || [];
        return { ...prev, [sectionId]: current.length === sec.actions.length ? [] : [...sec.actions] };
      });
    };
    const savePermissions = async () => {
      saveUserPerms(permEditId, permData);
      const currentStaff = staff.find(x => x.id === permEditId);
      if (currentStaff && currentStaff.role !== permEditRole) {
        try {
          await updateStaffRecord(permEditId, { role: permEditRole });
          if (setStaff) { setStaff(prev => prev.map(x => x.id === permEditId ? { ...x, role: permEditRole } : x)); }
        } catch (err) { console.error('Failed to update role:', err); }
      }
      setPermEditId(null);
    };

    return (
      <div>
        <div className={s.flexBetweenMb}>
          <div>
            <div className={s.pageHeading}>User Management</div>
            <div className={s.pageSubheading}>{staff.length} team member{staff.length !== 1 ? "s" : ""}</div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11 }} onClick={() => { setShowInvite(true); setInviteSuccess(null); setInviteError(null); }}>
            <Icon name="plus" size={12} /> Invite User
          </button>
        </div>

        {updateError && (
          <div className={s.alertError}>{updateError}</div>
        )}

        {/* Invite form */}
        {showInvite && (
          <div className={s.card}>
            <div className={s.flexBetweenMbSm}>
              <div className={s.sectionTitle}>Invite New User</div>
              <CloseBtn onClick={() => { setShowInvite(false); setInviteSuccess(null); }} />
            </div>
            {inviteSuccess ? (
              <div className={s.cardSuccess}>
                <div className={s.inviteSuccessTitle}><Icon name="check" size={14} /> User created successfully</div>
                <div className={s.inviteGrid}>
                  <div><span className={s.configLabel}>Name:</span> <span className={s.configValue}>{inviteSuccess.fullName}</span></div>
                  <div><span className={s.configLabel}>Email:</span> <span className={s.configValue}>{inviteSuccess.email}</span></div>
                  <div className={s.tempPasswordBox}>
                    <div className={s.tempPasswordLabel}>Temporary Password</div>
                    <div className={s.tempPasswordValue}>{inviteSuccess.temporaryPassword}</div>
                    <div className={s.tempPasswordHint}>Share this securely. They should change it on first login.</div>
                  </div>
                </div>
                <button className="btn btn-sm" style={{ marginTop: 12, fontSize: 11 }} onClick={() => setInviteSuccess(null)}>Invite Another</button>
              </div>
            ) : (
              <form onSubmit={handleInvite}>
                {inviteError && <div className={s.alertErrorSmall}>{inviteError}</div>}
                <div className={s.grid2Mb}>
                  <div>
                    <label className={s.label}>Full Name</label>
                    <input type="text" value={inviteForm.fullName} onChange={e => setInviteForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Tom Baker" required className={s.inputBase} />
                  </div>
                  <div>
                    <label className={s.label}>Email</label>
                    <input type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="tom@company.com" required className={s.inputBase} />
                  </div>
                </div>
                <div className={s.mb12}>
                  <label className={s.label}>Phone Number</label>
                  <input type="tel" value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="0412 345 678" className={s.inputNarrow} />
                  <div className={s.hintSm}>Used by the voice assistant to route calls to this user's caller memory</div>
                </div>
                <div className={s.mb16}>
                  <label className={s.label}>Password (optional)</label>
                  <input type="text" value={inviteForm.password} onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))} placeholder="Auto-generated if blank" className={s.inputNarrow} />
                </div>
                <div className={s.flexEnd}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowInvite(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: inviteLoading ? 0.6 : 1 }} disabled={inviteLoading}>{inviteLoading ? "Creating..." : "Create User"}</button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Users list */}
        <div className={s.flexCol}>
          {staff.length === 0 && <div className={s.emptyState}>No users found</div>}
          {staff.map(st => {
            const initials = st.name?.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";
            const isSelf = auth.staff?.id === st.id;
            const perms = getUserPerms(st.id);
            const { total: permTotal, enabled: permEnabled } = countPerms(perms);
            return (
              <div key={st.id} className={s.userCard} style={{ opacity: st.active ? 1 : 0.5 }}>
                <div className={s.userCardInner}>
                  <div className={st.active ? s.userAvatarActive : s.userAvatarInactive}>{initials}</div>
                  <div className={s.flex1}>
                    <div className={s.userName}>{st.name}{isSelf ? " (you)" : ""}{st.role === "admin" && <span className={s.adminBadge}>Admin</span>}</div>
                    <div className={s.userMeta}>
                      <span>{st.email}</span>
                      {editPhoneId === st.id ? (
                        <span className={s.phoneEditInline}>
                          <input type="tel" value={editPhoneVal} onChange={e => setEditPhoneVal(e.target.value)} placeholder="0412 345 678" autoFocus onKeyDown={e => { if (e.key === "Enter") handleSavePhone(st); if (e.key === "Escape") setEditPhoneId(null); }} className={s.inputSmInline} />
                          <button onClick={() => handleSavePhone(st)} className={s.phoneSaveBtn}>Save</button>
                          <button onClick={() => setEditPhoneId(null)} className={s.phoneCancelBtn}>Cancel</button>
                        </span>
                      ) : (
                        <span onClick={() => { setEditPhoneId(st.id); setEditPhoneVal(st.phone || ""); }} className={s.phoneClickable} style={{ color: st.phone ? "#555" : "#ccc" }} title="Click to edit phone">
                          {st.phone || "Add phone"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={s.userCardActions}>
                    <span className={s.permBadge} style={{ color: permEnabled === permTotal ? "#059669" : "#f59e0b" }}>{permEnabled}/{permTotal} permissions</span>
                    <button onClick={() => openPermissions(st)} className={s.permBtnSm}>Permissions</button>
                    {!isSelf && (
                      <>
                        <button onClick={() => handleResetPassword(st)} className={s.userActionBtn}>Reset PW</button>
                        <button onClick={() => handleToggleActive(st)} className={s.userToggleBtn} style={{ color: st.active ? "#dc2626" : "#059669" }}>{st.active ? "Deactivate" : "Activate"}</button>
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
          <div className={s.modalOverlay} onClick={() => setPermEditId(null)}>
            <div className={s.modalContentPermissions} onClick={e => e.stopPropagation()}>
              <div className={s.modalTitleSm}>Permissions</div>
              <div className={s.modalSubtitle}>{staff.find(x => x.id === permEditId)?.name} — {(() => { const c = countPerms(permData); return `${c.enabled}/${c.total} enabled`; })()}</div>

              <div className={s.adminToggleRow}>
                <div className={s.adminToggleLeft}>
                  <span className={s.adminToggleLabel}>Admin</span>
                  <span className={s.adminToggleDesc}>Full access to all settings, user management, and data</span>
                </div>
                <button
                  onClick={() => setPermEditRole(r => r === "admin" ? "staff" : "admin")}
                  className={permEditRole === "admin" ? s.adminToggleOn : s.adminToggleOff}
                >{permEditRole === "admin" ? "On" : "Off"}</button>
              </div>

              <div className={s.permSectionList}>
                {PERMISSION_SECTIONS.map(sec => {
                  const enabled = permData[sec.id] || [];
                  const allOn = enabled.length === sec.actions.length;
                  const anyOn = enabled.length > 0;
                  return (
                    <div key={sec.id} className={anyOn ? s.permSectionActive : s.permSectionInactive}>
                      {/* Section header */}
                      <div onClick={() => toggleAllSection(sec.id)} className={anyOn ? s.permSectionHeaderActive : s.permSectionHeader}>
                        <input type="checkbox" checked={allOn} readOnly className={s.permCheckbox} />
                        <span className={anyOn ? s.permSectionLabelActive : s.permSectionLabelInactive}>{sec.label}</span>
                        <span className={s.permCount}>{enabled.length}/{sec.actions.length}</span>
                      </div>
                      {/* Action toggles */}
                      {anyOn && (
                        <div className={s.permActions}>
                          {sec.actions.map(action => {
                            const isOn = enabled.includes(action);
                            return (
                              <button key={action} onClick={() => toggleAction(sec.id, action)} className={isOn ? s.permActionBtnOn : s.permActionBtnOff}>{ACTION_LABELS[action]}</button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={s.flexEnd}>
                <button onClick={() => setPermEditId(null)} className={s.btnCancel}>Cancel</button>
                <button onClick={savePermissions} className={s.btnPrimary} style={{ background: accent }}>Save Permissions</button>
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
      <div className={s.tabBar}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`btn ${s.tabBtn}`}
            style={{
              borderBottom: tab === t.id ? `2px solid ${accent}` : undefined,
              color: tab === t.id ? "#111" : undefined,
            }}
          >
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {tab === "company" && (
        <div>
          <div className={s.flexBetweenMb}>
            <div>
              <div className={s.pageHeading}>Company Information</div>
              <div className={s.pageSubheading}>Your company details used across the app and document templates</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: companyDirty ? 1 : 0.5 }} onClick={saveCompanyInfo} disabled={!companyDirty}>
              {companySaved ? "Saved!" : "Save Changes"}
            </button>
          </div>
          {companySaved && (
            <div className={s.alertSuccessFlex}>
              <Icon name="check" size={14} /> Company information saved.
            </div>
          )}
          <div className={s.card}>
            <div className={s.grid2Mb}>
              <div>
                <label className={s.label}>Company Name</label>
                <input value={companyForm.companyName} onChange={e => updateCompanyField("companyName", e.target.value)} className={s.inputLg} />
              </div>
              <div>
                <label className={s.label}>ABN</label>
                <input value={companyForm.abn} onChange={e => updateCompanyField("abn", e.target.value)} className={s.inputLg} />
              </div>
            </div>
            <AddressFields id="company-addr" values={{ address: companyForm.address, suburb: companyForm.suburb, state: companyForm.state, postcode: companyForm.postcode }} onChange={(field, val) => updateCompanyField(field, val)} />
            <div className={s.grid2}>
              <div>
                <label className={s.label}>Phone</label>
                <input value={companyForm.phone} onChange={e => updateCompanyField("phone", e.target.value)} className={s.inputLg} />
              </div>
              <div>
                <label className={s.label}>Email</label>
                <input value={companyForm.email} onChange={e => updateCompanyField("email", e.target.value)} className={s.inputLg} />
              </div>
            </div>
            <div className={s.mb12}>
              <label className={s.label}>Timezone</label>
              <select value={companyForm.timezone || "Australia/Sydney"} onChange={e => updateCompanyField("timezone", e.target.value)} className={s.inputLg}>
                {TIMEZONE_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>
          <div className={s.companyFooter}>
            These details are used as defaults across the app. Document templates can override the email address per template in the Templates tab.
          </div>
        </div>
      )}
      {tab === "integrations" && voiceIntegrationContent}
      {tab === "outbound" && (
        <div>
          <div className={s.flexBetweenMb}>
            <div>
              <div className={s.pageHeading}>Outbound Call Assistant</div>
              <div className={s.pageSubheading}>Configure AI-powered outbound calls to team members about urgent tasks</div>
              <div className={s.pageSubheadingMuted}>These are the company defaults. Staff can personalise their own assistant in My Assistant.</div>
            </div>
            <div className={s.flexGap8}>
              <button className="btn btn-primary btn-sm" style={{ background: accent, fontSize: 11, opacity: outboundDirty ? 1 : 0.5 }} onClick={saveOutboundSettings} disabled={!outboundDirty}>
                {outboundSaved ? "Saved!" : "Save Changes"}
              </button>
            </div>
          </div>

          {outboundSaved && (
            <div className={s.alertSuccessFlex}>
              <Icon name="check" size={14} /> Outbound settings saved.
            </div>
          )}
          {testCallStatus && (
            <div className={s.alertInfo}>{testCallStatus}</div>
          )}

          {/* Enable toggle */}
          <div className={s.outboundEnableCard}>
            <div>
              <div className={s.sectionTitle}>Enable Outbound Calls</div>
              <div className={s.pageSubheading}>Allow the AI assistant to make outbound calls to team members</div>
            </div>
            <button onClick={() => updateOutbound("enabled", !outboundSettings.enabled)} className={s.toggle} style={{ background: outboundSettings.enabled ? "#059669" : "#ccc" }}>
              <div className={s.toggleKnob} style={{ left: outboundSettings.enabled ? 23 : 3 }} />
            </button>
          </div>

          {/* AI Personality */}
          <div className={s.card}>
            <div className={s.sectionHeading}>AI Personality</div>
            <div className={s.grid2Mb}>
              <div>
                <label className={s.label}>Name</label>
                <input value={outboundSettings.name} onChange={e => updateOutbound("name", e.target.value)} placeholder="e.g. Iris" className={s.inputLg} />
              </div>
              <div>
                <label className={s.label}>Voice</label>
                <select value={outboundSettings.voice} onChange={e => updateOutbound("voice", e.target.value)} className={s.inputBase}>
                  {VOICE_OPTIONS.voices.map(v => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
                </select>
              </div>
            </div>
            <label className={s.label}>Greeting Style</label>
            <textarea value={outboundSettings.greetingStyle} onChange={e => updateOutbound("greetingStyle", e.target.value)} rows={2} className={s.textareaMb} />
            <label className={s.label}>Personality</label>
            <textarea value={outboundSettings.personality} onChange={e => updateOutbound("personality", e.target.value)} rows={2} className={s.textarea} />
          </div>

          {/* Team Contacts */}
          <div className={s.card}>
            <div className={s.flexBetweenMb12}>
              <div className={s.sectionHeading} style={{ marginBottom: 0 }}>Team Contacts</div>
              <button onClick={openNewTeamMember} className={s.teamAddBtn} style={{ background: accent }}>+ Add</button>
            </div>
            {outboundSettings.team.length === 0 ? (
              <div className={s.emptyStateMd}>No team members added</div>
            ) : (
              <div className={s.flexCol}>
                {outboundSettings.team.map(m => (
                  <div key={m.id} className={s.teamRow}>
                    <button onClick={() => toggleTeamMemberCall(m.id)} className={s.toggleSm} style={{ background: m.callEnabled ? "#059669" : "#ccc", flexShrink: 0 }}>
                      <div className={s.toggleKnobSm} style={{ left: m.callEnabled ? 19 : 3 }} />
                    </button>
                    <div className={s.flex1}>
                      <div className={s.teamMemberName}>{m.name}</div>
                      <div className={s.teamMemberInfo}>{m.phone} {m.role ? `· ${m.role}` : ""}</div>
                    </div>
                    <button onClick={() => triggerTestCall(m)} className={s.testCallBtn}>Test Call</button>
                    <button onClick={() => openEditTeamMember(m)} className={s.teamActionBtn}>✎</button>
                    <button onClick={() => removeTeamMember(m.id)} className={s.teamDeleteBtn}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call Rules */}
          <div className={s.card}>
            <div className={s.sectionHeadingLg}>Call Rules</div>
            <div className={s.grid2Gap16}>
              <div>
                <label className={s.label}>Min. Severity</label>
                <select value={outboundSettings.callRules.minSeverity} onChange={e => updateCallRule("minSeverity", e.target.value)} className={s.inputBase}>
                  <option value="high">High only</option>
                  <option value="medium">Medium and above</option>
                  <option value="low">All severities</option>
                </select>
              </div>
              <div>
                <label className={s.label}>Max Calls / Day</label>
                <input type="number" min={1} max={10} value={outboundSettings.callRules.maxCallsPerDay} onChange={e => updateCallRule("maxCallsPerDay", Number(e.target.value))} className={s.inputBase} />
              </div>
              <div>
                <label className={s.label}>Call Window Start</label>
                <input type="time" value={outboundSettings.callRules.callWindowStart} onChange={e => updateCallRule("callWindowStart", e.target.value)} className={s.inputBase} />
              </div>
              <div>
                <label className={s.label}>Call Window End</label>
                <input type="time" value={outboundSettings.callRules.callWindowEnd} onChange={e => updateCallRule("callWindowEnd", e.target.value)} className={s.inputBase} />
              </div>
            </div>
          </div>

          {/* Team member modal */}
          {showTeamModal && (
            <div className={s.modalOverlay} onClick={() => setShowTeamModal(false)}>
              <div className={s.modalContentSm} onClick={e => e.stopPropagation()}>
                <div className={s.modalTitle}>{editTeamMember ? "Edit Team Member" : "Add Team Member"}</div>
                <label className={s.label}>Name</label>
                <input value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tom Baker" className={s.inputModalMb} autoFocus />
                <label className={s.label}>Phone</label>
                <input value={teamForm.phone} onChange={e => setTeamForm(f => ({ ...f, phone: e.target.value }))} placeholder="+61400000000" className={s.inputModalMb} />
                <label className={s.label}>Role</label>
                <input value={teamForm.role} onChange={e => setTeamForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Site Manager" className={s.inputModalMbLast} />
                <div className={s.flexEnd}>
                  <button onClick={() => setShowTeamModal(false)} className={s.btnCancel}>Cancel</button>
                  <button onClick={saveTeamMember} className={s.btnPrimary} style={{ background: accent }}>{editTeamMember ? "Save" : "Add"}</button>
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
        const saveTemplate = async () => {
          if (!tplForm.name.trim()) return;
          const updated = editTemplate === "new"
            ? [...templates, { ...tplForm, id: Date.now() }]
            : templates.map(t => t.id === editTemplate ? { ...tplForm } : t);
          setTemplates(updated);
          try { await dbSaveTemplates(updated); } catch {}
          setEditTemplate(null);
        };
        const deleteTemplate = async (id) => {
          const updated = templates.filter(t => t.id !== id);
          setTemplates(updated);
          try { await dbSaveTemplates(updated); } catch {}
        };
        const setDefault = async (id) => {
          const updated = templates.map(t => t.type === docType ? { ...t, isDefault: t.id === id } : t);
          setTemplates(updated);
          try { await dbSaveTemplates(updated); } catch {}
        };

        if (editTemplate !== null && tplForm) {
          // ── Template Editor ──
          return (
            <div>
              <div className={s.flexGap8} style={{ alignItems: "center", marginBottom: 20 }}>
                <button onClick={() => setEditTemplate(null)} className={s.tplBackBtn}>&larr;</button>
                <div className={s.pageHeading}>{editTemplate === "new" ? "New Template" : "Edit Template"}</div>
                <div className={s.tplHeaderActions}>
                  <button onClick={() => setEditTemplate(null)} className={s.btnCancel} style={{ fontSize: 12, padding: "6px 14px" }}>Cancel</button>
                  <button onClick={saveTemplate} className={s.btnPrimary} style={{ background: accent, fontSize: 12, padding: "6px 14px" }}>Save Template</button>
                </div>
              </div>

              {/* Template name */}
              <div className={s.card}>
                <label className={s.label}>Template Name</label>
                <input value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Premium, Minimal, Branded" className={s.inputNarrowLg} autoFocus />
              </div>

              {/* Company Details (inherited from Settings > Company) */}
              <div className={s.card}>
                <div className={s.flexBetweenMb12}>
                  <div className={s.sectionHeading} style={{ marginBottom: 0 }}>Company Details</div>
                  <span className={s.fromCompanyHint}>From Settings &gt; Company</span>
                </div>
                <div className={s.grid4}>
                  <div className={s.tplCompanyDetailBox}>
                    <div className={s.tplCompanyDetailLabel}>Company</div>
                    <div className={s.tplCompanyDetailValue}>{companyInfo.companyName}</div>
                  </div>
                  <div className={s.tplCompanyDetailBox}>
                    <div className={s.tplCompanyDetailLabel}>ABN</div>
                    <div className={s.tplCompanyDetailValue}>{companyInfo.abn}</div>
                  </div>
                  <div className={s.tplCompanyDetailBox}>
                    <div className={s.tplCompanyDetailLabel}>Address</div>
                    <div className={s.tplCompanyDetailValue}>{formatAddress(companyInfo)}</div>
                  </div>
                  <div className={s.tplCompanyDetailBox}>
                    <div className={s.tplCompanyDetailLabel}>Phone</div>
                    <div className={s.tplCompanyDetailValue}>{companyInfo.phone}</div>
                  </div>
                </div>
                <div>
                  <label className={s.label}>Template Email <span className={s.tplLabelOverride}>(override per template)</span></label>
                  <input value={tplForm.email} onChange={e => setTplForm(f => ({ ...f, email: e.target.value }))} className={s.inputNarrow} />
                </div>
              </div>

              {/* Branding */}
              <div className={s.card}>
                <div className={s.sectionHeading}>Branding</div>
                <div className={s.grid2Mb}>
                  <div>
                    <label className={s.label}>Accent Colour</label>
                    <div className={s.flexGap8} style={{ alignItems: "center" }}>
                      <input type="color" value={tplForm.accentColor} onChange={e => setTplForm(f => ({ ...f, accentColor: e.target.value }))} className={s.inputColor} />
                      <input value={tplForm.accentColor} onChange={e => setTplForm(f => ({ ...f, accentColor: e.target.value }))} className={s.inputMono} />
                    </div>
                  </div>
                  <div>
                    <label className={s.label}>Logo</label>
                    <div className={s.flexGap8} style={{ alignItems: "center" }}>
                      {tplForm.logo && <img src={tplForm.logo} alt="Logo" className={s.logoPreview} />}
                      <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => setTplForm(f => ({ ...f, logo: reader.result })); reader.readAsDataURL(file); } }} className={s.fileInput} />
                      {tplForm.logo && <button onClick={() => setTplForm(f => ({ ...f, logo: null }))} className={s.removeBtn}>Remove</button>}
                    </div>
                  </div>
                </div>
                <div className={s.flexGap8} style={{ alignItems: "center" }}>
                  <label className={s.showGstLabel}>Show GST</label>
                  <button onClick={() => setTplForm(f => ({ ...f, showGst: !f.showGst }))} className={s.toggleSm} style={{ background: tplForm.showGst ? "#059669" : "#ccc" }}>
                    <div className={s.toggleKnobSm} style={{ left: tplForm.showGst ? 19 : 3 }} />
                  </button>
                </div>
              </div>

              {/* Column Visibility */}
              {(tplForm.type === "quote" || tplForm.type === "invoice") && (
                <div className={s.card}>
                  <div className={s.sectionHeading}>Line Item Columns</div>
                  <div className={s.flexWrap}>
                    {[{ id: "description", label: "Description", required: true }, { id: "qty", label: "Quantity" }, { id: "unit", label: "Unit" }, { id: "unitPrice", label: "Unit Price" }, { id: "lineTotal", label: "Line Total" }, { id: "gst", label: "GST" }].map(col => {
                      const cols = tplForm.columns || DEFAULT_COLUMNS;
                      const isOn = cols[col.id] !== false;
                      return (
                        <button key={col.id} onClick={() => !col.required && setTplForm(f => ({ ...f, columns: { ...(f.columns || DEFAULT_COLUMNS), [col.id]: !isOn } }))} className={col.required ? s.colToggleBtnRequired : (isOn ? s.colToggleBtnOn : s.colToggleBtnOff)}>{col.label}</button>
                      );
                    })}
                  </div>
                  <div className={s.hint} style={{ marginTop: 8 }}>Toggle which columns appear on the document. Description is always shown.</div>
                </div>
              )}

              {/* Document Preview */}
              <div className={s.card}>
                <div className={s.flexBetweenMb12}>
                  <div className={s.sectionHeading} style={{ marginBottom: 0 }}>Preview</div>
                  <button onClick={() => {
                    const el = document.getElementById("tpl-preview");
                    if (!el) return;
                    const w = window.open("", "_blank", "width=800,height=1000");
                    w.document.write(`<html><head><title>${tplForm.type} Preview</title><style>body{margin:0;padding:40px;font-family:Arial,sans-serif;font-size:12px}@media print{body{padding:20px}}</style></head><body>${el.innerHTML}<script>setTimeout(()=>window.print(),300)</script></body></html>`);
                    w.document.close();
                  }} className={s.downloadPdfBtn}>
                    <span className={s.downloadIcon}>&#8595;</span> Download PDF
                  </button>
                </div>
                <div id="tpl-preview" className={s.previewContainer}>
                  {/* Header */}
                  <div className={s.previewHeader} style={{ borderBottom: `2px solid ${tplForm.accentColor}` }}>
                    <div>
                      {tplForm.logo && <img src={tplForm.logo} alt="Logo" className={s.previewLogo} />}
                      <div className={s.previewCompanyName} style={{ color: tplForm.accentColor }}>{companyInfo.companyName}</div>
                      {companyInfo.abn && <div className={s.previewSmallMuted}>ABN: {companyInfo.abn}</div>}
                      <div className={s.previewSmallMuted}>{formatAddress(companyInfo)}</div>
                      <div className={s.previewSmallMuted}>{companyInfo.phone} | {tplForm.email}</div>
                    </div>
                    <div className={s.previewRight}>
                      <div className={s.previewDocType} style={{ color: tplForm.accentColor }}>{tplForm.type === "work_order" ? "Work Order" : tplForm.type === "purchase_order" ? "Purchase Order" : tplForm.type.charAt(0).toUpperCase() + tplForm.type.slice(1)}</div>
                      <div className={s.previewDocMeta}>#Q-0001</div>
                      <div className={s.previewDocMetaSm}>Date: 18/03/2026</div>
                    </div>
                  </div>
                  {/* Client */}
                  <div className={s.previewBillTo}>
                    <div className={s.previewBillToLabel}>Bill To</div>
                    <div className={s.previewBillToName}>Hartwell Properties</div>
                    <div className={s.previewBillToAddr}>22 King St, Sydney NSW 2000</div>
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
                    const subtotal = sampleItems.reduce((sum, i) => sum + i.qty * i.rate, 0);
                    const gstAmt = tplForm.showGst ? subtotal * 0.1 : 0;
                    return (
                      <>
                        <table className={s.previewTable}>
                          <colgroup>
                            <col />
                            {cols.qty !== false && <col style={{ width: colW }} />}
                            {cols.unit !== false && <col style={{ width: colW }} />}
                            {cols.unitPrice !== false && <col style={{ width: colW }} />}
                            {cols.lineTotal !== false && <col style={{ width: colW }} />}
                          </colgroup>
                          <thead>
                            <tr style={{ background: tplForm.accentColor }}>
                              <th className={s.previewTh}>Description</th>
                              {cols.qty !== false && <th className={s.previewThRight}>Qty</th>}
                              {cols.unit !== false && <th className={s.previewThCenter}>Unit</th>}
                              {cols.unitPrice !== false && <th className={s.previewThRight}>Unit Price</th>}
                              {cols.lineTotal !== false && <th className={s.previewThRight}>Total</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {sampleItems.map((item, i) => (
                              <tr key={i} className={s.previewTr}>
                                <td className={s.previewTd}>{item.desc}</td>
                                {cols.qty !== false && <td className={s.previewTdRight}>{item.qty}</td>}
                                {cols.unit !== false && <td className={s.previewTdCenter}>{item.unit}</td>}
                                {cols.unitPrice !== false && <td className={s.previewTdRight}>${item.rate.toLocaleString()}</td>}
                                {cols.lineTotal !== false && <td className={s.previewTdRight}>${(item.qty * item.rate).toLocaleString()}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className={s.previewTotals}>
                          <div className={s.previewTotalsBox}>
                            <div className={s.previewTotalRow}><span>Subtotal</span><span>${subtotal.toLocaleString()}</span></div>
                            {tplForm.showGst && cols.gst !== false && <div className={s.previewTotalRow}><span>GST (10%)</span><span>${gstAmt.toLocaleString()}</span></div>}
                            <div className={s.previewTotalFinal}><span>Total</span><span>${(subtotal + gstAmt).toLocaleString()}</span></div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  {/* Terms & Footer */}
                  {tplForm.terms && <div className={s.previewTerms}><strong>Terms:</strong> {tplForm.terms}</div>}
                  {tplForm.footer && <div className={s.previewFooter}>{tplForm.footer}</div>}
                </div>
              </div>

              {/* Footer & Terms */}
              <div className={s.card}>
                <div className={s.sectionHeading}>Footer & Terms</div>
                <label className={s.label}>Footer Text</label>
                <input value={tplForm.footer} onChange={e => setTplForm(f => ({ ...f, footer: e.target.value }))} placeholder="e.g. Thank you for your business." className={s.inputBase} style={{ marginBottom: 12 }} />
                <label className={s.label}>Terms & Conditions</label>
                <textarea value={tplForm.terms} onChange={e => setTplForm(f => ({ ...f, terms: e.target.value }))} rows={3} className={s.textarea} />
              </div>

              {/* Email Template */}
              {(() => {
                const sampleVars = { clientName: "James Hartwell", number: "Q-0001", total: "$5,445", subtotal: "$4,950", dueDate: "01/04/2026", jobTitle: "Office Fitout – Level 3", companyName: companyInfo.companyName, date: "18/03/2026", type: tplForm.type === "work_order" ? "work order" : tplForm.type === "purchase_order" ? "purchase order" : tplForm.type };
                const replaceVars = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] || `{{${key}}}`);
                return (
                  <div className={s.card}>
                    <div className={s.flexBetweenMb12}>
                      <div className={s.sectionHeading} style={{ marginBottom: 0 }}>Email Template</div>
                      <button onClick={() => setTplForm(f => ({ ...f, _showEmailPreview: !f._showEmailPreview }))} className={s.downloadPdfBtn}>
                        {tplForm._showEmailPreview ? "Edit" : "Preview"}
                      </button>
                    </div>
                    {tplForm._showEmailPreview ? (
                      <div className={s.emailPreviewWrap}>
                        {/* Email header */}
                        <div className={s.emailHeader}>
                          <div className={s.emailHeaderRow}>
                            <span className={s.emailHeaderLabel}>From:</span>
                            <span className={s.emailHeaderValue}>{companyInfo.companyName} &lt;{tplForm.email}&gt;</span>
                          </div>
                          <div className={s.emailHeaderRow}>
                            <span className={s.emailHeaderLabel}>To:</span>
                            <span className={s.emailHeaderValue}>James Hartwell &lt;james@hartwell.com&gt;</span>
                          </div>
                          <div className={s.emailHeaderRowLast}>
                            <span className={s.emailHeaderLabel}>Subject:</span>
                            <span className={s.emailSubjectValue}>{replaceVars(tplForm.emailSubject)}</span>
                          </div>
                        </div>
                        {/* Email body */}
                        <div className={s.emailBody}>
                          {replaceVars(tplForm.emailBody)}
                        </div>
                        {/* Attachment indicator */}
                        <div className={s.emailAttachment}>
                          <span className={s.emailAttachIcon}>&#128206;</span>
                          <span className={s.emailAttachName}>{tplForm.type === "work_order" ? "Work_Order" : tplForm.type === "purchase_order" ? "Purchase_Order" : tplForm.type.charAt(0).toUpperCase() + tplForm.type.slice(1)}_Q-0001.pdf</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <label className={s.label}>Subject</label>
                        <input value={tplForm.emailSubject} onChange={e => setTplForm(f => ({ ...f, emailSubject: e.target.value }))} className={s.inputBase} style={{ marginBottom: 12 }} />
                        <label className={s.label}>Body</label>
                        <textarea value={tplForm.emailBody} onChange={e => setTplForm(f => ({ ...f, emailBody: e.target.value }))} rows={6} className={s.textarea} style={{ marginBottom: 12 }} />
                        <div className={s.varsBox}>
                          <div className={s.varsBoxLabel}>Available Variables</div>
                          <div className={s.varsWrap}>
                            {TEMPLATE_VARS.map(v => (
                              <span key={v.var} title={v.desc} className={s.varTag}>{v.var}</span>
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
            <div className={s.flexBetweenMb}>
              <div>
                <div className={s.pageHeading}>Document & Email Templates</div>
                <div className={s.pageSubheading}>Manage PDF layouts and email templates for each document type</div>
              </div>
              <button onClick={openNewTemplate} className={s.newTemplateBtn} style={{ background: accent }}>+ New Template</button>
            </div>

            {/* Document type tabs */}
            <div className={s.docTypeBar}>
              {DOC_TYPES.map(dt => (
                <button key={dt.id} onClick={() => setDocType(dt.id)} className={docType === dt.id ? s.docTypeBtnActive : s.docTypeBtn} style={docType === dt.id ? { background: accent } : undefined}>{dt.label}</button>
              ))}
            </div>

            {/* Templates for selected type */}
            {typeTemplates.length === 0 ? (
              <div className={s.emptyStateLg}>No templates for this document type</div>
            ) : (
              <div className={s.flexCol}>
                {typeTemplates.map(tpl => (
                  <div key={tpl.id} onClick={() => openEditTemplate(tpl)} className={s.tplListItem}>
                    {/* Colour swatch */}
                    <div className={s.tplSwatch} style={{ background: tpl.accentColor }} />
                    <div className={s.flex1}>
                      <div className={s.tplName}>{tpl.name}</div>
                      <div className={s.tplMeta}>{tpl.companyName} {tpl.logo ? "· Logo" : ""}</div>
                    </div>
                    {tpl.isDefault && <span className={s.tplDefaultBadge}>Default</span>}
                    {!tpl.isDefault && (
                      <button onClick={e => { e.stopPropagation(); setDefault(tpl.id); }} className={s.tplSetDefaultBtn}>Set Default</button>
                    )}
                    {!tpl.isDefault && (
                      <button onClick={e => { e.stopPropagation(); deleteTemplate(tpl.id); }} className={s.tplDeleteBtn}>🗑</button>
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

      <div className={s.appVersion}>
        v{__APP_VERSION__} · {__APP_COMMIT__} · {new Date(__APP_BUILD_DATE__).toLocaleDateString()}
      </div>
    </div>
  );
};

// ── Files Page ──────────────────────────────────────────────────────────────


export { VOICE_OPTIONS, DEFAULT_VOICE_SETTINGS, DEFAULT_OUTBOUND_SETTINGS, VoiceOptionCard };
export default memo(Settings);
