'use client';

import { useCallback, useEffect, useState } from 'react';
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
  serverTimestamp,
  limit,
  getDocs,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { ThemeToggle } from '@/components/ThemeToggle';

type NoteListItem = { id: string; title: string | null; updated_at: any };

type NotesDrawerProps = {
  open: boolean;
  currentNoteId: string;
  onClose: () => void;
};

export function NotesDrawer({ open, currentNoteId, onClose }: NotesDrawerProps) {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'notes'),
      orderBy('updated_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList = snapshot.docs.map((doc) => ({
        id: doc.id,
        title: doc.data().title || null,
        updated_at: doc.data().updated_at,
      }));
      setNotes(notesList);
    });

    return () => unsubscribe();
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
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    onClose();
    location.href = `/notes/${docRef.id}`;
  }, [onClose]);

  const filteredNotes = notes.filter((note) => {
    if (!searchQuery.trim()) return true;
    return (note.title || 'Untitled').toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      await deleteDoc(doc(db, 'notes', id));
      setDeletingId(null);
      setConfirmingId(null);

      const q = query(collection(db, 'notes'), orderBy('updated_at', 'desc'), limit(1));
      const snapshot = await getDocs(q);
      const first = snapshot.docs[0]?.id;

      if (first) {
        location.href = `/notes/${first}`;
      } else {
        location.href = '/notes';
      }
    },
    []
  );

  return (
    <>
      {/* Mobile Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[color:var(--klaud-bg)]/60 backdrop-blur-md lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="notes-drawer"
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] sm:w-[320px] flex-col klaud-border border-r bg-[color:var(--klaud-glass)] backdrop-blur-xl transition-transform duration-300 ease-in-out shadow-2xl lg:relative lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'
          } ${open ? '' : 'lg:hidden'}`}
      >
        {/* Brand & Theme */}
        <div className="flex shrink-0 items-center justify-between px-6 py-5">
          <Link href="/notes" className="group flex items-center gap-2" onClick={onClose}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[color:var(--klaud-accent)] to-[color:var(--klaud-secondary)] text-white shadow-lg shadow-[color:var(--klaud-accent)]/20">
              <span className="text-xl font-bold italic">K</span>
            </div>
            <span className="text-xl font-bold tracking-tight klaud-text group-hover:text-[color:var(--klaud-accent)] transition-colors">KlaudPad</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>

        {/* Global Action: New Note */}
        <div className="px-5 pb-4">
          <button
            onClick={createNote}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[color:var(--klaud-accent)] to-[color:var(--klaud-secondary)] p-[1px] shadow-lg shadow-cyan-500/10 transition-all hover:scale-[1.02] active:scale-95"
          >
            <div className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-[color:var(--klaud-surface)] py-2.5 text-sm font-bold klaud-text transition group-hover:bg-transparent group-hover:text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeLinecap="round" />
              </svg>
              New Thought
            </div>
          </button>
        </div>

        {/* Search with modern aesthetic */}
        <div className="px-5 pb-6">
          <div className="relative group">
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
              className="w-full rounded-xl border-none bg-white/50 dark:bg-black/20 pl-10 pr-4 py-2.5 text-sm klaud-text shadow-inner ring-1 ring-[color:var(--klaud-border)] focus:ring-2 focus:ring-[color:var(--klaud-accent)] transition-all outline-none"
            />
          </div>
        </div>

        {/* Navigation / Note List */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-6">
          <div>
            <h3 className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] klaud-muted opacity-50 mb-3">All Collections</h3>
            {filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
                <div className="h-12 w-12 rounded-full bg-[color:var(--klaud-border)] flex items-center justify-center mb-3">
                  <svg className="h-6 w-6 klaud-muted opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <p className="text-xs klaud-muted">Empty as a void. Start writing.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredNotes.map((note) => {
                  const isActive = note.id === currentNoteId;
                  return (
                    <li key={note.id}>
                      <div className={`group relative flex items-center rounded-xl transition-all duration-200 ${isActive
                        ? 'bg-gradient-to-r from-[color:var(--klaud-accent)]/10 to-transparent'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                        }`}>
                        {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-[color:var(--klaud-accent)] shadow-[0_0_10px_var(--klaud-accent)]" />}

                        <Link
                          href={`/notes/${note.id}`}
                          onClick={onClose}
                          className="flex-1 px-4 py-3 min-w-0"
                        >
                          <div className={`truncate text-sm font-bold tracking-tight ${isActive ? 'klaud-text' : 'klaud-muted group-hover:klaud-text'} transition-colors`}>
                            {note.title?.trim() || 'Untitled'}
                          </div>
                          <div className="text-[10px] font-medium klaud-muted opacity-40 mt-0.5 uppercase tracking-tighter">
                            {note.updated_at?.toDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(note.updated_at.toDate()) : 'Recent'}
                          </div>
                        </Link>

                        <button
                          onClick={() => setConfirmingId(note.id)}
                          className={`mr-3 rounded-lg p-1.5 klaud-muted transition-all hover:bg-red-500/10 hover:text-red-500 focus:outline-none ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </nav>

        {/* Footer: User & Logout */}
        <div className="p-4 border-t klaud-border shrink-0">
          <div className="flex items-center justify-between rounded-2xl bg-[color:var(--klaud-bg)]/50 p-3 ring-1 ring-[color:var(--klaud-border)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-[color:var(--klaud-accent)]/20 border klaud-border flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold klaud-text">{auth.currentUser?.email?.substring(0, 2).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold klaud-text truncate">{auth.currentUser?.email?.split('@')[0]}</p>
                <p className="text-[10px] klaud-muted truncate opacity-50">Pro Plan</p>
              </div>
            </div>
            <button
              onClick={async () => {
                await signOut(auth);
                location.href = '/login';
              }}
              className="p-2 rounded-lg klaud-muted hover:text-[color:var(--klaud-accent)] hover:bg-[color:var(--klaud-bg)] transition-all"
              title="Logout"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
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
    </>
  );
}
