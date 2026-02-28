import { User } from 'firebase/auth';
import { getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { APP_ID, userDirectoryDoc } from '@/lib/firestorePaths';

type SharedUserRecord = Record<string, unknown>;

export type SharedUserAppRegistrationCheck = {
  isSignedIn: boolean;
  sharedUserDocExists: boolean;
  appId: string;
  isRegisteredForApp: boolean;
  sharedUserData: SharedUserRecord | null;
};

export type TulisRegistrationCheck = {
  isSignedIn: boolean;
  sharedUserDocExists: boolean;
  isRegisteredForTulis: boolean;
  sharedUserData: SharedUserRecord | null;
};

export type KiraRegistrationCheck = {
  isSignedIn: boolean;
  sharedUserDocExists: boolean;
  isRegisteredForKira: boolean;
  sharedUserData: SharedUserRecord | null;
};

export type TulisRegistrationResolution =
  | { status: 'signed_out'; check: TulisRegistrationCheck }
  | { status: 'registered'; check: TulisRegistrationCheck }
  | { status: 'created_shared_user_and_registered'; check: TulisRegistrationCheck }
  | { status: 'activated_existing_shared_user_and_registered'; check: TulisRegistrationCheck };

function getAppsMap(data: SharedUserRecord | null): Record<string, unknown> | null {
  if (!data) return null;
  const apps = data.apps;
  if (!apps || typeof apps !== 'object' || Array.isArray(apps)) return null;
  return apps as Record<string, unknown>;
}

export async function getSharedUserAppRegistrationCheck(
  user: User | null,
  appId: string
): Promise<SharedUserAppRegistrationCheck> {
  if (!user) {
    return {
      isSignedIn: false,
      sharedUserDocExists: false,
      appId,
      isRegisteredForApp: false,
      sharedUserData: null,
    };
  }

  const snapshot = await getDoc(userDirectoryDoc(db, user.uid));
  const sharedUserData = snapshot.exists() ? (snapshot.data() as SharedUserRecord) : null;
  const apps = getAppsMap(sharedUserData);
  const isRegisteredForApp = snapshot.exists() && apps?.[appId] === true;

  return {
    isSignedIn: true,
    sharedUserDocExists: snapshot.exists(),
    appId,
    isRegisteredForApp,
    sharedUserData,
  };
}

export async function getTulisRegistrationCheck(user: User | null): Promise<TulisRegistrationCheck> {
  const check = await getSharedUserAppRegistrationCheck(user, APP_ID);
  return {
    isSignedIn: check.isSignedIn,
    sharedUserDocExists: check.sharedUserDocExists,
    isRegisteredForTulis: check.isRegisteredForApp,
    sharedUserData: check.sharedUserData,
  };
}

export async function getKiraRegistrationCheck(user: User | null): Promise<KiraRegistrationCheck> {
  const check = await getSharedUserAppRegistrationCheck(user, 'kira');
  return {
    isSignedIn: check.isSignedIn,
    sharedUserDocExists: check.sharedUserDocExists,
    isRegisteredForKira: check.isRegisteredForApp,
    sharedUserData: check.sharedUserData,
  };
}

export async function createSharedUserDocAndRegisterTulis(user: User) {
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

export async function activateExistingSharedUserForTulis(user: User) {
  try {
    await updateDoc(userDirectoryDoc(db, user.uid), {
      [`apps.${APP_ID}`]: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code ?? '')
      : '';

    // If the shared doc disappears between check and activation, recreate it safely.
    if (code === 'not-found' || code === 'firestore/not-found') {
      await createSharedUserDocAndRegisterTulis(user);
      return;
    }

    throw error;
  }
}

export async function resolveTulisRegistration(user: User | null): Promise<TulisRegistrationResolution> {
  const check = await getTulisRegistrationCheck(user);

  if (!check.isSignedIn || !user) {
    return { status: 'signed_out', check };
  }

  if (check.isRegisteredForTulis) {
    return { status: 'registered', check };
  }

  if (!check.sharedUserDocExists) {
    await createSharedUserDocAndRegisterTulis(user);
    return {
      status: 'created_shared_user_and_registered',
      check: {
        ...check,
        sharedUserDocExists: true,
        isRegisteredForTulis: true,
      },
    };
  }

  await activateExistingSharedUserForTulis(user);
  return {
    status: 'activated_existing_shared_user_and_registered',
    check: {
      ...check,
      isRegisteredForTulis: true,
    },
  };
}
