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
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { ThemeToggle } from '@/components/ThemeToggle';

type NoteListItem = { id: string; title: string | null; updated_at: Timestamp | null; folder_id: string | null };
type FolderListItem = { id: string; name: string; created_at: Timestamp | null };

type NotesDrawerProps = {
  open: boolean;
  currentNoteId: string;
  onClose: () => void;
};

export function NotesDrawer({ open, currentNoteId, onClose }: NotesDrawerProps) {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverUnsorted, setDragOverUnsorted] = useState(false);
  const userDisplayName = auth.currentUser?.displayName?.trim() || auth.currentUser?.email?.split('@')[0] || 'User';
  const userInitials = (auth.currentUser?.displayName?.trim() || auth.currentUser?.email || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const normalizeFolderId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const currentUser = auth.currentUser;

    const notesQuery = query(
      collection(db, 'notes'),
      where('owner', '==', currentUser.uid),
      orderBy('updated_at', 'desc')
    );
    const foldersQuery = query(collection(db, 'note_folders'), where('owner', '==', currentUser.uid));

    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      const notesList = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data();
        return {
          id: snapshotDoc.id,
          title: data.title || null,
          updated_at: data.updated_at || null,
          folder_id: normalizeFolderId(data.folder_id),
        };
      });
      setNotes(notesList);
    }, (err) => {
      console.error('Drawer notes sync error:', err);
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
      console.error('Drawer folders sync error:', err);
    });

    return () => {
      unsubscribeNotes();
      unsubscribeFolders();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const createNote = useCallback(async () => {
    if (!auth.currentUser) return;

    const docRef = await addDoc(collection(db, 'notes'), {
      owner: auth.currentUser.uid,
      title: 'Untitled',
      content_json: {},
      folder_id: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    onClose();
    location.href = `/notes/${docRef.id}`;
  }, [onClose]);

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (!searchQuery.trim()) return true;
      return (note.title || 'Untitled').toLowerCase().includes(searchQuery.trim().toLowerCase());
    });
  }, [notes, searchQuery]);

  const notesById = useMemo(() => {
    const map = new Map<string, NoteListItem>();
    notes.forEach((note) => map.set(note.id, note));
    return map;
  }, [notes]);

  const unsortedNotes = useMemo(() => filteredNotes.filter((note) => !note.folder_id), [filteredNotes]);

  const visibleFolders = useMemo(() => {
    const notesByFolderId = new Map<string, NoteListItem[]>();
    filteredNotes.forEach((note) => {
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
      .filter((entry) => entry.notes.length > 0 || !searchQuery.trim());
  }, [filteredNotes, folders, searchQuery]);

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

  const handleDropOnNote = useCallback(async (event: React.DragEvent<HTMLElement>, targetNote: NoteListItem) => {
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

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      await deleteDoc(doc(db, 'notes', id));
      setDeletingId(null);
      setConfirmingId(null);
      location.href = '/notes';
    },
    []
  );

  const renderNoteItem = (note: NoteListItem) => {
    const isActive = note.id === currentNoteId;
    return (
      <li key={note.id}>
        <div
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
          className={`group relative flex items-center rounded-xl transition-all duration-200 ${isActive
            ? 'bg-gradient-to-r from-[color:var(--klaud-accent)]/12 to-transparent ring-1 ring-[color:var(--klaud-accent)]/25'
            : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
        >
          {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-[color:var(--klaud-accent)] shadow-[0_0_10px_var(--klaud-accent)]" />}

          <Link
            href={`/notes/${note.id}`}
            onClick={onClose}
            draggable={false}
            className="flex-1 px-4 py-3.5 min-w-0"
          >
            <div className={`truncate text-sm font-bold tracking-tight ${isActive ? 'klaud-text' : 'klaud-muted group-hover:klaud-text'} transition-colors`}>
              {note.title?.trim() || 'Untitled'}
            </div>
            <div className="text-[10px] font-medium klaud-muted opacity-50 mt-0.5 uppercase tracking-tighter">
              {note.updated_at?.toDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(note.updated_at.toDate()) : 'Recent'}
            </div>
          </Link>

          <button
            onClick={() => setConfirmingId(note.id)}
            className={`mr-3 rounded-lg p-1.5 klaud-muted transition-all hover:bg-red-500/10 hover:text-red-500 focus:outline-none ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
            aria-label="Delete note"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      {/* Backdrop Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-[color:var(--klaud-bg)]/35 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="notes-drawer"
        className={`fixed inset-y-0 left-0 z-[60] flex w-[300px] sm:w-[340px] flex-col klaud-border border-r bg-[color:var(--klaud-glass)]/95 backdrop-blur-xl transition-transform duration-300 ease-in-out shadow-2xl ${open ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
          }`}
      >
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-4 border-b klaud-border bg-[color:var(--klaud-surface)]/55">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-[color:var(--klaud-surface)] border klaud-border shadow-sm transition-all hover:border-[color:var(--klaud-accent)] hover:shadow-md active:scale-95"
            >
              <svg className="h-[1.2rem] w-[1.2rem] klaud-muted transition-colors duration-200 group-hover:text-[color:var(--klaud-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
                <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
              </svg>
            </button>

            <div className="flex-1" />

            <Link
              href="/notes"
              onClick={onClose}
              className="shrink-0 text-lg font-black tracking-tight klaud-text transition-colors hover:text-[color:var(--klaud-accent)]"
            >
              KlaudPad
            </Link>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative group flex-1">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 klaud-muted group-focus-within:text-[color:var(--klaud-accent)] transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="w-full rounded-xl border-none bg-white/45 dark:bg-black/25 pl-10 pr-4 py-2.5 text-sm klaud-text shadow-inner ring-1 ring-[color:var(--klaud-border)] focus:ring-2 focus:ring-[color:var(--klaud-accent)] transition-all outline-none"
              />
            </div>
            <button
              onClick={createNote}
              aria-label="Create new note"
              title="New note"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[color:var(--klaud-accent)] to-[color:var(--klaud-secondary)] text-white shadow-lg shadow-cyan-500/20 transition-transform hover:scale-[1.03] active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24">
                <path d="M12 20h9" strokeLinecap="round" />
                <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation / Note List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <section
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverUnsorted(true);
            }}
            onDragLeave={() => setDragOverUnsorted(false)}
            onDrop={(event) => {
              void handleDropOnUnsorted(event);
            }}
            className={`rounded-2xl border p-3 transition-colors ${dragOverUnsorted ? 'border-[color:var(--klaud-accent)]/70 bg-[color:var(--klaud-accent)]/[0.08]' : 'border-transparent'
              }`}
          >
            <h3 className="px-1 mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] klaud-muted opacity-60">
              <span>Unsorted</span>
              <span className="rounded-full border klaud-border px-2 py-0.5 text-[9px] opacity-75">{unsortedNotes.length}</span>
            </h3>
            {unsortedNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-3 text-center">
                <p className="text-xs klaud-muted">Drag notes here to unsort them.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {unsortedNotes.map((note) => renderNoteItem(note))}
              </ul>
            )}
          </section>

          {visibleFolders.map(({ folder, notes: folderNotes }) => (
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
              className={`rounded-2xl border p-3 transition-colors ${dragOverFolderId === folder.id ? 'border-[color:var(--klaud-accent)]/70 bg-[color:var(--klaud-accent)]/[0.08]' : 'border-transparent'
                }`}
            >
              <div className="mb-3 flex items-center gap-2">
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
                  className="max-w-[145px] rounded-lg border klaud-border bg-[color:var(--klaud-surface)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] klaud-text text-center focus:outline-none focus:ring-2 focus:ring-[color:var(--klaud-accent)]"
                  aria-label="Folder name"
                />
                <span className="rounded-full border klaud-border px-2 py-0.5 text-[9px] opacity-75">{folderNotes.length}</span>
                <div className="h-px flex-1 bg-[color:var(--klaud-border)]" />
              </div>
              {folderNotes.length === 0 ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed klaud-border bg-[color:var(--klaud-surface)]/40 py-4 text-xs klaud-muted">
                  Drop notes here
                </div>
              ) : (
                <ul className="space-y-1">
                  {folderNotes.map((note) => renderNoteItem(note))}
                </ul>
              )}
            </section>
          ))}

          {searchQuery.trim() && filteredNotes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
              <div className="h-12 w-12 rounded-full bg-[color:var(--klaud-border)] flex items-center justify-center mb-3">
                <svg className="h-6 w-6 klaud-muted opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <p className="text-xs klaud-muted">No notes match your search.</p>
            </div>
          )}
        </nav>

        {/* Footer: User & Logout */}
        <div className="p-4 border-t klaud-border shrink-0">
          <div className="flex items-center justify-between rounded-2xl bg-[color:var(--klaud-bg)]/50 p-3 ring-1 ring-[color:var(--klaud-border)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-[color:var(--klaud-accent)]/20 border klaud-border flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold klaud-text">{userInitials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold klaud-text truncate">{userDisplayName}</p>
                <p className="text-[10px] klaud-muted truncate opacity-50">Pro Plan</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setConfirmingLogout(true)}
                className="p-2 rounded-lg klaud-muted hover:text-[color:var(--klaud-accent)] hover:bg-[color:var(--klaud-bg)] transition-all"
                title="Logout"
                aria-label="Logout"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Confirm Delete Popup */}
      {confirmingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xl px-4 animate-in fade-in duration-200">
          <div className="klaud-surface w-full max-w-[320px] rounded-3xl border klaud-border p-8 shadow-2xl scale-in-center">
            <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 text-red-500 mx-auto">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h2 className="text-xl font-bold klaud-text text-center mb-2 tracking-tight">Delete note?</h2>
            <p className="text-sm klaud-muted text-center mb-8 leading-relaxed">This action is permanent and cannot be reversed.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDelete(confirmingId)}
                disabled={deletingId === confirmingId}
                className="w-full py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 disabled:opacity-50"
              >
                {deletingId === confirmingId ? 'Erasing...' : 'Delete Permanently'}
              </button>
              <button
                onClick={() => setConfirmingId(null)}
                className="w-full py-3 rounded-2xl klaud-text text-sm font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                disabled={deletingId === confirmingId}
              >
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingLogout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xl px-4 animate-in fade-in duration-200">
          <div className="klaud-surface w-full max-w-[320px] rounded-3xl border klaud-border p-8 shadow-2xl scale-in-center">
            <div className="h-12 w-12 rounded-2xl bg-[color:var(--klaud-accent)]/10 flex items-center justify-center mb-6 text-[color:var(--klaud-accent)] mx-auto">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h2 className="text-xl font-bold klaud-text text-center mb-2 tracking-tight">Log out?</h2>
            <p className="text-sm klaud-muted text-center mb-8 leading-relaxed">You will need to sign in again to access your notes.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  await signOut(auth);
                  location.href = '/login';
                }}
                className="w-full py-3 rounded-2xl bg-[color:var(--klaud-accent)] text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
              >
                Yes, log out
              </button>
              <button
                onClick={() => setConfirmingLogout(false)}
                className="w-full py-3 rounded-2xl klaud-text text-sm font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
