import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Only create client when env vars are configured — avoids crash during local dev
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export async function extractDocumentFromImage(base64, mimeType, docType) {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('extract-document', {
    body: { image: base64, mimeType, docType },
  });
  if (error) {
    const msg = typeof error === 'object' && error.context
      ? await error.context.text?.() || error.message
      : error.message;
    throw new Error(msg || 'Extraction failed');
  }
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return data;
}

export async function sendEmail(type, to, data) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: result, error } = await supabase.functions.invoke('send-email', {
    body: { type, to, data },
  });
  if (error) {
    const msg = typeof error === 'object' && error.context
      ? await error.context.text?.() || error.message
      : error.message;
    throw new Error(msg || 'Email send failed');
  }
  if (typeof result === 'string') {
    try { return JSON.parse(result); } catch { return result; }
  }
  return result;
}

export async function inviteUser(email, fullName, role, password) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { email, fullName, role, password: password || undefined },
  });
  if (error) {
    const msg = typeof error === 'object' && error.context
      ? await error.context.text?.() || error.message
      : error.message;
    throw new Error(msg || 'Invite failed');
  }
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return data; }
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function updateStaffRecord(staffId, updates) {
  if (!supabase) throw new Error('Supabase not configured');
  const dbUpdates = {};
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.active !== undefined) dbUpdates.active = updates.active;
  if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  const { data, error } = await supabase
    .from('staff')
    .update(dbUpdates)
    .eq('id', staffId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Xero integration ──────────────────────────────────────────────────────

async function xeroInvoke(fnName, body) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) {
    const msg = typeof error === 'object' && error.context
      ? await error.context.text?.() || error.message
      : error.message;
    throw new Error(msg || 'Xero operation failed');
  }
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return data; }
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function xeroOAuth(action, params = {}) {
  return xeroInvoke('xero-oauth', { action, ...params });
}

export async function xeroSyncInvoice(action, invoiceId) {
  return xeroInvoke('xero-sync-invoices', { action, invoiceId });
}

export async function xeroSyncBill(action, billId) {
  return xeroInvoke('xero-sync-bills', { action, billId });
}

export async function xeroSyncContact(action, entityType, entityId, extra = {}) {
  return xeroInvoke('xero-sync-contacts', { action, entityType, entityId, ...extra });
}

export async function xeroPollUpdates() {
  return xeroInvoke('xero-poll-updates', {});
}

export async function xeroFetchAccounts() {
  return xeroInvoke('xero-chart-of-accounts', { action: 'pull' });
}

export async function xeroGetMappings() {
  return xeroInvoke('xero-chart-of-accounts', { action: 'getMappings' });
}

export async function xeroSaveMappings(mappings) {
  return xeroInvoke('xero-chart-of-accounts', { action: 'saveMappings', mappings });
}

export async function extractBillFromImage(base64, mimeType) {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('extract-bill', {
    body: { image: base64, mimeType },
  });
  if (error) {
    // Try to extract a useful message from the error context
    const msg = typeof error === 'object' && error.context
      ? await error.context.text?.() || error.message
      : error.message;
    throw new Error(msg || 'Extraction failed');
  }
  // data may already be parsed JSON or may be a string
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return data;
}
