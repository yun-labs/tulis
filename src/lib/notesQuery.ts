import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { appNotesCollection } from '@/lib/firestorePaths';
import { db } from '@/lib/firebase';

async function findLatestByOrder({
  ownerUid,
  excludeNoteId,
}: {
  ownerUid: string;
  excludeNoteId?: string;
}): Promise<string | null> {
  try {
    const queryLimit = excludeNoteId ? 2 : 1;
    const q = query(
      appNotesCollection(db),
      where('ownerUid', '==', ownerUid),
      orderBy('updatedAt', 'desc'),
      limit(queryLimit)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const candidate = snapshot.docs.find((doc) => {
      if (doc.id === excludeNoteId) return false;
      const data = doc.data();
      return data.isDeleted !== true;
    });
    return candidate ? candidate.id : null;
  } catch {
    return null;
  }
}

export async function getLatestUserNoteId(
  userId: string,
  options: { excludeNoteId?: string } = {}
): Promise<string | null> {
  const { excludeNoteId } = options;
  return findLatestByOrder({
    ownerUid: userId,
    excludeNoteId,
  });
}
