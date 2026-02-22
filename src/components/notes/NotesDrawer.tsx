'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import {
  deleteDoc,
  deleteField,
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
import { matchesNoteSearch, normalizeLabel, notePreview, parseSearchFilters } from '@/lib/notes';
import { createEmptyNoteForUser, ensureUserHasNote } from '@/lib/notesLifecycle';

type NoteListItem = {
  id: string;
  title: string;
  content: string;
  updatedAt: Timestamp | null;
  deletedAt: Timestamp | null;
  labels: string[];
  pinned: boolean;
  isDeleted: boolean;
};

type NotesDrawerProps = {
  isSidebarOpen: boolean;
  currentNoteId: string;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onClose: () => void;
};

type SidebarView = 'all' | 'pinned';
type SidebarMode = 'notes' | 'trash';
const SIDEBAR_VIEW_OPTIONS: Array<{ value: SidebarView; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pinned', label: 'Pinned' },
];

function normalizeLabelArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const labels: string[] = [];

  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const normalized = normalizeLabel(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    if (labels.length < 10) labels.push(normalized);
  });

  return labels;
}

export function NotesDrawer({ isSidebarOpen, currentNoteId, sidebarMode, onSidebarModeChange, onClose }: NotesDrawerProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<SidebarView>('all');
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const mobileSidebarCloseSwipeRef = useRef({
    tracking: false,
    closed: false,
    touchId: -1,
    startX: 0,
    startY: 0,
  });
  const lastActiveNoteIdRef = useRef<string | null>(null);
  const previousActiveNoteIdRef = useRef<string | null>(null);
  const currentRouteNoteIdRef = useRef<string>('');

  const closeOnMobile = useCallback(() => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      onClose();
    }
  }, [onClose]);

  const resetMobileSidebarCloseSwipe = useCallback(() => {
    mobileSidebarCloseSwipeRef.current.tracking = false;
    mobileSidebarCloseSwipeRef.current.closed = false;
    mobileSidebarCloseSwipeRef.current.touchId = -1;
  }, []);

  const findCloseSwipeTouch = useCallback((touches: TouchList) => {
    const trackedTouchId = mobileSidebarCloseSwipeRef.current.touchId;
    if (trackedTouchId < 0) return touches[0] ?? null;

    for (let index = 0; index < touches.length; index += 1) {
      if (touches[index]?.identifier === trackedTouchId) {
        return touches[index];
      }
    }

    return null;
  }, []);

  const handleMobileSidebarCloseSwipeStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    resetMobileSidebarCloseSwipe();

    if (!isSidebarOpen) return;
    if (event.touches.length !== 1) return;
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches) return;

    const touch = event.touches[0];
    const bounds = event.currentTarget.getBoundingClientRect();
    const rightEdgeBand = 56;

    if (touch.clientX < bounds.right - rightEdgeBand) return;

    mobileSidebarCloseSwipeRef.current.tracking = true;
    mobileSidebarCloseSwipeRef.current.startX = touch.clientX;
    mobileSidebarCloseSwipeRef.current.startY = touch.clientY;
    mobileSidebarCloseSwipeRef.current.touchId = touch.identifier;
  }, [isSidebarOpen, resetMobileSidebarCloseSwipe]);

  const handleMobileSidebarCloseSwipeMove = useCallback((event: TouchEvent) => {
    const swipe = mobileSidebarCloseSwipeRef.current;
    if (!swipe.tracking || swipe.closed) return;

    const touch = findCloseSwipeTouch(event.touches);
    if (!touch) {
      resetMobileSidebarCloseSwipe();
      return;
    }

    const deltaX = touch.clientX - swipe.startX;
    const deltaY = touch.clientY - swipe.startY;

    if (deltaX > 8) {
      resetMobileSidebarCloseSwipe();
      return;
    }

    if (Math.abs(deltaY) > 56 && Math.abs(deltaY) > Math.abs(deltaX)) {
      resetMobileSidebarCloseSwipe();
      return;
    }

    if (deltaX <= -64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      if (event.cancelable) {
        event.preventDefault();
      }
      swipe.closed = true;
      onClose();
    }
  }, [findCloseSwipeTouch, onClose, resetMobileSidebarCloseSwipe]);

  const handleMobileSidebarCloseSwipeEnd = useCallback((event: TouchEvent) => {
    const swipe = mobileSidebarCloseSwipeRef.current;
    if (!swipe.tracking) return;

    if (event.type === 'touchcancel') {
      resetMobileSidebarCloseSwipe();
      return;
    }

    const stillTrackingTouch = findCloseSwipeTouch(event.touches);
    if (stillTrackingTouch) return;

    resetMobileSidebarCloseSwipe();
  }, [findCloseSwipeTouch, resetMobileSidebarCloseSwipe]);

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
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
      const nextNotes = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data();
        return {
          id: snapshotDoc.id,
          title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Untitled',
          content: typeof data.content === 'string' ? data.content : '',
          updatedAt: (data.updatedAt as Timestamp | null) || null,
          deletedAt: (data.deletedAt as Timestamp | null) || null,
          labels: normalizeLabelArray(data.labels),
          pinned: Boolean(data.pinned),
          isDeleted: data.isDeleted === true,
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
        if (confirmDeleteRowId) {
          setConfirmDeleteRowId(null);
          return;
        }
        if (openRowMenuId) {
          setOpenRowMenuId(null);
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmDeleteRowId, isSidebarOpen, onClose, openRowMenuId]);

  useEffect(() => {
    currentRouteNoteIdRef.current = currentNoteId;
    if (!currentNoteId) return;
    const lastActiveId = lastActiveNoteIdRef.current;
    if (lastActiveId && lastActiveId !== currentNoteId) {
      previousActiveNoteIdRef.current = lastActiveId;
    }
    lastActiveNoteIdRef.current = currentNoteId;
  }, [currentNoteId]);

  useEffect(() => {
    if (!openRowMenuId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-note-row-menu]')) return;
      setOpenRowMenuId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenRowMenuId(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [openRowMenuId]);

  useEffect(() => {
    if (isSidebarOpen) return;
    setOpenRowMenuId(null);
    setConfirmDeleteRowId(null);
    resetMobileSidebarCloseSwipe();
  }, [isSidebarOpen, resetMobileSidebarCloseSwipe]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onTouchMove = (event: TouchEvent) => {
      handleMobileSidebarCloseSwipeMove(event);
    };
    const onTouchEnd = (event: TouchEvent) => {
      handleMobileSidebarCloseSwipeEnd(event);
    };

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [handleMobileSidebarCloseSwipeEnd, handleMobileSidebarCloseSwipeMove]);

  useEffect(() => {
    setOpenRowMenuId(null);
    setConfirmDeleteRowId(null);
    setActiveLabel(null);
  }, [sidebarMode]);

  const activeNote = useMemo(
    () => notes.find((note) => note.id === currentNoteId) ?? null,
    [currentNoteId, notes],
  );

  const notesInTrash = useMemo(() => notes.filter((note) => note.isDeleted), [notes]);
  const notesInMainView = useMemo(() => notes.filter((note) => !note.isDeleted), [notes]);

  const allLabels = useMemo(() => {
    const labels = new Set<string>();
    notesInMainView.forEach((note) => {
      note.labels.forEach((label) => labels.add(label));
    });
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [notesInMainView]);

  const filters = useMemo(() => parseSearchFilters(searchQuery), [searchQuery]);
  const effectivePinnedOnly = sidebarMode === 'notes' && (activeView === 'pinned' || filters.pinnedOnly);
  const effectiveLabelFilter = sidebarMode === 'notes' ? (activeLabel ?? filters.labelFromQuery) : null;
  const notePendingDelete = useMemo(() => {
    if (!confirmDeleteRowId) return null;
    return notes.find((note) => note.id === confirmDeleteRowId) ?? null;
  }, [confirmDeleteRowId, notes]);

  const visibleNotes = useMemo(() => {
    const source = sidebarMode === 'trash' ? notesInTrash : notesInMainView;
    const filtered = source.filter((note) => {
      if (effectivePinnedOnly && !note.pinned) return false;
      if (effectiveLabelFilter && !note.labels.includes(effectiveLabelFilter)) return false;
      return matchesNoteSearch(note, {
        normalizedText: filters.normalizedText,
        labelFromQuery: null,
        pinnedOnly: false,
      });
    });

    if (sidebarMode !== 'trash') return filtered;

    return [...filtered].sort((a, b) => {
      const aMillis = a.deletedAt?.toMillis?.() ?? 0;
      const bMillis = b.deletedAt?.toMillis?.() ?? 0;
      return bMillis - aMillis;
    });
  }, [effectivePinnedOnly, effectiveLabelFilter, filters.normalizedText, notesInMainView, notesInTrash, sidebarMode]);

  const createNote = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const createdNoteId = await createEmptyNoteForUser(uid);
    closeOnMobile();
    router.push(`/notes/${createdNoteId}?focus=title`);
  }, [closeOnMobile, router]);

  const exitTrashMode = useCallback(async () => {
    onSidebarModeChange('notes');
    setOpenRowMenuId(null);
    setConfirmDeleteRowId(null);
    setActiveLabel(null);

    if (!activeNote?.isDeleted) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const { noteId: nextNoteId, created } = await ensureUserHasNote(uid, { excludeNoteId: activeNote.id });
    router.replace(created ? `/notes/${nextNoteId}?focus=title` : `/notes/${nextNoteId}`);
  }, [activeNote, onSidebarModeChange, router]);

  const togglePinned = useCallback(async (noteId: string, nextPinned: boolean) => {
    await updateDoc(appNoteDoc(db, noteId), {
      pinned: nextPinned,
      updatedAt: serverTimestamp(),
    });
  }, []);

  const moveToTrash = useCallback(async (noteId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      if (noteId === currentNoteId) {
        const isOnlyNonDeletedNote = notesInMainView.length === 1 && notesInMainView[0]?.id === noteId;
        const fallback = isOnlyNonDeletedNote
          ? { noteId: await createEmptyNoteForUser(uid), created: true }
          : (() => {
            const previousActiveId = previousActiveNoteIdRef.current;
            const previousActiveNote = previousActiveId
              ? notesInMainView.find((note) => note.id === previousActiveId && note.id !== noteId)
              : null;
            const nextVisibleNote = visibleNotes.find((note) => note.id !== noteId);
            const firstAvailableNote = notesInMainView.find((note) => note.id !== noteId);

            return previousActiveNote
              ? { noteId: previousActiveNote.id, created: false }
              : nextVisibleNote
                ? { noteId: nextVisibleNote.id, created: false }
                : firstAvailableNote
                  ? { noteId: firstAvailableNote.id, created: false }
                  : null;
          })();

        const resolvedFallback = fallback ?? await ensureUserHasNote(uid, { excludeNoteId: noteId });

        closeOnMobile();
        router.replace(resolvedFallback.created ? `/notes/${resolvedFallback.noteId}?focus=title` : `/notes/${resolvedFallback.noteId}`);

        // Wait for the route to move off this note before trashing it.
        await new Promise<void>((resolve) => {
          const startedAt = Date.now();
          const poll = () => {
            if (currentRouteNoteIdRef.current !== noteId || Date.now() - startedAt > 600) {
              resolve();
              return;
            }
            window.setTimeout(poll, 16);
          };
          poll();
        });
      }

      await updateDoc(appNoteDoc(db, noteId), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to move note to trash:', error);
    }
  }, [closeOnMobile, currentNoteId, notesInMainView, router, visibleNotes]);

  const restoreNote = useCallback(async (noteId: string) => {
    try {
      await updateDoc(appNoteDoc(db, noteId), {
        isDeleted: false,
        deletedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
      onSidebarModeChange('notes');
      setOpenRowMenuId(null);
      setConfirmDeleteRowId(null);
    } catch (error) {
      console.error('Failed to restore note:', error);
    }
  }, [onSidebarModeChange]);

  const permanentlyDeleteNote = useCallback(async (noteId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setDeletingId(noteId);

    try {
      await deleteDoc(appNoteDoc(db, noteId));

      if (noteId === currentNoteId) {
        if (sidebarMode === 'trash') {
          const remainingTrashed = notesInTrash.filter((note) => note.id !== noteId);
          const nextTrashed = remainingTrashed[0];
          if (nextTrashed) {
            router.replace(`/notes/${nextTrashed.id}`);
          } else {
            const { noteId: nextNoteId, created } = await ensureUserHasNote(uid, { excludeNoteId: noteId });
            onSidebarModeChange('notes');
            closeOnMobile();
            router.replace(created ? `/notes/${nextNoteId}?focus=title` : `/notes/${nextNoteId}`);
          }
        } else {
          const { noteId: nextNoteId, created } = await ensureUserHasNote(uid, { excludeNoteId: noteId });
          closeOnMobile();
          router.replace(created ? `/notes/${nextNoteId}?focus=title` : `/notes/${nextNoteId}`);
        }
      }
    } catch (error) {
      console.error('Failed to permanently delete note:', error);
    } finally {
      setDeletingId(null);
    }
  }, [closeOnMobile, currentNoteId, notesInTrash, onSidebarModeChange, router, sidebarMode]);

  const renderRow = (note: NoteListItem) => {
    const isActive = note.id === currentNoteId;
    const noteHref = `/notes/${note.id}`;
    const isMenuOpen = openRowMenuId === note.id;
    const hasOpenRowMenu = openRowMenuId !== null;

    return (
      <li key={note.id}>
        <div className={`group relative min-h-[56px] rounded-[var(--rSm)] border px-2 py-1.5 transition-colors ${isActive
          ? 'border-transparent bg-transparent hover:border-[color:var(--border2)] hover:bg-[color:var(--surface2)]/70'
          : 'border-transparent hover:border-[color:var(--border2)] hover:bg-[color:var(--surface2)]/70'
          }`}>
          {isActive && <div className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full bg-[color:var(--accent)]" />}

          <Link
            href={noteHref}
            onClick={() => {
              setOpenRowMenuId(null);
              closeOnMobile();
            }}
            onMouseEnter={() => router.prefetch(noteHref)}
            onFocus={() => router.prefetch(noteHref)}
            className="block min-w-0 pr-9"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex flex-1 items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold tulis-text">{note.title}</p>
                {note.pinned && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[color:var(--text2)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-label="Pinned note"
                  >
                    <path d="m12 17 4 4V9l3-5H5l3 5v12l4-4Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className="shrink-0 text-[11px] font-medium tulis-muted">
                {note.updatedAt?.toDate
                  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(note.updatedAt.toDate())
                  : 'Recent'}
              </p>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs tulis-muted">{notePreview(note.content)}</p>
              {note.labels.length > 0 && (
                <div className="flex items-center gap-1">
                  {note.labels.slice(0, 2).map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-[color:var(--border2)] bg-[color:var(--surface2)] px-1.5 py-0.5 text-[10px] font-medium tulis-muted"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>

          <div
            className={`absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center transition-opacity ${isMenuOpen
              ? 'z-30 opacity-100'
              : hasOpenRowMenu
                ? 'z-10 pointer-events-none opacity-0'
                : 'z-10 opacity-40 group-hover:opacity-100'
              }`}
            data-note-row-menu
          >
              <button
                type="button"
                onClick={() => {
                  if (isMenuOpen) {
                    setOpenRowMenuId(null);
                    return;
                  }

                  setOpenRowMenuId(note.id);
                }}
                className="rounded-[var(--rSm)] p-1 tulis-muted transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-label="Open note actions"
                title="Note actions"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-[148px] rounded-[var(--rSm)] border border-[color:var(--border2)] bg-[color:var(--surface)] p-1 shadow-sm">
                {sidebarMode === 'notes' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRowMenuId(null);
                        void togglePinned(note.id, !note.pinned);
                      }}
                      className="flex w-full items-center rounded-[calc(var(--rSm)-4px)] px-2 py-1.5 text-left text-xs tulis-muted transition-colors hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]"
                    >
                      {note.pinned ? 'Unpin note' : 'Pin note'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRowMenuId(null);
                        void moveToTrash(note.id);
                      }}
                      className="mt-0.5 flex w-full items-center rounded-[calc(var(--rSm)-4px)] px-2 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-[color:var(--surface2)] disabled:opacity-50"
                    >
                      Move to Trash
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRowMenuId(null);
                        void restoreNote(note.id);
                      }}
                      className="flex w-full items-center rounded-[calc(var(--rSm)-4px)] px-2 py-1.5 text-left text-xs tulis-muted transition-colors hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]"
                    >
                      Restore note
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRowMenuId(null);
                        setConfirmDeleteRowId(note.id);
                      }}
                      disabled={deletingId === note.id}
                      className="mt-0.5 flex w-full items-center rounded-[calc(var(--rSm)-4px)] px-2 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-[color:var(--surface2)] disabled:opacity-50"
                    >
                      Permanently delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-[140] bg-black/30 transition-opacity duration-200 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="notes-drawer"
        className={`fixed inset-y-0 left-0 z-[150] w-[312px] max-w-[calc(100vw-2.5rem)] shrink-0 border-r tulis-border bg-[color:var(--sidebar)] transition-transform duration-200 md:static md:z-auto md:h-full md:max-w-none md:translate-x-0 md:transition-[width] md:duration-200 ${isSidebarOpen ? 'translate-x-0 md:w-[312px]' : '-translate-x-full md:w-0'}`}
        onTouchStart={handleMobileSidebarCloseSwipeStart}
      >
        <div className={`flex h-full min-h-0 flex-col ${isSidebarOpen ? 'opacity-100' : 'md:pointer-events-none md:opacity-0'}`}>
          <div className="shrink-0 px-3 pb-3 pt-3">
            <div className="flex items-center justify-between gap-2">
              <Link href="/notes" onClick={closeOnMobile} className="shrink-0 text-left leading-none">
                <span className="block text-base font-black tracking-tight lowercase tulis-text">tulis</span>
                <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] tulis-muted opacity-70" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                  by yun
                </span>
              </Link>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="group flex h-9 w-9 items-center justify-center rounded-[var(--rSm)] border tulis-border bg-[color:var(--surface)] transition-colors hover:border-[color:var(--border)] hover:bg-[color:var(--surface2)] md:hidden"
              >
                <svg className="h-4 w-4 tulis-muted transition-colors group-hover:text-[color:var(--text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
                  <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (sidebarMode === 'trash') {
                  void exitTrashMode();
                  return;
                }
                void createNote();
              }}
              aria-label={sidebarMode === 'trash' ? 'Return to notes' : 'Create new note'}
              title={sidebarMode === 'trash' ? 'Return to notes' : 'Create new note'}
              className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[var(--rSm)] px-3 text-sm font-medium transition-colors ${sidebarMode === 'trash'
                ? 'tulis-return-notes-btn border border-[color:var(--border2)] text-[color:var(--text2)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]'
                : 'bg-[color:var(--accent)] text-white transition-colors duration-150 hover:bg-[color:var(--accentHover)] active:bg-[color:var(--accentActive)]'
                }`}
            >
              {sidebarMode === 'trash' ? (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Return to Notes</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                    <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
                  </svg>
                  <span>New Note</span>
                </>
              )}
            </button>

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
                  placeholder={sidebarMode === 'trash' ? 'Search trash' : 'Search title, content, labels'}
                  className="h-10 w-full rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] pl-10 pr-3 text-sm tulis-text placeholder:text-[color:var(--text3)] focus:border-[color:var(--accent)] focus:outline-none"
                />
              </div>
            </div>

            {sidebarMode === 'notes' && (
              <div className="mt-2">
                <div
                  role="tablist"
                  aria-label="Note filters"
                  className="inline-flex h-10 w-full items-center rounded-[calc(var(--rSm)-2px)] border border-[color:var(--border2)] bg-transparent p-0.5"
                >
                  {SIDEBAR_VIEW_OPTIONS.map((option) => {
                    const isActive = activeView === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveView(option.value)}
                        className={`h-full flex-1 rounded-[calc(var(--rSm)-4px)] px-2 text-[13px] font-medium tracking-[0.02em] transition-colors ${isActive
                          ? 'text-[color:var(--accent)]'
                          : 'bg-transparent text-[color:var(--text2)] hover:text-[color:var(--text)]'
                          }`}
                        style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' } : undefined}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {sidebarMode === 'notes' && (
              <div>
                <p className="pl-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-[color:var(--text3)]">Labels</p>
                <div className="mt-1.5 space-y-1.5">
                  {allLabels.length === 0 ? (
                    <p className="pl-4 text-xs tulis-muted">No labels yet</p>
                  ) : (
                    allLabels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setActiveLabel((current) => current === label ? null : label);
                        }}
                        className={`w-full rounded-[var(--rSm)] py-1.5 pl-4 pr-2 text-left text-xs font-medium transition-colors ${activeLabel === label
                          ? 'bg-[color:var(--surface2)] text-[color:var(--text)]'
                          : 'tulis-muted hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                          }`}
                      >
                        {label}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className={`${sidebarMode === 'notes' ? 'mt-3 border-t border-[color:var(--border2)] pt-3' : ''}`}>
              {visibleNotes.length === 0 ? (
                <p className="px-1 py-2 text-xs tulis-muted">
                  {sidebarMode === 'trash' ? 'Trash is empty.' : 'No notes match this view.'}
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
                <p className="truncate text-xs tulis-muted">Yun Labs</p>
              </div>

              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => {
                    if (sidebarMode === 'trash') {
                      void exitTrashMode();
                      return;
                    }
                    onSidebarModeChange('trash');
                    if (!activeNote?.isDeleted && notesInTrash.length > 0) {
                      closeOnMobile();
                      router.replace(`/notes/${notesInTrash[0].id}`);
                    }
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-[var(--rSm)] border transition-colors duration-150 ${sidebarMode === 'trash'
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface2)] text-[color:var(--accent)]'
                    : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text2)] hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                    }`}
                  title={sidebarMode === 'trash' ? 'Return to notes' : 'Open trash'}
                  aria-label={sidebarMode === 'trash' ? 'Return to notes' : 'Open trash'}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingLogout(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text2)] transition-colors duration-150 hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]"
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

      {confirmDeleteRowId && (
        <div className="fixed inset-0 z-[171] flex items-center justify-center bg-black/40 px-4">
          <div className="tulis-surface w-full max-w-[320px] rounded-[var(--rLg)] border tulis-border p-8">
            <h2 className="mb-2 text-center text-xl font-bold tracking-tight tulis-text">Permanently delete?</h2>
            <p className="mb-8 text-center text-sm tulis-muted">
              {notePendingDelete
                ? `This will permanently remove "${notePendingDelete.title}".`
                : 'This action cannot be undone.'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (!confirmDeleteRowId) return;
                  void permanentlyDeleteNote(confirmDeleteRowId);
                  setConfirmDeleteRowId(null);
                }}
                disabled={deletingId === confirmDeleteRowId}
                className="w-full rounded-[var(--rMd)] bg-red-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {deletingId === confirmDeleteRowId ? 'Deleting…' : 'Yes, permanently delete'}
              </button>
              <button
                onClick={() => setConfirmDeleteRowId(null)}
                className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] py-3 text-sm font-semibold tulis-text transition-colors hover:bg-[color:var(--surface2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingLogout && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/40 px-4">
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
