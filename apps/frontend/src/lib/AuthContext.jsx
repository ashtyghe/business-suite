import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getSession, onAuthStateChange, signIn as authSignIn, signOut as authSignOut, getStaffProfile } from './auth';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [staff, setStaff] = useState(null);      // Linked staff profile
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionMessage, setSessionMessage] = useState(null);
  // Track when signIn() is handling auth — so onAuthStateChange skips redundant work
  const signInActiveRef = useRef(false);

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
    // the current session without a separate getSession() call.
    //
    // IMPORTANT: We must NOT make Supabase DB calls (like getStaffProfile)
    // directly inside this callback — doing so causes navigator lock
    // contention ("Lock broken by another request with the 'steal' option").
    // Instead, we defer the profile fetch with setTimeout(0).
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      const authUser = session?.user || null;

      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        setUser(null);
        setStaff(null);
        if (event === 'TOKEN_REFRESHED') {
          setSessionMessage('Your session has expired. Please sign in again.');
        }
        clearTimeout(timeout);
        setLoading(false);
        return;
      }

      // If signIn() is actively handling this auth event, let it manage state
      if (signInActiveRef.current && event === 'SIGNED_IN') {
        clearTimeout(timeout);
        setLoading(false);
        return;
      }

      setUser(authUser);

      if (authUser) {
        // Defer the profile fetch to release the auth lock first
        setTimeout(async () => {
          try {
            const profile = await getStaffProfile(authUser.id);
            setStaff(profile);
            if (!profile) {
              setUser(null);
              setSessionMessage('Your session has expired. Please sign in again.');
              try { await authSignOut(); } catch (_) { /* ignore */ }
            }
          } catch (err) {
            console.error('Staff profile fetch error:', err.message);
            setUser(null);
            setStaff(null);
            setSessionMessage('Unable to load your profile. Please try again.');
            try { await authSignOut(); } catch (_) { /* ignore */ }
          } finally {
            clearTimeout(timeout);
            setLoading(false);
          }
        }, 0);
      } else {
        setStaff(null);
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
    signInActiveRef.current = true;
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
      // Set state directly — don't rely on onAuthStateChange
      setUser(data.user);
      setStaff(profile);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      signInActiveRef.current = false;
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
