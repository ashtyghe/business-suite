import { AuthProvider, useAuth } from './lib/AuthContext'
import JobManagementApp from './job-management-app'
import LoginPage from './LoginPage'
import s from './App.module.css'

function AppShell() {
  const { user, staff, loading, isLocalDev } = useAuth();

  // Display pages are public — no auth required
  const isDisplay = window.location.pathname.startsWith("/display/");
  if (isDisplay) return <JobManagementApp />;

  // Local dev without Supabase — skip auth, show app with seed data
  if (isLocalDev) return <JobManagementApp />;

  // Still checking session
  if (loading) {
    return (
      <div className={s.loadingScreen}>
        <img src="/loading-logo.svg" alt="Loading" className={s.loadingLogo} />
      </div>
    );
  }

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
