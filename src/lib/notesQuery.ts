import { DocumentData, Query, QueryDocumentSnapshot, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
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
    // Page through the user's notes so we can skip any number of deleted notes
    // that may appear at the top of the updatedAt-desc ordering.
    const pageSize = 25;
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

    while (true) {
      const notesQuery: Query<DocumentData> = cursor
        ? query(
          appNotesCollection(db),
          where('ownerUid', '==', ownerUid),
          orderBy('updatedAt', 'desc'),
          startAfter(cursor),
          limit(pageSize)
        )
        : query(
          appNotesCollection(db),
          where('ownerUid', '==', ownerUid),
          orderBy('updatedAt', 'desc'),
          limit(pageSize)
        );

      const snapshot = await getDocs(notesQuery);
      if (snapshot.empty) return null;

      const candidate = snapshot.docs.find((doc) => {
        if (doc.id === excludeNoteId) return false;
        const data = doc.data();
        return data.isDeleted !== true;
      });

      if (candidate) return candidate.id;

      if (snapshot.docs.length < pageSize) return null;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
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
