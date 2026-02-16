'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  confirmPasswordReset,
  onAuthStateChanged,
  getRedirectResult,
} from 'firebase/auth';

export default function Login() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.replace('/notes');
    } catch (err: any) {
      setError(err.message || `Failed to ${isSignUp ? 'sign up' : 'sign in'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      // Use redirect instead of popup to avoid sessionStorage issues
      await signInWithRedirect(auth, provider);
      // Note: The redirect will happen, and onAuthStateChanged will handle the rest
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    setResetError(null);
    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.message || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  useEffect(() => {
    // Handle redirect result from Google Sign-In
    getRedirectResult(auth).catch((err) => {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to complete sign in');
      }
      setLoading(false);
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/notes');
      }
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <div className="klaud-bg relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[color:var(--klaud-accent)]/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[color:var(--klaud-secondary)]/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-10 gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--klaud-accent)] to-[color:var(--klaud-secondary)] text-white shadow-2xl shadow-[color:var(--klaud-accent)]/20 rotate-3">
            <span className="text-3xl font-black italic">K</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight klaud-text">KlaudPad</h1>
        </div>

        <div className="klaud-surface bg-[color:var(--klaud-glass)] backdrop-blur-2xl w-full space-y-8 rounded-[32px] border klaud-border p-10 shadow-2xl">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight klaud-text">{isSignUp ? 'Join the community' : 'Welcome back'}</h2>
            <p className="text-sm klaud-muted opacity-70">
              {isSignUp ? 'Start your organized writing journey today.' : 'Sign in to access your digital thoughts.'}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-widest klaud-muted px-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border-none bg-white/50 dark:bg-black/20 px-4 py-3.5 text-sm klaud-text shadow-inner ring-1 ring-[color:var(--klaud-border)] focus:ring-2 focus:ring-[color:var(--klaud-accent)] transition-all outline-none"
                placeholder="nina@klaudpad.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label className="block text-xs font-bold uppercase tracking-widest klaud-muted" htmlFor="password">
                  Password
                </label>
                {!isSignUp && (
                  <button
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-tighter text-[color:var(--klaud-accent)] hover:opacity-70 transition-opacity"
                    onClick={() => {
                      setResetEmail(email);
                      setResetOpen(true);
                      setResetSent(false);
                      setResetError(null);
                    }}
                  >
                    Forgot access?
                  </button>
                )}
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border-none bg-white/50 dark:bg-black/20 px-4 py-3.5 text-sm klaud-text shadow-inner ring-1 ring-[color:var(--klaud-border)] focus:ring-2 focus:ring-[color:var(--klaud-accent)] transition-all outline-none"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <div className="p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-xs font-medium animate-in slide-in-from-top-1">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full relative py-4 rounded-2xl bg-gradient-to-r from-[color:var(--klaud-accent)] to-[color:var(--klaud-secondary)] text-white font-bold text-sm shadow-xl shadow-cyan-500/20 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (isSignUp ? 'Synchronizing...' : 'Authenticating...') : (isSignUp ? 'Create Workspace' : 'Continue to Notes')}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-xs font-bold klaud-muted hover:text-[color:var(--klaud-accent)] transition-colors"
              >
                {isSignUp ? 'Have an account? Access it here' : "No space yet? Create one now"}
              </button>
            </div>
          </form>

          <div className="relative">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-[color:var(--klaud-border)]" />
            <div className="relative flex justify-center">
              <span className="bg-transparent px-4 text-[10px] font-bold uppercase tracking-widest klaud-muted">Identity Providers</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl border klaud-border bg-[color:var(--klaud-bg)] klaud-text font-bold text-sm transition-all hover:bg-[color:var(--klaud-border)] active:scale-[0.98]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google Identity
          </button>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xl px-4 animate-in fade-in duration-300">
          <div className="klaud-surface w-full max-w-sm rounded-[32px] border klaud-border p-10 shadow-2xl scale-in-center">
            <h2 className="text-xl font-bold klaud-text mb-2">Access Recovery</h2>
            {resetSent ? (
              <div className="space-y-6">
                <p className="text-sm klaud-muted leading-relaxed">
                  We've dispatched a recovery link to <span className="font-bold text-[color:var(--klaud-accent)]">{resetEmail}</span>.
                </p>
                <button
                  onClick={() => { setResetOpen(false); setResetSent(false); }}
                  className="w-full py-3 rounded-2xl bg-[color:var(--klaud-accent)] text-white font-bold text-sm shadow-lg shadow-cyan-500/20"
                >
                  Return to Portal
                </button>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handlePasswordReset}>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-widest klaud-muted px-1" htmlFor="reset-email">
                    Verified Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-2xl border-none bg-white/50 dark:bg-black/20 px-4 py-3.5 text-sm klaud-text shadow-inner ring-1 ring-[color:var(--klaud-border)] focus:ring-2 focus:ring-[color:var(--klaud-accent)] outline-none"
                    placeholder="nina@klaudpad.com"
                  />
                </div>
                {resetError && <p className="text-xs text-red-400 font-medium">{resetError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResetOpen(false)}
                    className="flex-1 py-3 rounded-2xl klaud-text font-bold text-sm hover:bg-black/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-[color:var(--klaud-accent)] to-[color:var(--klaud-secondary)] text-white font-bold text-sm shadow-xl shadow-cyan-500/20 disabled:opacity-50"
                  >
                    {resetLoading ? 'Requesting...' : 'Send Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
