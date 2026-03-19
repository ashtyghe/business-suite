/**
 * Shared Xero API client used by all xero-* edge functions.
 *
 * Responsibilities:
 *  - Token management (read, auto-refresh, persist)
 *  - Authenticated fetch wrapper with rate-limit + 401 retry
 *  - Data mapping helpers (FieldOps → Xero)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const XERO_CLIENT_ID = Deno.env.get("XERO_CLIENT_ID")!;
const XERO_CLIENT_SECRET = Deno.env.get("XERO_CLIENT_SECRET")!;

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

// ── Supabase admin client (service role) ────────────────────────────────────

export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── CORS + JSON helpers ─────────────────────────────────────────────────────

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function corsPreflightOrMethodCheck(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  return null; // continue
}

// ── JWT verification ────────────────────────────────────────────────────────

export async function verifyAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const anonClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await anonClient.auth.getUser();
  return user;
}

export async function verifyAdmin(req: Request) {
  const user = await verifyAuth(req);
  if (!user) return { user: null, error: json({ error: "Unauthorized" }, 401) };
  const admin = getAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (!staff || staff.role !== "admin") {
    return { user, error: json({ error: "Admin access required" }, 403) };
  }
  return { user, error: null };
}

// ── Token management ────────────────────────────────────────────────────────

interface XeroConnection {
  id: string;
  tenant_id: string;
  tenant_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

/**
 * Reads the active Xero connection from DB.
 * If the token expires within 5 minutes, refreshes it first.
 */
export async function getXeroToken(): Promise<{
  accessToken: string;
  tenantId: string;
} | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("xero_connections")
    .select("*")
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  const conn = data as XeroConnection;

  // Refresh if expiring within 5 minutes
  const expiresAt = new Date(conn.token_expires_at).getTime();
  const fiveMin = 5 * 60 * 1000;
  if (Date.now() > expiresAt - fiveMin) {
    const refreshed = await refreshToken(conn);
    if (!refreshed) return null;
    return { accessToken: refreshed.access_token, tenantId: conn.tenant_id };
  }

  return { accessToken: conn.access_token, tenantId: conn.tenant_id };
}

async function refreshToken(conn: XeroConnection) {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
      client_id: XERO_CLIENT_ID,
      client_secret: XERO_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    console.error("Xero token refresh failed:", await res.text());
    return null;
  }

  const tokens = await res.json();
  const admin = getAdminClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await admin
    .from("xero_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    })
    .eq("id", conn.id);

  return { access_token: tokens.access_token };
}

// ── Authenticated Xero fetch ────────────────────────────────────────────────

/**
 * Makes an authenticated request to the Xero API.
 * Handles 429 (rate limit) with retry-after and 401 with token refresh.
 */
export async function xeroFetch(
  path: string,
  options: RequestInit = {},
  retries = 2
): Promise<Response> {
  const token = await getXeroToken();
  if (!token) throw new Error("No active Xero connection");

  const url = path.startsWith("http") ? path : `${XERO_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    "Xero-Tenant-Id": token.tenantId,
    Accept: "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (options.body) headers["Content-Type"] = "application/json";

  const res = await fetch(url, { ...options, headers });

  // Rate limited — wait and retry
  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return xeroFetch(path, options, retries - 1);
  }

  // Token expired — refresh and retry once
  if (res.status === 401 && retries > 0) {
    const admin = getAdminClient();
    const { data: conn } = await admin
      .from("xero_connections")
      .select("*")
      .eq("is_active", true)
      .single();
    if (conn) await refreshToken(conn as XeroConnection);
    return xeroFetch(path, options, retries - 1);
  }

  return res;
}

// ── Sync log helper ─────────────────────────────────────────────────────────

export async function logSync(
  entityType: string,
  entityId: string,
  direction: "push" | "pull",
  status: "success" | "error",
  xeroId?: string,
  errorMessage?: string
) {
  const admin = getAdminClient();
  await admin.from("xero_sync_log").insert({
    entity_type: entityType,
    entity_id: entityId,
    direction,
    status,
    xero_id: xeroId || null,
    error_message: errorMessage || null,
    attempt_count: 1,
    last_attempt_at: new Date().toISOString(),
  });
}

// ── Data mapping: Contact ───────────────────────────────────────────────────

export function mapContactToXero(
  record: { name: string; email?: string; phone?: string; address?: string },
  isCustomer: boolean
) {
  const contact: Record<string, unknown> = {
    Name: record.name,
    IsCustomer: isCustomer,
    IsSupplier: !isCustomer,
  };
  if (record.email) contact.EmailAddress = record.email;
  if (record.phone) {
    contact.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: record.phone }];
  }
  if (record.address) {
    contact.Addresses = [{ AddressType: "STREET", AddressLine1: record.address }];
  }
  return contact;
}

// ── Data mapping: Invoice ───────────────────────────────────────────────────

const INVOICE_STATUS_MAP: Record<string, string> = {
  draft: "DRAFT",
  sent: "AUTHORISED",
  paid: "PAID",
  overdue: "AUTHORISED", // Xero derives overdue from due date
  void: "VOIDED",
};

export function mapInvoiceToXero(
  invoice: {
    invoice_number: string;
    status: string;
    due_date?: string;
    tax_rate?: number;
    notes?: string;
  },
  lineItems: Array<{
    description: string;
    quantity: number;
    unit_price: number;
  }>,
  xeroContactId: string,
  accountCode: string
) {
  const taxRate = Number(invoice.tax_rate || 10);
  const taxType = taxRate > 0 ? "OUTPUT" : "NONE";

  return {
    Type: "ACCREC",
    Contact: { ContactID: xeroContactId },
    InvoiceNumber: invoice.invoice_number,
    Status: INVOICE_STATUS_MAP[invoice.status] || "DRAFT",
    DueDate: invoice.due_date || undefined,
    LineAmountTypes: taxRate > 0 ? "Exclusive" : "NoTax",
    Reference: invoice.notes || undefined,
    LineItems: lineItems.map((li) => ({
      Description: li.description,
      Quantity: li.quantity,
      UnitAmount: li.unit_price,
      AccountCode: accountCode,
      TaxType: taxType,
    })),
  };
}

// ── Data mapping: Bill ──────────────────────────────────────────────────────

export function mapBillToXero(
  bill: {
    invoice_number?: string;
    invoice_date?: string;
    subtotal?: number;
    total?: number;
    has_gst?: boolean;
    notes?: string;
    supplier_name?: string;
  },
  xeroContactId: string,
  accountCode: string
) {
  const taxType = bill.has_gst ? "INPUT" : "NONE";
  // Use subtotal (ex-GST) as line amount when GST inclusive, else use total
  const lineAmount = bill.has_gst ? Number(bill.subtotal || bill.total || 0) : Number(bill.total || 0);

  return {
    Type: "ACCPAY",
    Contact: { ContactID: xeroContactId },
    InvoiceNumber: bill.invoice_number || undefined,
    Date: bill.invoice_date || undefined,
    Status: "AUTHORISED",
    LineAmountTypes: bill.has_gst ? "Exclusive" : "NoTax",
    Reference: bill.notes || undefined,
    LineItems: [
      {
        Description: bill.supplier_name || "Bill",
        Quantity: 1,
        UnitAmount: lineAmount,
        AccountCode: accountCode,
        TaxType: taxType,
      },
    ],
  };
}

// ── Account code lookup ─────────────────────────────────────────────────────

export async function getAccountCode(
  entityType: "invoice" | "bill",
  category = ""
): Promise<string> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("xero_account_mappings")
    .select("xero_account_code")
    .eq("entity_type", entityType)
    .eq("category", category)
    .single();
  return data?.xero_account_code || (entityType === "invoice" ? "200" : "400");
}
