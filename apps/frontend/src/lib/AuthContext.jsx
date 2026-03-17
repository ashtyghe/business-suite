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

  // Initial session check
  useEffect(() => {
    // If Supabase isn't configured, skip auth (local dev with seed data)
    if (!supabase) {
      setLoading(false);
      return;
    }

    getSession().then(async (session) => {
      const authUser = session?.user || null;
      setUser(authUser);
      await resolveStaff(authUser);
      setLoading(false);
    });

    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      const authUser = session?.user || null;
      setUser(authUser);
      await resolveStaff(authUser);
      setLoading(false);

      // Handle session expiry / sign out events
      if (event === 'SIGNED_OUT') {
        setStaff(null);
      }
      if (event === 'TOKEN_REFRESHED' && !session) {
        setSessionMessage('Your session has expired. Please sign in again.');
        setUser(null);
        setStaff(null);
      }
    });

    return () => subscription.unsubscribe();
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
