'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

const applyTheme = (theme: Theme | null) => {
  if (typeof document === 'undefined') return;

  const resolvedTheme = theme
    ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light');

  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  document.documentElement.style.colorScheme = resolvedTheme;
};

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [explicit, setExplicit] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark';
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (explicit) {
      applyTheme(theme);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, theme);
      }
    } else {
      applyTheme(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [theme, explicit]);

  useEffect(() => {
    if (explicit) return;
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [explicit]);

  const toggle = () => {
    setExplicit(true);
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };
  const renderedTheme = mounted ? theme : 'light';
  const nextTheme = renderedTheme === 'dark' ? 'light' : 'dark';
  const label = nextTheme === 'dark' ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text2)] transition-colors duration-150 hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--focusRing)]"
      aria-label={label}
      title={label}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {renderedTheme === 'light' ? (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </>
        )}
      </svg>
    </button>
  );
}
