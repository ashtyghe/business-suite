import { useState } from 'react';
import { useAuth } from './lib/AuthContext';
import { resetPassword } from './lib/auth';
import s from './LoginPage.module.css';

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
      // Prompt browser (Chrome, Safari, etc.) to save credentials for Face ID / autofill
      if (window.PasswordCredential) {
        try {
          const cred = new PasswordCredential({ id: email, password, name: email });
          await navigator.credentials.store(cred);
        } catch (_) { /* ignore if browser blocks */ }
      }
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
    <div className={s.wrapper}>
      <div className={s.card}>
        {/* Logo */}
        <div className={s.logoBlock}>
          <div className={s.logoMark}>FieldOps</div>
          <div className={s.logoSub}>Job Management</div>
        </div>

        {showReset ? (
          // ── Password Reset Form ──
          <>
            <div className={s.heading}>Reset Password</div>
            <p className={s.subtext}>
              {resetSent
                ? "Check your email for a password reset link."
                : "Enter your email and we'll send you a reset link."}
            </p>

            {!resetSent && (
              <form onSubmit={handleReset}>
                {resetError && <div className={s.error}>{resetError}</div>}
                <label className={s.label}>Email</label>
                <input
                  type="email" value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={s.input}
                  name="email"
                  autoComplete="username"
                  required autoFocus
                />
                <button type="submit" className={s.button} disabled={resetLoading}>
                  {resetLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <button onClick={() => { setShowReset(false); setResetSent(false); setResetError(null); }} className={s.link}>
              Back to sign in
            </button>
          </>
        ) : (
          // ── Login Form ──
          <>
            <div className={s.heading}>Sign in</div>
            <p className={s.subtext}>Enter your credentials to access FieldOps</p>

            <form onSubmit={handleSubmit} autoComplete="on">
              {sessionMessage && (
                <div className={s.info} onClick={clearSessionMessage}>
                  {sessionMessage}
                </div>
              )}
              {error && <div className={s.error}>{error}</div>}

              <label className={s.label}>Email</label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={s.input}
                name="email"
                autoComplete="username"
                required autoFocus
              />

              <label className={s.label}>Password</label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={s.input}
                name="password"
                autoComplete="current-password"
                required
              />

              <button type="submit" className={s.button} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <button onClick={() => { setShowReset(true); setResetEmail(email); }} className={s.link}>
              Forgot your password?
            </button>
          </>
        )}
      </div>

      <div className={s.footer}>
        &copy; {new Date().getFullYear()} FieldOps &middot; Built for the trades
      </div>
    </div>
  );
}
