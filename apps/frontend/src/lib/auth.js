import { supabase } from './supabase';

// ── Sign in with email & password ─────────────────────────────────────────
export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ── Sign out ──────────────────────────────────────────────────────────────
export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── Get current session ───────────────────────────────────────────────────
export async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ── Listen for auth state changes ─────────────────────────────────────────
export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}

// ── Fetch staff profile linked to auth user ───────────────────────────────
export async function getStaffProfile(authUserId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('auth_user_id', authUserId)
    .single();
  if (error) return null;
  return {
    id: data.id,
    authUserId: data.auth_user_id,
    name: data.full_name,
    email: data.email,
    role: data.role,
    active: data.active,
  };
}

// ── Request password reset ────────────────────────────────────────────────
export async function resetPassword(email) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}
