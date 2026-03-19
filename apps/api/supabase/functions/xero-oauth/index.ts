import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getAdminClient,
  corsPreflightOrMethodCheck,
  json,
  verifyAdmin,
} from "../_shared/xero-client.ts";

const XERO_CLIENT_ID = Deno.env.get("XERO_CLIENT_ID")!;
const XERO_CLIENT_SECRET = Deno.env.get("XERO_CLIENT_SECRET")!;
const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_REVOKE_URL = "https://identity.xero.com/connect/revocation";

// ── PKCE helpers ────────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generatePKCE() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = base64url(digest);
  return { verifier, challenge };
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = corsPreflightOrMethodCheck(req);
  if (preflight) return preflight;

  // All OAuth actions require admin
  const { error: authError } = await verifyAdmin(req);
  if (authError) return authError;

  let body: { action: string; code?: string; codeVerifier?: string; redirectUri?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action } = body;

  // ── STATUS ──────────────────────────────────────────────────────────────
  if (action === "status") {
    const admin = getAdminClient();
    const { data } = await admin
      .from("xero_connections")
      .select("tenant_name, connected_at, is_active")
      .eq("is_active", true)
      .single();
    return json({
      connected: !!data,
      tenantName: data?.tenant_name || null,
      connectedAt: data?.connected_at || null,
    });
  }

  // ── AUTHORIZE ───────────────────────────────────────────────────────────
  if (action === "authorize") {
    const redirectUri = body.redirectUri;
    if (!redirectUri) return json({ error: "redirectUri required" }, 400);

    const { verifier, challenge } = await generatePKCE();
    const scopes = "openid profile email accounting.transactions accounting.contacts offline_access";
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      response_type: "code",
      client_id: XERO_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    return json({
      authUrl: `${XERO_AUTH_URL}?${params.toString()}`,
      codeVerifier: verifier,
      state,
    });
  }

  // ── CALLBACK ────────────────────────────────────────────────────────────
  if (action === "callback") {
    const { code, codeVerifier, redirectUri } = body;
    if (!code || !codeVerifier || !redirectUri) {
      return json({ error: "code, codeVerifier, and redirectUri required" }, 400);
    }

    // Exchange auth code for tokens
    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: XERO_CLIENT_ID,
        client_secret: XERO_CLIENT_SECRET,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return json({ error: "Token exchange failed", details: err }, 502);
    }

    const tokens = await tokenRes.json();

    // Fetch connected tenants (organizations)
    const connRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!connRes.ok) {
      return json({ error: "Failed to fetch Xero tenants" }, 502);
    }

    const tenants = await connRes.json();
    if (!tenants.length) {
      return json({ error: "No Xero organizations found" }, 404);
    }

    // If multiple tenants, return list for user to choose
    if (tenants.length > 1) {
      return json({
        chooseTenant: true,
        tenants: tenants.map((t: any) => ({
          tenantId: t.tenantId,
          tenantName: t.tenantName,
        })),
        // Store tokens temporarily — frontend will call back with chosen tenant
        tokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
        },
      });
    }

    // Single tenant — save connection
    const tenant = tenants[0];
    const admin = getAdminClient();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Deactivate any existing connections first
    await admin.from("xero_connections").update({ is_active: false }).eq("is_active", true);

    await admin.from("xero_connections").insert({
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      is_active: true,
    });

    return json({
      connected: true,
      tenantName: tenant.tenantName,
      tenantId: tenant.tenantId,
    });
  }

  // ── SELECT TENANT (multi-org) ───────────────────────────────────────────
  if (action === "selectTenant") {
    const { tenantId, tenantName, tokens } = body as any;
    if (!tenantId || !tokens?.accessToken) {
      return json({ error: "tenantId and tokens required" }, 400);
    }

    const admin = getAdminClient();
    const expiresAt = new Date(Date.now() + (tokens.expiresIn || 1800) * 1000).toISOString();

    await admin.from("xero_connections").update({ is_active: false }).eq("is_active", true);

    await admin.from("xero_connections").insert({
      tenant_id: tenantId,
      tenant_name: tenantName,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: expiresAt,
      is_active: true,
    });

    return json({ connected: true, tenantName, tenantId });
  }

  // ── DISCONNECT ──────────────────────────────────────────────────────────
  if (action === "disconnect") {
    const admin = getAdminClient();
    const { data: conn } = await admin
      .from("xero_connections")
      .select("refresh_token")
      .eq("is_active", true)
      .single();

    if (conn?.refresh_token) {
      // Revoke token at Xero
      await fetch(XERO_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: conn.refresh_token,
          client_id: XERO_CLIENT_ID,
          client_secret: XERO_CLIENT_SECRET,
        }),
      }).catch(() => {}); // Best effort
    }

    await admin.from("xero_connections").update({ is_active: false }).eq("is_active", true);

    return json({ disconnected: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
