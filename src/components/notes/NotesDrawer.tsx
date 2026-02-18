'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import {
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { appNoteDoc, appNotesCollection } from '@/lib/firestorePaths';
import { matchesNoteSearch, normalizeTag, notePreview, parseSearchFilters } from '@/lib/notes';
import { createEmptyNoteForUser, ensureUserHasNote } from '@/lib/notesLifecycle';

type NoteListItem = {
  id: string;
  title: string;
  content: string;
  updatedAt: Timestamp | null;
  tags: string[];
  pinned: boolean;
};

type NotesDrawerProps = {
  isSidebarOpen: boolean;
  currentNoteId: string;
  onClose: () => void;
};

type SidebarView = 'all' | 'pinned';

function normalizeTagArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];

  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const normalized = normalizeTag(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    if (tags.length < 10) tags.push(normalized);
  });

  return tags;
}

export function NotesDrawer({ isSidebarOpen, currentNoteId, onClose }: NotesDrawerProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<SidebarView>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const closeOnMobile = useCallback(() => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      onClose();
    }
  }, [onClose]);

  const rawUserName = auth.currentUser?.displayName?.trim() || auth.currentUser?.email?.split('@')[0] || 'User';
  const userDisplayName = rawUserName.split(/\s+/).filter(Boolean)[0] || 'User';

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const notesQuery = query(
      appNotesCollection(db),
      where('ownerUid', '==', uid),
      orderBy('updated_at', 'desc')
    );

    const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
      const nextNotes = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data();
        return {
          id: snapshotDoc.id,
          title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Untitled',
          content: typeof data.content === 'string' ? data.content : '',
          updatedAt: (data.updatedAt as Timestamp | null) || (data.updated_at as Timestamp | null) || null,
          tags: normalizeTagArray(data.tags),
          pinned: Boolean(data.pinned),
        };
      });

      nextNotes.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const aMillis = a.updatedAt?.toMillis?.() ?? 0;
        const bMillis = b.updatedAt?.toMillis?.() ?? 0;
        return bMillis - aMillis;
      });

      setNotes(nextNotes);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Notes sync permission denied for ownerUid query.');
        return;
      }
      console.error('Notes sync error (ownerUid):', error);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSidebarOpen, onClose]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    notes.forEach((note) => {
      note.tags.forEach((tag) => tags.add(tag));
    });
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const filters = useMemo(() => parseSearchFilters(searchQuery), [searchQuery]);
  const effectivePinnedOnly = activeView === 'pinned' || filters.pinnedOnly;
  const effectiveTagFilter = activeTag ?? filters.tagFromQuery;

  const visibleNotes = useMemo(() => {
    return notes.filter((note) => {
      if (effectivePinnedOnly && !note.pinned) return false;
      if (effectiveTagFilter && !note.tags.includes(effectiveTagFilter)) return false;
      return matchesNoteSearch(note, {
        normalizedText: filters.normalizedText,
        tagFromQuery: null,
        pinnedOnly: false,
      });
    });
  }, [notes, effectivePinnedOnly, effectiveTagFilter, filters.normalizedText]);

  const createNote = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const createdNoteId = await createEmptyNoteForUser(uid);
    closeOnMobile();
    router.push(`/notes/${createdNoteId}?focus=title`);
  }, [closeOnMobile, router]);

  const togglePinned = useCallback(async (noteId: string, nextPinned: boolean) => {
    await updateDoc(appNoteDoc(db, noteId), {
      pinned: nextPinned,
      updatedAt: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }, []);

  const handleDelete = useCallback(async (noteId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setDeletingId(noteId);

    try {
      await deleteDoc(appNoteDoc(db, noteId));
      const { noteId: nextNoteId, created } = await ensureUserHasNote(uid, { excludeNoteId: noteId });
      closeOnMobile();
      router.replace(created ? `/notes/${nextNoteId}?focus=title` : `/notes/${nextNoteId}`);
    } catch (error) {
      console.error('Failed to delete note:', error);
    } finally {
      setDeletingId(null);
    }
  }, [closeOnMobile, router]);

  const renderRow = (note: NoteListItem) => {
    const isActive = note.id === currentNoteId;
    const noteHref = `/notes/${note.id}`;

    return (
      <li key={note.id}>
        <div className={`group relative min-h-[56px] rounded-[var(--rSm)] border px-2 py-1.5 transition-colors ${isActive
          ? 'border-transparent bg-[color:var(--surface)] hover:border-[color:var(--border2)] hover:bg-[color:var(--surface2)]/70'
          : 'border-transparent hover:border-[color:var(--border2)] hover:bg-[color:var(--surface2)]/70'
          }`}>
          {isActive && <div className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full bg-[color:var(--accent)]" />}

          <Link
            href={noteHref}
            onClick={closeOnMobile}
            onMouseEnter={() => router.prefetch(noteHref)}
            onFocus={() => router.prefetch(noteHref)}
            className="block min-w-0 pr-14"
          >
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold tulis-text">{note.title}</p>
              <p className="shrink-0 text-[9px] uppercase tracking-wide tulis-muted">
                {note.updatedAt?.toDate
                  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(note.updatedAt.toDate())
                  : 'Recent'}
              </p>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs tulis-muted">{notePreview(note.content)}</p>
              {note.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  {note.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[color:var(--border2)] bg-[color:var(--surface2)] px-1.5 py-0.5 text-[9px] font-medium tulis-muted"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>

          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-40 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => {
                void togglePinned(note.id, !note.pinned);
              }}
              className={`rounded-[var(--rSm)] p-1 transition-colors ${note.pinned
                ? 'text-[color:var(--accent)] bg-[color:var(--surface)]'
                : 'tulis-muted hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]'
                }`}
              aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
              title={note.pinned ? 'Unpin note' : 'Pin note'}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 17 4 4V9l3-5H5l3 5v12l4-4Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => {
                void handleDelete(note.id);
              }}
              disabled={deletingId === note.id}
              className="rounded-[var(--rSm)] p-1 tulis-muted transition-colors hover:bg-[color:var(--surface)] hover:text-red-500 disabled:opacity-50"
              aria-label="Delete note"
              title="Delete note"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="notes-drawer"
        className={`fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] shrink-0 border-r tulis-border bg-[color:var(--surface)] transition-transform duration-200 md:static md:z-auto md:h-full md:max-w-none md:translate-x-0 md:transition-[width] md:duration-200 ${isSidebarOpen ? 'translate-x-0 md:w-[280px]' : '-translate-x-full md:w-0'}`}
      >
        <div className={`flex h-full min-h-0 flex-col ${isSidebarOpen ? 'opacity-100' : 'md:pointer-events-none md:opacity-0'}`}>
          <div className="shrink-0 px-3 pb-3 pt-3">
            <div className="flex items-center justify-between gap-2">
              <Link href="/notes" onClick={closeOnMobile} className="shrink-0 text-left leading-none">
                <span className="block text-base font-black tracking-tight lowercase tulis-text">tulis</span>
                <span className="mt-1 block text-[9px] uppercase tracking-[0.18em] tulis-muted opacity-70" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                  by yun
                </span>
              </Link>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void createNote();
                  }}
                  aria-label="Create new note"
                  title="Create new note"
                  className="group flex h-9 w-9 items-center justify-center rounded-[var(--rSm)] bg-[color:var(--accent)] text-white transition-colors hover:bg-[color:var(--accentHover)]"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
                    <path d="m16.5 3.5 4 4L8 20l-5 1 1-5L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 6l4 4" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close drawer"
                  className="group flex h-9 w-9 items-center justify-center rounded-[var(--rSm)] border tulis-border bg-[color:var(--surface)] transition-colors hover:border-[color:var(--accent)] hover:bg-[color:var(--surface2)] md:hidden"
                >
                  <svg className="h-4 w-4 tulis-muted transition-colors group-hover:text-[color:var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
                    <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                    <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 tulis-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </div>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search title, content, tags"
                  className="w-full rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] py-2 pl-10 pr-3 text-sm tulis-text placeholder:text-[color:var(--text3)] focus:border-[color:var(--accent)] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-2">
              <div className="inline-flex w-full rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface2)]/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveView('all')}
                  className={`h-8 flex-1 rounded-[calc(var(--rSm)-2px)] px-2 text-xs font-semibold uppercase tracking-[0.11em] transition-colors ${activeView === 'all'
                    ? 'bg-[color:var(--accent)] text-white'
                    : 'tulis-muted hover:text-[color:var(--text)]'
                    }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('pinned')}
                  className={`h-8 flex-1 rounded-[calc(var(--rSm)-2px)] px-2 text-xs font-semibold uppercase tracking-[0.11em] transition-colors ${activeView === 'pinned'
                    ? 'bg-[color:var(--accent)] text-white'
                    : 'tulis-muted hover:text-[color:var(--text)]'
                    }`}
                >
                  Pinned
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div>
              <p className="pl-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--text3)]">Tags</p>
              <div className="mt-1.5 space-y-1.5">
                {allTags.length === 0 ? (
                  <p className="pl-4 text-xs tulis-muted">No tags yet</p>
                ) : (
                  allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setActiveTag((current) => current === tag ? null : tag);
                      }}
                      className={`w-full rounded-[var(--rSm)] py-1.5 pl-4 pr-2 text-left text-xs font-medium transition-colors ${activeTag === tag
                        ? 'bg-[color:var(--surface2)] text-[color:var(--text)]'
                        : 'tulis-muted hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                        }`}
                    >
                      #{tag}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="mt-3 border-t border-[color:var(--border2)] pt-3">
              {visibleNotes.length === 0 ? (
                <p className="px-1 py-2 text-xs tulis-muted">
                  No notes match this view.
                </p>
              ) : (
                <ul className="space-y-1">
                  {visibleNotes.map((note) => renderRow(note))}
                </ul>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-[color:var(--border2)] px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold tulis-text">{userDisplayName}</p>
                <p className="truncate text-[10px] tulis-muted">Yun Labs</p>
              </div>

              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => setConfirmingLogout(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text2)] transition-colors duration-150 hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)] focus:outline-none"
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
        </div>
      </aside>

      {confirmingLogout && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="tulis-surface w-full max-w-[320px] rounded-[var(--rLg)] border tulis-border p-8">
            <h2 className="mb-2 text-center text-xl font-bold tracking-tight tulis-text">Log out?</h2>
            <p className="mb-8 text-center text-sm tulis-muted">You will need to sign in again to access your notes.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  await signOut(auth);
                  router.replace('/login');
                }}
                className="w-full rounded-[var(--rMd)] bg-[color:var(--accent)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--accentHover)]"
              >
                Yes, log out
              </button>
              <button
                onClick={() => setConfirmingLogout(false)}
                className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] py-3 text-sm font-semibold tulis-text transition-colors hover:bg-[color:var(--surface2)]"
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
