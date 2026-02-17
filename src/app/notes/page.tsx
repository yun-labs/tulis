'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db, auth } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
  where,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { NotesDrawer } from '@/components/notes/NotesDrawer';

type Row = { id: string; title: string; updated_at: Timestamp | null; folder_id: string | null };
type FolderRow = { id: string; name: string; created_at: Timestamp | null };

export default function Notes() {
  const router = useRouter();
  const { user } = useAuthGuard();
  const [rows, setRows] = useState<Row[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [gridSearchOpen, setGridSearchOpen] = useState(false);
  const [gridQuery, setGridQuery] = useState('');
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverUnsorted, setDragOverUnsorted] = useState(false);
  const displayName = user?.displayName?.trim() || user?.email?.split('@')[0] || '';

  const normalizeFolderId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  useEffect(() => {
    if (!user) return;

    const notesQuery = query(
      collection(db, 'notes'),
      where('owner', '==', user.uid),
      orderBy('updated_at', 'desc')
    );

    const foldersQuery = query(collection(db, 'note_folders'), where('owner', '==', user.uid));

    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      const notes = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data();
        return {
          id: snapshotDoc.id,
          title: data.title || 'Untitled',
          updated_at: data.updated_at || null,
          folder_id: normalizeFolderId(data.folder_id),
        };
      });
      setRows(notes);
    }, (err) => {
      console.error('Notes fetch error:', err);
    });

    const unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
      const folderRows = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data();
        return {
          id: snapshotDoc.id,
          name: (typeof data.name === 'string' && data.name.trim()) ? data.name.trim() : 'New Folder',
          created_at: data.created_at || null,
        };
      });
      setFolders(folderRows);
    }, (err) => {
      console.error('Folder fetch error:', err);
    });

    return () => {
      unsubscribeNotes();
      unsubscribeFolders();
    };
  }, [user]);

  const createNote = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      router.push('/login');
      return;
    }

    setCreating(true);
    try {
      const docRef = await addDoc(collection(db, 'notes'), {
        owner: currentUser.uid,
        title: 'Untitled',
        content_json: { type: 'doc', content: [] },
        folder_id: null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      router.push(`/notes/${docRef.id}`);
    } catch (error) {
      console.error('Firestore Create Error:', error);
      alert('Could not create note. Ensure Firestore rules are set to "test mode" or allow writes.');
    } finally {
      // In case navigation fails or takes time
      setCreating(false);
    }
  };

  const filteredRows = useMemo(() => {
    return rows.filter((note) =>
      (note.title || 'Untitled').toLowerCase().includes(gridQuery.trim().toLowerCase())
    );
  }, [rows, gridQuery]);

  const notesById = useMemo(() => {
    const map = new Map<string, Row>();
    rows.forEach((note) => map.set(note.id, note));
    return map;
  }, [rows]);

  const unsortedNotes = useMemo(() => filteredRows.filter((note) => !note.folder_id), [filteredRows]);

  const visibleFolders = useMemo(() => {
    const notesByFolderId = new Map<string, Row[]>();

    filteredRows.forEach((note) => {
      if (!note.folder_id) return;
      const list = notesByFolderId.get(note.folder_id) ?? [];
      list.push(note);
      notesByFolderId.set(note.folder_id, list);
    });

    const orderedFolders = [...folders].sort((a, b) => {
      const aMillis = a.created_at?.toMillis?.() ?? 0;
      const bMillis = b.created_at?.toMillis?.() ?? 0;
      if (aMillis === bMillis) {
        return a.name.localeCompare(b.name);
      }
      return aMillis - bMillis;
    });

    return orderedFolders
      .map((folder) => ({
        folder,
        notes: notesByFolderId.get(folder.id) ?? [],
      }))
      .filter((entry) => entry.notes.length > 0 || !gridQuery.trim());
  }, [filteredRows, folders, gridQuery]);

  const moveNoteToFolder = useCallback(async (noteId: string, folderId: string | null) => {
    await updateDoc(doc(db, 'notes', noteId), {
      folder_id: folderId,
      updated_at: serverTimestamp(),
    });
  }, []);

  const createFolderFromUnsortedPair = useCallback(async (sourceId: string, targetId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const folderRef = doc(collection(db, 'note_folders'));
    const batch = writeBatch(db);

    batch.set(folderRef, {
      owner: currentUser.uid,
      name: 'New Folder',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    batch.update(doc(db, 'notes', sourceId), {
      folder_id: folderRef.id,
      updated_at: serverTimestamp(),
    });

    batch.update(doc(db, 'notes', targetId), {
      folder_id: folderRef.id,
      updated_at: serverTimestamp(),
    });

    await batch.commit();
  }, []);

  const renameFolder = useCallback(async (folderId: string, nextName: string) => {
    const normalized = nextName.trim() || 'New Folder';
    await updateDoc(doc(db, 'note_folders', folderId), {
      name: normalized,
      updated_at: serverTimestamp(),
    });
  }, []);

  const resolveDraggedId = useCallback((event: React.DragEvent<HTMLElement>) => {
    const transferId = event.dataTransfer.getData('text/plain').trim();
    if (transferId) return transferId;
    return draggedNoteId;
  }, [draggedNoteId]);

  const resetDragState = useCallback(() => {
    setDraggedNoteId(null);
    setDragOverFolderId(null);
    setDragOverUnsorted(false);
  }, []);

  const handleDropOnNote = useCallback(async (event: React.DragEvent<HTMLElement>, targetNote: Row) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = resolveDraggedId(event);
    resetDragState();

    if (!sourceId || sourceId === targetNote.id) return;
    const sourceNote = notesById.get(sourceId);
    if (!sourceNote) return;

    if (!sourceNote.folder_id && !targetNote.folder_id) {
      await createFolderFromUnsortedPair(sourceNote.id, targetNote.id);
      return;
    }

    if (targetNote.folder_id && sourceNote.folder_id !== targetNote.folder_id) {
      await moveNoteToFolder(sourceNote.id, targetNote.folder_id);
    }
  }, [createFolderFromUnsortedPair, moveNoteToFolder, notesById, resetDragState, resolveDraggedId]);

  const handleDropOnFolder = useCallback(async (event: React.DragEvent<HTMLElement>, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = resolveDraggedId(event);
    resetDragState();

    if (!sourceId) return;
    const sourceNote = notesById.get(sourceId);
    if (!sourceNote || sourceNote.folder_id === folderId) return;

    await moveNoteToFolder(sourceId, folderId);
  }, [moveNoteToFolder, notesById, resetDragState, resolveDraggedId]);

  const handleDropOnUnsorted = useCallback(async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = resolveDraggedId(event);
    resetDragState();

    if (!sourceId) return;
    const sourceNote = notesById.get(sourceId);
    if (!sourceNote || !sourceNote.folder_id) return;

    await moveNoteToFolder(sourceId, null);
  }, [moveNoteToFolder, notesById, resetDragState, resolveDraggedId]);

  const renderNoteCard = (note: Row) => (
    <div
      key={note.id}
      draggable
      onDragStart={(event) => {
        setDraggedNoteId(note.id);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', note.id);
      }}
      onDragEnd={resetDragState}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        void handleDropOnNote(event, note);
      }}
      className="group relative rounded-[28px]"
    >
      <Link
        href={`/notes/${note.id}`}
        draggable={false}
        className="group relative flex h-full flex-col p-6 rounded-[28px] bg-[color:var(--klaud-surface)] border klaud-border shadow-sm transition-all hover:shadow-xl hover:border-[color:var(--klaud-accent)]/50 hover:-translate-y-1"
      >
        <div className="flex-1 mb-4">
          <h3 className="text-lg font-bold klaud-text group-hover:text-[color:var(--klaud-accent)] transition-colors line-clamp-2">
            {note.title || 'Untitled Note'}
          </h3>
          <p className="text-xs klaud-muted opacity-40 mt-1 uppercase tracking-widest font-bold">
            {note.updated_at?.toDate ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(note.updated_at.toDate()) : 'Recently'}
          </p>
        </div>
        <div className="flex items-center justify-between pt-4 border-t klaud-border">
          <span className="text-[10px] font-black uppercase tracking-tighter klaud-muted opacity-50">View Note</span>
          <svg className="h-4 w-4 klaud-muted group-hover:text-[color:var(--klaud-accent)] group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </Link>
    </div>
  );

  return (
    <div className="flex h-screen flex-col klaud-bg font-sans">
      {/* Dashboard Header */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between klaud-border px-6 backdrop-blur-md bg-[color:var(--klaud-glass)] border-b shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="p-2 rounded-xl border klaud-border hover:bg-[color:var(--klaud-surface)] transition-colors"
            aria-label="Toggle drawer"
            aria-expanded={menuOpen}
            aria-controls="notes-drawer"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
              <line x1="4" y1="12" x2="16" y2="12" strokeLinecap="round" />
              <line x1="4" y1="18" x2="20" y2="18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={`flex items-center rounded-xl border klaud-border bg-[color:var(--klaud-surface)]/70 shadow-sm transition-all duration-300 ${gridSearchOpen ? 'w-[260px] px-2' : 'w-10 px-0'}`}>
          <button
            type="button"
            onClick={() => setGridSearchOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--klaud-muted)] hover:text-[color:var(--klaud-accent)] transition-colors"
            aria-label="Search notes"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>

          <input
            type="search"
            value={gridQuery}
            onChange={(event) => setGridQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setGridSearchOpen(false);
                setGridQuery('');
              }
            }}
            placeholder="Filter notes..."
            className={`h-10 min-w-0 flex-1 border-none bg-transparent text-sm klaud-text placeholder:opacity-50 focus:outline-none transition-opacity ${gridSearchOpen ? 'opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}
          />

          {gridSearchOpen && (
            <button
              type="button"
              onClick={() => {
                setGridSearchOpen(false);
                setGridQuery('');
              }}
              className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--klaud-muted)] hover:text-[color:var(--klaud-accent)] transition-colors"
              aria-label="Close note search"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24">
                <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <NotesDrawer open={menuOpen} currentNoteId="" onClose={() => setMenuOpen(false)} />

        <main className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
          <div className="max-w-6xl mx-auto">
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-4xl font-black tracking-tight klaud-text mb-2">
                {displayName ? `Welcome Back, ${displayName}.` : 'Welcome Back.'}
              </h2>
              <p className="klaud-muted opacity-60 font-medium">Capture your thoughts, organize your world.</p>
            </div>

            <section
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverUnsorted(true);
              }}
              onDragLeave={() => setDragOverUnsorted(false)}
              onDrop={(event) => {
                void handleDropOnUnsorted(event);
              }}
              className={`rounded-[30px] border p-4 sm:p-5 transition-colors ${dragOverUnsorted ? 'border-[color:var(--klaud-accent)]/70 bg-[color:var(--klaud-accent)]/[0.08]' : 'border-transparent'
                }`}
            >
              <div className="mb-5 flex items-center gap-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] klaud-muted opacity-70">Unsorted</h3>
                <div className="h-px flex-1 bg-[color:var(--klaud-border)]" />
                <span className="rounded-full border klaud-border px-2 py-0.5 text-[10px] font-bold klaud-muted">{unsortedNotes.length}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <button
                  onClick={createNote}
                  disabled={creating}
                  className="group relative flex min-h-[190px] flex-col justify-between p-6 rounded-[28px] border-2 border-dashed border-[color:var(--klaud-accent)]/35 bg-gradient-to-br from-[color:var(--klaud-accent)]/[0.12] via-[color:var(--klaud-surface)] to-[color:var(--klaud-secondary)]/[0.10] shadow-sm transition-all hover:shadow-xl hover:border-[color:var(--klaud-accent)]/65 hover:-translate-y-1 active:scale-[0.99] disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  <div className="flex-1 flex flex-col items-start justify-center text-left">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--klaud-surface)] border klaud-border shadow-sm mb-5">
                      <svg className="h-5.5 w-5.5 text-[color:var(--klaud-accent)]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M12 4v16m8-8H4" strokeLinecap="round" />
                      </svg>
                    </span>
                    <h3 className="text-[1.1rem] font-black tracking-tight klaud-text">New Note</h3>
                    <p className="text-sm klaud-muted mt-1">{creating ? 'Drafting your note...' : 'Start with a blank canvas.'}</p>
                  </div>
                </button>

                {unsortedNotes.map((note) => renderNoteCard(note))}
              </div>
            </section>

            {visibleFolders.map(({ folder, notes }) => (
              <section
                key={folder.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverFolderId(folder.id);
                }}
                onDragLeave={() => setDragOverFolderId((current) => (current === folder.id ? null : current))}
                onDrop={(event) => {
                  void handleDropOnFolder(event, folder.id);
                }}
                className={`mt-10 rounded-[30px] border p-4 sm:p-5 transition-colors ${dragOverFolderId === folder.id ? 'border-[color:var(--klaud-accent)]/70 bg-[color:var(--klaud-accent)]/[0.07]' : 'border-transparent'
                  }`}
              >
                <div className="mb-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-[color:var(--klaud-border)]" />
                  <input
                    key={`${folder.id}-${folder.name}`}
                    defaultValue={folder.name}
                    onBlur={(event) => {
                      void renameFolder(folder.id, event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                    className="min-w-[120px] max-w-[240px] rounded-lg border klaud-border bg-[color:var(--klaud-surface)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] klaud-text text-center focus:outline-none focus:ring-2 focus:ring-[color:var(--klaud-accent)]"
                    aria-label="Folder name"
                  />
                  <span className="rounded-full border klaud-border px-2 py-0.5 text-[10px] font-bold klaud-muted">{notes.length}</span>
                  <div className="h-px flex-1 bg-[color:var(--klaud-border)]" />
                </div>

                {notes.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {notes.map((note) => renderNoteCard(note))}
                  </div>
                ) : (
                  <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed klaud-border bg-[color:var(--klaud-surface)]/40 text-sm font-medium klaud-muted">
                    Drop notes here
                  </div>
                )}
              </section>
            ))}

            {gridQuery.trim() && filteredRows.length === 0 && (
              <div className="mt-8 flex min-h-[160px] flex-col justify-center rounded-[28px] border klaud-border bg-[color:var(--klaud-surface)]/50 p-6">
                <h3 className="text-base font-bold klaud-text">No matching notes</h3>
                <p className="text-sm klaud-muted mt-1">Try a different title keyword.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
