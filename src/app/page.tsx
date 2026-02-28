'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { resolveTulisRegistration } from '@/lib/userRegistration';
import { ensureUserHasNote } from '@/lib/notesLifecycle';
import { LoadingNotesScreen } from '@/components/LoadingNotesScreen';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        await resolveTulisRegistration(user);
      } catch (error) {
        console.error('Failed to resolve user app registration:', error);
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

  return <LoadingNotesScreen />;
}
