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
  onAuthStateChanged,
  getRedirectResult,
  updateProfile,
} from 'firebase/auth';

function getFriendlyAuthError(error: unknown, fallback: string) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code || '')
    : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return fallback;
  }
}

export default function Login() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
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
        const trimmedName = name.trim();
        if (!trimmedName) {
          setError('Please enter your name.');
          setLoading(false);
          return;
        }

        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: trimmedName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.replace('/notes');
    } catch (err: unknown) {
      setError(getFriendlyAuthError(err, `Could not ${isSignUp ? 'create your account' : 'sign you in'}.`));
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
    } catch (err: unknown) {
      setError(getFriendlyAuthError(err, 'Could not continue with Google.'));
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
    } catch (err: unknown) {
      setResetError(getFriendlyAuthError(err, 'Could not send reset email. Please try again.'));
    } finally {
      setResetLoading(false);
    }
  };

  useEffect(() => {
    // Handle redirect result from Google Sign-In
    getRedirectResult(auth).catch((err) => {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(getFriendlyAuthError(err, 'Could not complete sign in.'));
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
    <div className="klaud-bg relative flex min-h-screen items-start justify-center overflow-y-auto px-4 py-8 sm:py-10">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[color:var(--klaud-accent)]/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[color:var(--klaud-secondary)]/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-10 gap-3 text-center">
          <svg className="h-14 w-14" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="klaudCloudGradient" x1="10" y1="16" x2="54" y2="48" gradientUnits="userSpaceOnUse">
                <stop stopColor="var(--klaud-accent)" />
                <stop offset="1" stopColor="var(--klaud-secondary)" />
              </linearGradient>
            </defs>
            <path
              d="M19 43h26c8 0 13.8-5.6 13.8-12.6 0-6.6-5-12-11.3-12.7a15.8 15.8 0 0 0-30.2 5.2C11.8 24.1 7.5 28.6 7.5 34.2 7.5 39 10.7 43 15.1 43h3.9Z"
              fill="url(#klaudCloudGradient)"
            />
          </svg>
          <h1 className="text-3xl font-black tracking-tight klaud-text">KlaudPad</h1>
          <p className="text-sm klaud-muted opacity-75">Your notes, in the klaud.</p>
        </div>

        <div className="klaud-surface bg-[color:var(--klaud-glass)] backdrop-blur-2xl w-full space-y-8 rounded-[32px] border klaud-border p-10 shadow-2xl">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight klaud-text">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
            <p className="text-sm klaud-muted opacity-70">
              {isSignUp ? 'Start writing in seconds.' : 'Sign in to pick up where you left off.'}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            {isSignUp && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest klaud-muted px-1" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  required={isSignUp}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border-none bg-white/50 dark:bg-black/20 px-4 py-3.5 text-sm klaud-text shadow-inner ring-1 ring-[color:var(--klaud-border)] focus:ring-2 focus:ring-[color:var(--klaud-accent)] transition-all outline-none"
                  placeholder="Your name"
                />
              </div>
            )}

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
                placeholder="you@example.com"
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
                    Forgot password?
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
              {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create account' : 'Sign in')}
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
                {isSignUp ? 'Already have an account? Sign in' : 'New to KlaudPad? Create an account'}
              </button>
            </div>
          </form>

          <div className="relative">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-[color:var(--klaud-border)]" />
            <div className="relative flex justify-center">
              <span className="bg-transparent px-4 text-[10px] font-bold uppercase tracking-widest klaud-muted">Or continue with</span>
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
            Continue with Google
          </button>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xl px-4 animate-in fade-in duration-300">
          <div className="klaud-surface w-full max-w-sm rounded-[32px] border klaud-border p-10 shadow-2xl scale-in-center">
            <h2 className="text-xl font-bold klaud-text mb-2">Reset your password</h2>
            {resetSent ? (
              <div className="space-y-6">
                <p className="text-sm klaud-muted leading-relaxed">
                  If an account exists for <span className="font-bold text-[color:var(--klaud-accent)]">{resetEmail}</span>, you&apos;ll receive a reset email shortly.
                </p>
                <button
                  onClick={() => { setResetOpen(false); setResetSent(false); }}
                  className="w-full py-3 rounded-2xl bg-[color:var(--klaud-accent)] text-white font-bold text-sm shadow-lg shadow-cyan-500/20"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handlePasswordReset}>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-widest klaud-muted px-1" htmlFor="reset-email">
                    Email address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-2xl border-none bg-white/50 dark:bg-black/20 px-4 py-3.5 text-sm klaud-text shadow-inner ring-1 ring-[color:var(--klaud-border)] focus:ring-2 focus:ring-[color:var(--klaud-accent)] outline-none"
                    placeholder="you@example.com"
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
                    {resetLoading ? 'Sending...' : 'Send reset link'}
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
