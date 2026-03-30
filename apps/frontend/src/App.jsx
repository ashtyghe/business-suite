import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import JobManagementApp from './job-management-app'
import LoginPage from './LoginPage'
import s from './App.module.css'

function AppShell() {
  const { user, staff, loading, isLocalDev } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Display pages are public — no auth required
  const isDisplay = window.location.pathname.startsWith("/display/");
  if (isDisplay) return <JobManagementApp />;

  // Show splash for minimum 3s while auth loads
  if (loading || !splashDone) {
    return (
      <div className={s.loadingScreen}>
        <img src="/loading-logo.svg" alt="Loading" className={s.loadingLogo} />
      </div>
    );
  }

  // Local dev without Supabase — skip auth, show app with seed data
  if (isLocalDev) return <JobManagementApp />;

  // Not logged in or staff profile missing — show login page
  if (!user || !staff) return <LoginPage />;

  // Authenticated — show app
  return <JobManagementApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
