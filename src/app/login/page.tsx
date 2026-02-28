'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  onAuthStateChanged,
  getRedirectResult,
  updateProfile,
} from 'firebase/auth';
import { resolveTulisRegistration } from '@/lib/userRegistration';
import { ThemeToggle } from '@/components/ThemeToggle';

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [sessionCheckLoading, setSessionCheckLoading] = useState(() => Boolean(auth.currentUser));
  const registrationResolveRunRef = useRef(0);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const hasEmailShape = /\S+@\S+\.\S+/.test(trimmedEmail);
  const passwordTooShort = isSignUp && password.length > 0 && password.length < 6;
  const confirmMismatch = isSignUp && confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit = loading
    ? false
    : isSignUp
      ? Boolean(trimmedName) && hasEmailShape && password.length >= 6 && confirmPassword === password
      : hasEmailShape && password.length > 0;
  const showSignedInCheck = sessionCheckLoading && Boolean(auth.currentUser);

  const handleSignedInUser = useCallback(async (user: User) => {
    const runId = ++registrationResolveRunRef.current;
    setSessionCheckLoading(true);
    setError(null);

    try {
      await resolveTulisRegistration(user);

      if (registrationResolveRunRef.current !== runId) return;
      router.replace('/notes');
    } catch (err: unknown) {
      if (registrationResolveRunRef.current !== runId) return;
      setError(getFriendlyAuthError(err, 'Could not load your Tulis access.'));
      setLoading(false);
    } finally {
      if (registrationResolveRunRef.current === runId) {
        setSessionCheckLoading(false);
      }
    }
  }, [router]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let signedInUser: User;

      if (isSignUp) {
        if (!trimmedName) {
          setError('Please enter your name.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password should be at least 6 characters.');
          setLoading(false);
          return;
        }
        if (confirmPassword !== password) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }

        const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await updateProfile(credential.user, { displayName: trimmedName });
        signedInUser = credential.user;
      } else {
        const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        signedInUser = credential.user;
      }

      await handleSignedInUser(signedInUser);
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
      provider.setCustomParameters({ prompt: 'select_account' });

      // Popup is more reliable for preserving auth state in this app flow.
      const credential = await signInWithPopup(auth, provider);
      await handleSignedInUser(credential.user);
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: string }).code || '')
        : '';

      // Fallback for browsers/environments where popup is blocked.
      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: unknown) {
          setError(getFriendlyAuthError(redirectErr, 'Could not continue with Google.'));
          setLoading(false);
          return;
        }
      }

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
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          void handleSignedInUser(result.user);
        }
      })
      .catch((err) => {
        if (err.code !== 'auth/popup-closed-by-user') {
          setError(getFriendlyAuthError(err, 'Could not complete sign in.'));
        }
        setLoading(false);
      });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        registrationResolveRunRef.current += 1;
        setSessionCheckLoading(false);
        setLoading(false);
        return;
      }

      void handleSignedInUser(user);
    });

    return () => unsubscribe();
  }, [handleSignedInUser]);

  return (
    <div className="tulis-bg relative flex min-h-screen items-start justify-center overflow-y-auto px-4 pt-4 sm:pt-8 lg:pt-12 pb-8">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-1 text-center">
          <h1 className="text-4xl font-black tracking-tight lowercase tulis-text">tulis</h1>
          <p
            className="text-xs uppercase tracking-[0.2em] tulis-muted opacity-80"
            style={{ fontFamily: 'var(--font-geist-mono)' }}
          >
            by yun
          </p>
        </div>

        <div className="tulis-surface w-full rounded-[var(--rLg)] border tulis-border p-6 sm:p-7">
          {showSignedInCheck ? (
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight tulis-text">Checking access</h2>
              <p className="text-sm tulis-muted opacity-75">
                Verifying your Yun Labs account for Tulis...
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight tulis-text">{isSignUp ? 'Create account' : 'Sign in'}</h2>
                <p className="text-sm tulis-muted opacity-70">
                  {isSignUp ? 'Start writing in seconds.' : 'Continue to your notes.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-[var(--rMd)] border tulis-border bg-[color:var(--surface)] py-3 text-sm font-semibold tulis-text transition-colors hover:bg-[color:var(--surface2)] disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              <p className="px-1 text-xs font-medium uppercase tracking-[0.12em] tulis-muted">Or use email</p>

              <form className="space-y-4" onSubmit={handleLogin}>
                {isSignUp && (
                  <div className="space-y-1.5">
                    <label className="block px-1 text-xs font-semibold uppercase tracking-[0.12em] tulis-muted" htmlFor="name">
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm tulis-text placeholder:text-[color:var(--text3)] transition-colors focus:border-[color:var(--accent)] focus:outline-none"
                      placeholder="Your name"
                    />
                    {name.length > 0 && !trimmedName && (
                      <p className="px-1 text-xs tulis-muted">Name is required.</p>
                    )}
                  </div>
                )}

            <div className="space-y-1.5">
              <label className="block px-1 text-xs font-semibold uppercase tracking-[0.12em] tulis-muted" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm tulis-text placeholder:text-[color:var(--text3)] transition-colors focus:border-[color:var(--accent)] focus:outline-none"
                placeholder="you@example.com"
              />
              {email.length > 0 && !hasEmailShape && (
                <p className="px-1 text-xs tulis-muted">Enter a valid email address.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block px-1 text-xs font-semibold uppercase tracking-[0.12em] tulis-muted" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm tulis-text placeholder:text-[color:var(--text3)] transition-colors focus:border-[color:var(--accent)] focus:outline-none"
                placeholder="••••••••"
              />
              {passwordTooShort && (
                <p className="px-1 text-xs tulis-muted">Use at least 6 characters.</p>
              )}
              {!isSignUp && (
                <button
                  type="button"
                  className="pl-1 text-xs font-medium tulis-muted transition-colors hover:text-[color:var(--accent)]"
                  onClick={() => {
                    setResetEmail(trimmedEmail);
                    setResetOpen(true);
                    setResetSent(false);
                    setResetError(null);
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>

            {isSignUp && (
              <div className="space-y-1.5">
                <label className="block px-1 text-xs font-semibold uppercase tracking-[0.12em] tulis-muted" htmlFor="confirm-password">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm tulis-text placeholder:text-[color:var(--text3)] transition-colors focus:border-[color:var(--accent)] focus:outline-none"
                  placeholder="••••••••"
                />
                {confirmMismatch && (
                  <p className="px-1 text-xs tulis-muted">Passwords do not match.</p>
                )}
              </div>
            )}

            {error ? (
              <div className="rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface2)] p-3 text-xs font-medium tulis-text">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-[var(--rMd)] bg-[color:var(--accent)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--accentHover)] disabled:opacity-50"
            >
              {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create account' : 'Sign in')}
            </button>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp((prev) => !prev);
                  setConfirmPassword('');
                  setError(null);
                }}
                className="text-xs font-medium tulis-muted transition-colors hover:text-[color:var(--text)]"
              >
                {isSignUp ? 'Already have an account? Sign in' : 'New to tulis? Create an account'}
              </button>
            </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
          <div className="tulis-surface w-full max-w-sm rounded-[var(--rLg)] border tulis-border p-6 sm:p-7">
            <h2 className="text-xl font-semibold tracking-tight tulis-text">Reset password</h2>
            {resetSent ? (
              <div className="mt-2 space-y-5">
                <p className="text-sm leading-relaxed tulis-muted">
                  If an account exists for <span className="font-semibold text-[color:var(--text)]">{resetEmail}</span>, you&apos;ll receive a reset email shortly.
                </p>
                <button
                  onClick={() => { setResetOpen(false); setResetSent(false); }}
                  className="w-full rounded-[var(--rMd)] bg-[color:var(--accent)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--accentHover)]"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form className="mt-4 space-y-4" onSubmit={handlePasswordReset}>
                <div className="space-y-1.5">
                  <label className="block px-1 text-xs font-semibold uppercase tracking-[0.12em] tulis-muted" htmlFor="reset-email">
                    Email address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm tulis-text placeholder:text-[color:var(--text3)] focus:border-[color:var(--accent)] focus:outline-none"
                    placeholder="you@example.com"
                  />
                </div>
                {resetError && (
                  <div className="rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface2)] p-3 text-xs font-medium tulis-text">
                    {resetError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResetOpen(false)}
                    className="flex-1 rounded-[var(--rMd)] border border-[color:var(--border)] bg-transparent py-3 text-sm font-semibold tulis-text transition-colors hover:bg-[color:var(--surface2)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="flex-1 rounded-[var(--rMd)] bg-[color:var(--accent)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--accentHover)] disabled:opacity-50"
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
