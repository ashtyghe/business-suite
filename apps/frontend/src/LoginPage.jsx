import { useState } from 'react';
import { useAuth } from './lib/AuthContext';
import { resetPassword } from './lib/auth';

export default function LoginPage() {
  const { signIn, sessionMessage, clearSessionMessage } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Invalid email or password'
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      setResetSent(true);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoBlock}>
          <div style={styles.logoMark}>FieldOps</div>
          <div style={styles.logoSub}>Job Management</div>
        </div>

        {showReset ? (
          // ── Password Reset Form ──
          <>
            <div style={styles.heading}>Reset Password</div>
            <p style={styles.subtext}>
              {resetSent
                ? "Check your email for a password reset link."
                : "Enter your email and we'll send you a reset link."}
            </p>

            {!resetSent && (
              <form onSubmit={handleReset}>
                {resetError && <div style={styles.error}>{resetError}</div>}
                <label style={styles.label}>Email</label>
                <input
                  type="email" value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={styles.input}
                  required autoFocus
                />
                <button type="submit" style={{ ...styles.button, opacity: resetLoading ? 0.6 : 1 }} disabled={resetLoading}>
                  {resetLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <button onClick={() => { setShowReset(false); setResetSent(false); setResetError(null); }} style={styles.link}>
              Back to sign in
            </button>
          </>
        ) : (
          // ── Login Form ──
          <>
            <div style={styles.heading}>Sign in</div>
            <p style={styles.subtext}>Enter your credentials to access FieldOps</p>

            <form onSubmit={handleSubmit}>
              {sessionMessage && (
                <div style={styles.info} onClick={clearSessionMessage}>
                  {sessionMessage}
                </div>
              )}
              {error && <div style={styles.error}>{error}</div>}

              <label style={styles.label}>Email</label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={styles.input}
                required autoFocus
              />

              <label style={styles.label}>Password</label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={styles.input}
                required
              />

              <button type="submit" style={{ ...styles.button, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <button onClick={() => { setShowReset(true); setResetEmail(email); }} style={styles.link}>
              Forgot your password?
            </button>
          </>
        )}
      </div>

      <div style={styles.footer}>
        &copy; {new Date().getFullYear()} FieldOps &middot; Built for the trades
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', background: '#f5f5f5', fontFamily: "'Open Sans', sans-serif",
    padding: 20,
  },
  card: {
    width: '100%', maxWidth: 400, background: '#fff', borderRadius: 12,
    border: '1px solid #e8e8e8', padding: '40px 36px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  },
  logoBlock: {
    textAlign: 'center', marginBottom: 32,
  },
  logoMark: {
    fontSize: 28, fontWeight: 800, color: '#111', letterSpacing: '-0.03em',
  },
  logoSub: {
    fontSize: 11, fontWeight: 600, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2,
  },
  heading: {
    fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 4,
  },
  subtext: {
    fontSize: 13, color: '#888', marginBottom: 24, marginTop: 0,
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#555',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, marginTop: 16,
  },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 14, fontFamily: "'Open Sans', sans-serif", outline: 'none',
    transition: 'border-color 0.15s', boxSizing: 'border-box',
  },
  button: {
    width: '100%', padding: '11px 16px', background: '#111', color: '#fff', border: 'none',
    borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 24,
    fontFamily: "'Open Sans', sans-serif", transition: 'opacity 0.15s',
  },
  info: {
    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6,
    padding: '10px 14px', fontSize: 12, color: '#1d4ed8', marginBottom: 8,
    cursor: 'pointer',
  },
  error: {
    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
    padding: '10px 14px', fontSize: 12, color: '#dc2626', marginBottom: 8,
  },
  link: {
    display: 'block', background: 'none', border: 'none', color: '#888',
    fontSize: 12, cursor: 'pointer', marginTop: 16, textAlign: 'center',
    fontFamily: "'Open Sans', sans-serif", textDecoration: 'underline',
    padding: 0,
  },
  footer: {
    marginTop: 24, fontSize: 11, color: '#bbb',
  },
};
