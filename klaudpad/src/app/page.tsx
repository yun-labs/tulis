'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      const q = query(
        collection(db, 'notes'),
        where('owner', '==', user.uid),
        orderBy('updated_at', 'desc'),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        router.replace(`/notes/${snapshot.docs[0].id}`);
      } else {
        router.replace('/notes');
      }
    });

    return () => unsubscribe();
  }, [router]);

  return null;
}
