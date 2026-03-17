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
