'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { NotesDrawer } from '@/components/notes/NotesDrawer';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { db } from '@/lib/firebase';
import { onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { appNoteDoc, appNotesCollection } from '@/lib/firestorePaths';
import { Editor, EditorContent, JSONContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { AbbrevExpand } from '@/editor/AbbrevExpand';
import { SlashCommand } from '@/lib/editor/SlashCommand';
import { TagChip } from '@/editor/TagChip';
import { DateChip } from '@/editor/DateChip';
import { CodeBlock } from '@/editor/CodeBlock';
import { DatePicker } from '@/components/editor/DatePicker';
import { offOpenDatePicker, onOpenDatePicker } from '@/lib/editor/datePickerEvent';
import { normalizeTag, normalizeTags } from '@/lib/notes';
import { ensureUserHasNote } from '@/lib/notesLifecycle';

type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error';

export default function NotePage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthGuard();
  const noteId = typeof routeParams?.id === 'string' ? routeParams.id : null;
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [allUserTags, setAllUserTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 767px)').matches;
  });
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const hasHydratedContentRef = useRef(false);
  const changeVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const contentSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const tagPopoverRef = useRef<HTMLDivElement | null>(null);
  const focusedTitleForNoteRef = useRef<string | null>(null);
  const recoveringNoteRef = useRef(false);
  const shouldFocusTitle = searchParams.get('focus') === 'title';

  useEffect(() => {
    if (noteId) {
      setSyncStatus('loading');
    }
  }, [noteId]);

  useEffect(() => {
    hasHydratedContentRef.current = false;
    changeVersionRef.current = 0;
    savedVersionRef.current = 0;
  }, [noteId]);

  const markDirty = useCallback(() => {
    changeVersionRef.current += 1;
    setSyncStatus('syncing');
    return changeVersionRef.current;
  }, []);

  const markSaved = useCallback((version: number) => {
    if (version > savedVersionRef.current) {
      savedVersionRef.current = version;
    }
    if (savedVersionRef.current >= changeVersionRef.current) {
      setSyncStatus('synced');
      return;
    }
    setSyncStatus('syncing');
  }, []);

  const redirectToAccessibleNote = useCallback(async () => {
    if (!user || recoveringNoteRef.current) return;

    const preferredNoteId = (() => {
      try {
        return window.localStorage.getItem(`tulis:lastNoteId:${user.uid}`) ?? undefined;
      } catch {
        return undefined;
      }
    })();

    recoveringNoteRef.current = true;
    try {
      const { noteId: resolvedNoteId, created } = await ensureUserHasNote(user.uid, {
        excludeNoteId: noteId ?? undefined,
        preferredNoteId,
      });
      router.replace(created ? `/notes/${resolvedNoteId}?focus=title` : `/notes/${resolvedNoteId}`);
    } catch (error) {
      console.error('Failed to recover to an accessible note:', error);
    } finally {
      recoveringNoteRef.current = false;
    }
  }, [user, noteId, router]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlock,
      TaskList,
      TaskItem.configure({ nested: true }),
      TagChip,
      DateChip,
      SlashCommand,
      AbbrevExpand,
    ],
    content: '',
    autofocus: 'start',
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!user) return;

    const byOwnerUid = query(appNotesCollection(db), where('ownerUid', '==', user.uid));

    const collectTags = (docs: Array<{ data: () => Record<string, unknown> }>) => {
      const deduped = new Set<string>();

      docs.forEach((snapshotDoc) => {
        const data = snapshotDoc.data();
        if (!Array.isArray(data.tags)) return;
        data.tags.forEach((tag) => {
          if (typeof tag !== 'string') return;
          const normalized = normalizeTag(tag);
          if (normalized) deduped.add(normalized);
        });
      });

      return [...deduped].sort((a, b) => a.localeCompare(b));
    };

    let ownerUidDocs: Array<{ data: () => Record<string, unknown> }> = [];

    const sync = () => {
      setAllUserTags(collectTags(ownerUidDocs));
    };

    const unsubscribeOwnerUid = onSnapshot(byOwnerUid, (snapshot) => {
      ownerUidDocs = snapshot.docs;
      sync();
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Tag sync permission denied for ownerUid query.');
        return;
      }
      console.error('Tag sync error (ownerUid):', error);
    });

    return () => {
      unsubscribeOwnerUid();
    };
  }, [user]);

  useEffect(() => {
    if (!noteId || !editor || !user) return;

    const noteRef = appNoteDoc(db, noteId);
    const unsubscribe = onSnapshot(noteRef, (snapshot) => {
      if (!snapshot.exists()) {
        void redirectToAccessibleNote();
        return;
      }

      const data = snapshot.data();
      setTitle(typeof data.title === 'string' ? data.title : '');
      setPinned(Boolean(data.pinned));
      try {
        window.localStorage.setItem(`tulis:lastNoteId:${user.uid}`, noteId);
      } catch {
        // Ignore localStorage write failures.
      }

      const incomingTags = Array.isArray(data.tags)
        ? normalizeTags(data.tags.filter((value): value is string => typeof value === 'string'))
        : [];
      setTags(incomingTags);

      const newContent = data.content_json || { type: 'doc', content: [] };
      const currentContent = editor.getJSON();
      const isInitialHydration = !hasHydratedContentRef.current;
      const hasPendingLocalContent = changeVersionRef.current > savedVersionRef.current;
      const shouldApplyRemoteContent = isInitialHydration || !hasPendingLocalContent;

      if (shouldApplyRemoteContent && JSON.stringify(newContent) !== JSON.stringify(currentContent)) {
        const selectionBefore = editor.state.selection;
        editor.commands.setContent(newContent, { emitUpdate: false });

        // Keep cursor position stable when syncing in-place to avoid jumping to the end.
        if (editor.isFocused) {
          const minPos = 1;
          const maxPos = editor.state.doc.content.size;
          const from = Math.max(minPos, Math.min(selectionBefore.from, maxPos));
          const to = Math.max(minPos, Math.min(selectionBefore.to, maxPos));
          editor.commands.setTextSelection({ from, to });
        }
      }

      hasHydratedContentRef.current = true;
      setReady(true);
      if (changeVersionRef.current === savedVersionRef.current) {
        setSyncStatus('synced');
      }
    }, (error) => {
      if (error.code === 'permission-denied' || error.code === 'not-found') {
        void redirectToAccessibleNote();
        return;
      }
      console.error('Note sync error:', error);
    });

    return () => unsubscribe();
  }, [noteId, editor, user, redirectToAccessibleNote]);

  const saveContentNow = useCallback(async ({
    content,
    plainText,
    version,
  }: {
    content: JSONContent;
    plainText: string;
    version: number;
  }) => {
    if (!noteId || !user) return;

    try {
      const noteRef = appNoteDoc(db, noteId);
      await updateDoc(noteRef, {
        content_json: content,
        content: plainText,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      markSaved(version);
    } catch (error) {
      console.error('Failed to save content:', error);
      setSyncStatus('error');
    }
  }, [noteId, user, markSaved]);

  const saveTitleNow = useCallback(async ({ newTitle, version }: { newTitle: string; version: number }) => {
    if (!noteId || !user) return;

    try {
      const noteRef = appNoteDoc(db, noteId);
      await updateDoc(noteRef, {
        title: newTitle,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      markSaved(version);
    } catch (error) {
      console.error('Failed to save title:', error);
      setSyncStatus('error');
    }
  }, [noteId, user, markSaved]);

  const saveTagsNow = useCallback(async (nextTags: string[]) => {
    if (!noteId || !user) return;

    const normalized = normalizeTags(nextTags);
    setTags(normalized);

    try {
      await updateDoc(appNoteDoc(db, noteId), {
        tags: normalized,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to save tags:', error);
      setSyncStatus('error');
    }
  }, [noteId, user]);

  const togglePinned = useCallback(async () => {
    if (!noteId || !user) return;

    const nextPinned = !pinned;
    setPinned(nextPinned);

    try {
      await updateDoc(appNoteDoc(db, noteId), {
        pinned: nextPinned,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      setSyncStatus('error');
      setPinned(!nextPinned);
    }
  }, [noteId, user, pinned]);

  const scheduleContentSave = useCallback((payload: { content: JSONContent; plainText: string; version: number }) => {
    if (contentSaveTimeoutRef.current) {
      clearTimeout(contentSaveTimeoutRef.current);
    }
    contentSaveTimeoutRef.current = setTimeout(() => {
      void saveContentNow(payload);
    }, 800);
  }, [saveContentNow]);

  const scheduleTitleSave = useCallback((payload: { newTitle: string; version: number }) => {
    if (titleSaveTimeoutRef.current) {
      clearTimeout(titleSaveTimeoutRef.current);
    }
    titleSaveTimeoutRef.current = setTimeout(() => {
      void saveTitleNow(payload);
    }, 600);
  }, [saveTitleNow]);

  const openTagPopover = useCallback(() => {
    setIsTagPopoverOpen(true);
    window.requestAnimationFrame(() => {
      tagInputRef.current?.focus();
    });
  }, []);

  const tagSuggestions = useMemo(() => {
    const normalizedInput = normalizeTag(tagInput) || tagInput.trim().toLowerCase();
    const availableTags = allUserTags.filter((tag) => !tags.includes(tag));
    if (!normalizedInput) return availableTags.slice(0, 8);

    return availableTags
      .filter((tag) => tag.includes(normalizedInput))
      .slice(0, 8);
  }, [allUserTags, tagInput, tags]);

  const addTagFromInput = useCallback(() => {
    const normalized = normalizeTag(tagInput);
    if (!normalized) {
      setTagInput('');
      return;
    }

    if (tags.includes(normalized)) {
      setTagInput('');
      return;
    }

    if (tags.length >= 10) {
      setTagInput('');
      return;
    }

    setTagInput('');
    void saveTagsNow([...tags, normalized]);
  }, [tagInput, tags, saveTagsNow]);

  useEffect(() => {
    if (!editor) return;

    const handler = ({ editor }: { editor: Editor }) => {
      const version = markDirty();
      scheduleContentSave({ content: editor.getJSON(), plainText: editor.getText(), version });
    };

    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
      if (contentSaveTimeoutRef.current) {
        clearTimeout(contentSaveTimeoutRef.current);
      }
    };
  }, [editor, scheduleContentSave, markDirty]);

  useEffect(() => {
    if (!editor) return;

    const handler = () => {
      setDatePickerOpen(true);
    };

    onOpenDatePicker(editor, handler);
    return () => {
      offOpenDatePicker(editor, handler);
    };
  }, [editor]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== 't') return;
      event.preventDefault();
      openTagPopover();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openTagPopover]);

  useEffect(() => {
    if (!isTagPopoverOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (tagPopoverRef.current?.contains(target)) return;
      setIsTagPopoverOpen(false);
      setTagInput('');
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsTagPopoverOpen(false);
      setTagInput('');
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isTagPopoverOpen]);

  useEffect(() => {
    return () => {
      if (titleSaveTimeoutRef.current) {
        clearTimeout(titleSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!noteId || !ready || !shouldFocusTitle) return;
    if (focusedTitleForNoteRef.current === noteId) return;

    const input = titleInputRef.current;
    if (!input) return;

    const frame = window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    focusedTitleForNoteRef.current = noteId;

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [noteId, ready, shouldFocusTitle]);

  const hasTags = tags.length > 0;

  if (!noteId || (authLoading && !user)) {
    return <div className="tulis-bg min-h-screen" />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden tulis-bg font-sans selection:bg-[color:var(--focusRing)]">
      <NotesDrawer
        isSidebarOpen={isSidebarOpen}
        currentNoteId={noteId ?? ''}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b tulis-border bg-[color:var(--surface)] px-3 py-2.5 sm:px-4">
          <div className="mx-auto flex min-w-0 max-w-[840px] items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--rSm)] border tulis-border bg-[color:var(--surface)] transition-colors hover:border-[color:var(--accent)] hover:bg-[color:var(--surface2)]"
                onClick={() => setIsSidebarOpen((open) => !open)}
                aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                {isSidebarOpen ? (
                  <svg
                    className="h-4 w-4 tulis-muted transition-colors group-hover:text-[color:var(--accent)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                  >
                    <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4 tulis-muted transition-colors group-hover:text-[color:var(--accent)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                  >
                    <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
                    <line x1="4" y1="12" x2="16" y2="12" strokeLinecap="round" />
                    <line x1="4" y1="18" x2="20" y2="18" strokeLinecap="round" />
                  </svg>
                )}
              </button>

              <input
                ref={titleInputRef}
                className={`min-w-0 flex-1 truncate rounded-[var(--rSm)] border px-2 py-1.5 text-[1.18rem] font-semibold tracking-tight placeholder:opacity-35 transition-colors focus:outline-none ${isTitleFocused
                  ? 'border-[color:var(--accent)] bg-[color:var(--surface2)]'
                  : 'border-transparent bg-transparent'
                  }`}
                value={title}
                onChange={(event) => {
                  const value = event.target.value;
                  setTitle(value);
                  const version = markDirty();
                  scheduleTitleSave({ newTitle: value, version });
                }}
                onFocus={() => setIsTitleFocused(true)}
                onBlur={() => setIsTitleFocused(false)}
                placeholder="Untitled"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="relative" ref={tagPopoverRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (isTagPopoverOpen) {
                      setIsTagPopoverOpen(false);
                      setTagInput('');
                      return;
                    }
                    openTagPopover();
                  }}
                  className={`inline-flex h-8 rounded-[var(--rSm)] border text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${hasTags ? 'items-center gap-1 px-2' : 'w-8 items-center justify-center px-0'} ${isTagPopoverOpen
                    ? 'border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--surface2)]'
                    : 'border-[color:var(--border)] tulis-muted hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                    }`}
                  aria-label="Manage tags"
                  title="Manage tags"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m20 13-7 7H4v-9l7-7 9 9Z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="7.5" cy="7.5" r="1.5" />
                  </svg>
                  {hasTags ? `${tags.length}` : null}
                </button>

                {isTagPopoverOpen && (
                  <div className="absolute right-0 top-10 z-50 w-[300px] max-w-[calc(100vw-1rem)] rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] tulis-muted">Tags</p>
                      {hasTags && (
                        <button
                          type="button"
                          onClick={() => {
                            void saveTagsNow([]);
                          }}
                          className="text-[10px] font-medium uppercase tracking-[0.08em] tulis-muted transition-colors hover:text-[color:var(--text)]"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {hasTags && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border2)] bg-[color:var(--surface2)] px-2 py-1 text-xs font-medium tulis-text"
                          >
                            #{tag}
                            <button
                              type="button"
                              onClick={() => {
                                void saveTagsNow(tags.filter((item) => item !== tag));
                              }}
                              className="rounded-full p-0.5 tulis-muted transition-colors hover:text-[color:var(--text)]"
                              aria-label={`Remove ${tag} tag`}
                            >
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
                                <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                                <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div>
                      <input
                        ref={tagInputRef}
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ',') {
                            event.preventDefault();
                            addTagFromInput();
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setIsTagPopoverOpen(false);
                            setTagInput('');
                          }
                          if (event.key === 'Backspace' && !tagInput.trim() && tags.length > 0) {
                            event.preventDefault();
                            void saveTagsNow(tags.slice(0, -1));
                          }
                        }}
                        placeholder={tags.length >= 10 ? 'Tag limit reached' : 'Press enter to add tag'}
                        disabled={tags.length >= 10}
                        className="h-8 w-full rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 text-xs tulis-text placeholder:text-[color:var(--text3)] focus:border-[color:var(--accent)] focus:outline-none disabled:opacity-50"
                      />
                    </div>

                    {tagSuggestions.length > 0 && (
                      <div className="mt-2 max-h-28 overflow-y-auto rounded-[var(--rSm)] border border-[color:var(--border2)] bg-[color:var(--surface2)] p-1">
                        {tagSuggestions.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              if (tags.includes(tag) || tags.length >= 10) return;
                              void saveTagsNow([...tags, tag]);
                              setTagInput('');
                            }}
                            className="w-full rounded-[var(--rSm)] px-2 py-1 text-left text-xs tulis-muted transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  void togglePinned();
                }}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--rSm)] border transition-colors ${pinned
                  ? 'border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--surface2)]'
                  : 'border-[color:var(--border)] tulis-muted hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                  }`}
                aria-label={pinned ? 'Unpin note' : 'Pin note'}
                title={pinned ? 'Unpin note' : 'Pin note'}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m12 17 4 4V9l3-5H5l3 5v12l4-4Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {ready && (
                <span className="hidden shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] tulis-muted sm:inline-flex">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${syncStatus === 'syncing'
                      ? 'bg-[color:var(--accent)]'
                      : syncStatus === 'loading'
                        ? 'bg-[color:var(--text3)]'
                      : syncStatus === 'error'
                        ? 'bg-[color:var(--text3)]'
                        : 'bg-[color:var(--text2)]'
                      }`}
                  />
                  {syncStatus === 'loading'
                    ? 'Loading'
                    : syncStatus === 'syncing'
                      ? 'Syncing'
                      : syncStatus === 'error'
                        ? 'Failed'
                        : 'Synced'}
                </span>
              )}
            </div>
          </div>

        </header>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-5 sm:px-6"
          onMouseDown={(event) => {
            if (!editor) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('.ProseMirror')) return;
            event.preventDefault();
            editor.commands.focus('end');
          }}
        >
          <div className="mx-auto min-h-full max-w-[840px] min-w-0">
            <EditorContent
              editor={editor}
              className="prose prose-lg dark:prose-invert max-w-none focus:outline-none tulis-text"
            />
          </div>
        </main>
      </div>

      {datePickerOpen && (
        <DatePicker
          onSelect={(date) => {
            editor?.chain().focus().setDateChip({ date: date.toISOString() }).run();
            setDatePickerOpen(false);
          }}
          onClose={() => setDatePickerOpen(false)}
        />
      )}
    </div>
  );
}
