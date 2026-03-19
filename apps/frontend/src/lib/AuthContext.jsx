import { createContext, useContext, useState, useEffect } from 'react';
import { getSession, onAuthStateChange, signIn as authSignIn, signOut as authSignOut, getStaffProfile } from './auth';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [staff, setStaff] = useState(null);      // Linked staff profile
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionMessage, setSessionMessage] = useState(null);

  // Resolve the staff profile for an auth user
  const resolveStaff = async (authUser) => {
    if (!authUser) { setStaff(null); return; }
    const profile = await getStaffProfile(authUser.id);
    setStaff(profile);
  };

  // Initial session check — use onAuthStateChange only (not getSession)
  // to avoid Supabase lock contention ("Lock broken by another request")
  useEffect(() => {
    // If Supabase isn't configured, skip auth (local dev with seed data)
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Safety timeout — if auth never resolves, show login page
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // onAuthStateChange fires INITIAL_SESSION on setup, which gives us
    // the current session without a separate getSession() call
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      try {
        const authUser = session?.user || null;

        if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
          setUser(null);
          setStaff(null);
          if (event === 'TOKEN_REFRESHED') {
            setSessionMessage('Your session has expired. Please sign in again.');
          }
          return;
        }

        setUser(authUser);
        if (authUser) {
          const profile = await getStaffProfile(authUser.id);
          setStaff(profile);
          // If session exists but staff profile can't be fetched (e.g. expired
          // token), treat as logged out so the login page shows instead of a
          // broken app shell.
          if (!profile) {
            setUser(null);
            setSessionMessage('Your session has expired. Please sign in again.');
            try { await authSignOut(); } catch (_) { /* ignore */ }
          }
        } else {
          setStaff(null);
        }
      } catch (err) {
        console.error('Auth state change error:', err.message);
        // On any error during auth resolution, clear state so login page shows
        setUser(null);
        setStaff(null);
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    setError(null);
    try {
      const data = await authSignIn(email, password);
      // Check that the staff profile exists and is active
      const profile = await getStaffProfile(data.user.id);
      if (!profile) {
        await authSignOut();
        throw new Error('No staff profile linked to this account. Contact your admin.');
      }
      if (!profile.active) {
        await authSignOut();
        throw new Error('Your account has been deactivated. Contact your admin.');
      }
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signOut = async () => {
    await authSignOut();
    setUser(null);
    setStaff(null);
  };

  const value = {
    user,
    staff,
    role: staff?.role || null,
    isAdmin: staff?.role === 'admin',
    currentUserName: staff?.name || 'Unknown',
    loading,
    error,
    sessionMessage,
    clearSessionMessage: () => setSessionMessage(null),
    signIn,
    signOut,
    // True when Supabase isn't configured (local dev mode with seed data)
    isLocalDev: !supabase,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
