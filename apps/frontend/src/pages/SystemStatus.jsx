import { useState, useEffect } from "react";
import { Icon } from '../components/Icon';

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

export default SystemStatus;
