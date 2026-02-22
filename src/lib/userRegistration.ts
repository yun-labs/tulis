import { User } from 'firebase/auth';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { APP_ID, userDirectoryDoc } from '@/lib/firestorePaths';

export async function ensureUserAppRegistration(user: User) {
  await setDoc(
    userDirectoryDoc(db, user.uid),
    {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      apps: {
        [APP_ID]: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
