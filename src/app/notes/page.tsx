'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ensureUserHasNote } from '@/lib/notesLifecycle';
import { ensureUserAppRegistration } from '@/lib/userRegistration';

export default function NotesEntry() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        await ensureUserAppRegistration(user);
      } catch (error) {
        console.error('Failed to ensure user app registration:', error);
      }

      try {
        const preferredNoteId = (() => {
          try {
            return window.localStorage.getItem(`tulis:lastNoteId:${user.uid}`) ?? undefined;
          } catch {
            return undefined;
          }
        })();

        const { noteId, created } = await ensureUserHasNote(user.uid, { preferredNoteId });
        router.replace(created ? `/notes/${noteId}?focus=title` : `/notes/${noteId}`);
      } catch (error) {
        console.error('Failed to ensure user has at least one note:', error);
      }
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center tulis-bg">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] tulis-muted">Opening notes...</p>
    </div>
  );
}
