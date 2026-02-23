'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ensureUserHasNote } from '@/lib/notesLifecycle';
import { ensureUserAppRegistration } from '@/lib/userRegistration';
import { LoadingNotesScreen } from '@/components/LoadingNotesScreen';

const IS_DEV = process.env.NODE_ENV === 'development';

function markDevPerf(name: string) {
  if (!IS_DEV || typeof window === 'undefined' || typeof performance === 'undefined') return;
  try {
    performance.mark(name);
  } catch {
    // Ignore unsupported performance APIs.
  }
}

function measureDevPerf(name: string, startMark: string, endMark: string) {
  if (!IS_DEV || typeof window === 'undefined' || typeof performance === 'undefined') return;
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name);
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
      console.info(`[perf] ${name}: ${Math.round(lastEntry.duration)}ms`);
    }
  } catch {
    // Ignore missing marks or unsupported performance APIs.
  }
}

export default function NotesEntry() {
  const router = useRouter();

  useEffect(() => {
    let hasNavigated = false;
    markDevPerf('notes-entry:mount');

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (hasNavigated) return;

      if (!user) {
        hasNavigated = true;
        router.replace('/login');
        return;
      }

      markDevPerf('notes-entry:auth-resolved');
      measureDevPerf('notes-entry:mount-to-auth', 'notes-entry:mount', 'notes-entry:auth-resolved');

      void ensureUserAppRegistration(user).catch((error) => {
        console.error('Failed to ensure user app registration:', error);
      });

      try {
        const preferredNoteId = (() => {
          try {
            return window.localStorage.getItem(`tulis:lastNoteId:${user.uid}`) ?? undefined;
          } catch {
            return undefined;
          }
        })();

        if (preferredNoteId) {
          hasNavigated = true;
          markDevPerf('notes-entry:redirect-fast');
          measureDevPerf('notes-entry:auth-to-fast-redirect', 'notes-entry:auth-resolved', 'notes-entry:redirect-fast');
          router.replace(`/notes/${preferredNoteId}`);
          return;
        }

        const { noteId, created } = await ensureUserHasNote(user.uid, { preferredNoteId });
        hasNavigated = true;
        markDevPerf('notes-entry:redirect-fallback');
        measureDevPerf('notes-entry:auth-to-fallback-redirect', 'notes-entry:auth-resolved', 'notes-entry:redirect-fallback');
        router.replace(created ? `/notes/${noteId}?focus=title` : `/notes/${noteId}`);
      } catch (error) {
        console.error('Failed to ensure user has at least one note:', error);
      }
    });

    return () => unsubscribe();
  }, [router]);

  return <LoadingNotesScreen />;
}
