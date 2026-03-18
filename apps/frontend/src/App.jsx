import { AuthProvider, useAuth } from './lib/AuthContext'
import JobManagementApp from './job-management-app'
import LoginPage from './LoginPage'

function AppShell() {
  const { user, loading, isLocalDev } = useAuth();

  // Display pages are public — no auth required
  const isDisplay = window.location.pathname.startsWith("/display/");
  if (isDisplay) return <JobManagementApp />;

  // Local dev without Supabase — skip auth, show app with seed data
  if (isLocalDev) return <JobManagementApp />;

  // Still checking session
  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: '#fafafa', fontFamily: "'Open Sans', sans-serif" }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e8e8e8', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: '#888', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  // Not logged in — show login page
  if (!user) return <LoginPage />;

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
