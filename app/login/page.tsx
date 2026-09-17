'use client';

import { useState, FormEvent } from 'react';
import { signInWithEmail, signInWithGoogle } from '@/lib/firebase-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmail(email, password);
      window.location.href = '/';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);

    try {
      await signInWithGoogle();
      window.location.href = '/';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Vitto</h1>
        <p className="login-subtitle">Sign in to the loan repayment service</p>

        <form className="login-form" onSubmit={handleEmailSignIn}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.25rem' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <button
          className="btn-google"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          Continue with Google
        </button>

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
