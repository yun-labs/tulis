'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { resolveTulisRegistration } from '@/lib/userRegistration';

export function useAuthGuard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [loading, setLoading] = useState(() => !auth.currentUser);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        router.replace('/login');
        return;
      }

      setLoading(true);

      void (async () => {
        try {
          const registration = await resolveTulisRegistration(currentUser);

          if (cancelled) return;

          if (registration.status === 'activation_required') {
            setUser(null);
            setLoading(false);
            router.replace('/login');
            return;
          }

          setUser(currentUser);
          setLoading(false);
        } catch (error) {
          console.error('Failed to resolve user app registration:', error);

          if (cancelled) return;

          setUser(currentUser);
          setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  return { user, loading };
}
