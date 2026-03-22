import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "../lib/store";
import { useAuth } from "../lib/AuthContext";
import { Icon } from "../components/Icon";
import { CloseBtn, BILL_CATEGORIES } from "../components/shared";
import { SECTION_COLORS, DEFAULT_COLUMNS, SEED_TEMPLATES } from "../fixtures/seedData.jsx";
import { supabase, inviteUser, updateStaffRecord, xeroOAuth, xeroSyncInvoice, xeroSyncBill, xeroSyncContact, xeroPollUpdates, xeroFetchAccounts, xeroGetMappings, xeroSaveMappings } from "../lib/supabase";
import { adminResetUserPassword } from "../lib/auth";

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


export { VOICE_OPTIONS, DEFAULT_VOICE_SETTINGS, DEFAULT_OUTBOUND_SETTINGS, VoiceOptionCard };
export default Settings;
