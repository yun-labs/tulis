'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NotesDrawer } from '@/components/notes/NotesDrawer';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Editor, EditorContent, useEditor, JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { AbbrevExpand } from '@/editor/AbbrevExpand';
import { SlashCommand } from '@/lib/editor/SlashCommand';
import { TagChip } from '@/editor/TagChip';
import { DateChip } from '@/editor/DateChip';
import { DatePicker } from '@/components/editor/DatePicker';

type RouteParams = { id: string };
type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error';

export default function NotePage({ params }: { params: Promise<RouteParams> }) {
  const { user, loading: authLoading } = useAuthGuard();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const hasHydratedContentRef = useRef(false);
  const changeVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const contentSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    params.then((resolved) => {
      if (active) {
        setNoteId(resolved.id);
        setMenuOpen(false);
        setSyncStatus('loading');
      }
    });
    return () => {
      active = false;
    };
  }, [params]);

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

  const editor = useEditor({
    extensions: [
      StarterKit,
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

  // Firestore realtime listener
  useEffect(() => {
    if (!noteId || !editor || !user) return;

    const noteRef = doc(db, 'notes', noteId);
    const unsubscribe = onSnapshot(noteRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setTitle(data.title || '');

        // Avoid re-applying content while actively typing; this prevents cursor jumps.
        const newContent = data.content_json || { type: 'doc', content: [] };
        const currentContent = editor.getJSON();
        const isInitialHydration = !hasHydratedContentRef.current;
        const shouldApplyRemoteContent = isInitialHydration || !editor.isFocused;

        if (shouldApplyRemoteContent && JSON.stringify(newContent) !== JSON.stringify(currentContent)) {
          editor.commands.setContent(newContent, { emitUpdate: false });
        }

        hasHydratedContentRef.current = true;
        setReady(true);
        if (changeVersionRef.current === savedVersionRef.current) {
          setSyncStatus('synced');
        }
      }
    });

    return () => unsubscribe();
  }, [noteId, editor, user]);

  const saveContentNow = useCallback(async ({ content, version }: { content: JSONContent; version: number }) => {
    if (!noteId || !user) return;

    try {
      const noteRef = doc(db, 'notes', noteId);
      await updateDoc(noteRef, {
        content_json: content,
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
      const noteRef = doc(db, 'notes', noteId);
      await updateDoc(noteRef, {
        title: newTitle,
        updated_at: serverTimestamp(),
      });
      markSaved(version);
    } catch (error) {
      console.error('Failed to save title:', error);
      setSyncStatus('error');
    }
  }, [noteId, user, markSaved]);

  const scheduleContentSave = useCallback((payload: { content: JSONContent; version: number }) => {
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

  // Listen to editor updates
  useEffect(() => {
    if (!editor) return;

    const handler = ({ editor }: { editor: Editor }) => {
      const version = markDirty();
      scheduleContentSave({ content: editor.getJSON(), version });
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

    (editor as any).on('openDatePicker', handler);
    return () => {
      (editor as any).off('openDatePicker', handler);
    };
  }, [editor]);

  useEffect(() => {
    return () => {
      if (titleSaveTimeoutRef.current) {
        clearTimeout(titleSaveTimeoutRef.current);
      }
    };
  }, []);

  if (authLoading || !noteId) {
    return <div className="klaud-bg min-h-screen" />;
  }

  return (
    <div className="flex h-screen flex-col klaud-bg font-sans selection:bg-[color:var(--klaud-accent)]/30">
      <header className="sticky top-0 z-30 flex h-[4.6rem] shrink-0 items-center justify-between klaud-border px-3 sm:px-4 backdrop-blur-xl bg-[color:var(--klaud-glass)]/95 border-b shadow-sm transition-all duration-300">
        <div className="flex flex-1 items-center gap-4 min-w-0">
          <button
            type="button"
            className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-[color:var(--klaud-surface)] border klaud-border shadow-sm transition-all hover:border-[color:var(--klaud-accent)] hover:shadow-md active:scale-95"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle drawer"
          >
            <svg
              className={`h-[1.2rem] w-[1.2rem] klaud-muted transition-colors duration-200 group-hover:text-[color:var(--klaud-accent)] ${menuOpen ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
            >
              <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
              <line x1="4" y1="12" x2="16" y2="12" strokeLinecap="round" />
              <line x1="4" y1="18" x2="20" y2="18" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex-1 min-w-0 max-w-2xl px-1 py-1 flex flex-col gap-1.5">
            <input
              className={`w-full border-none text-[1.35rem] font-bold tracking-tight placeholder:opacity-30 focus:outline-none focus:ring-0 truncate rounded-lg px-2.5 py-1 -mx-2.5 transition-colors ${isTitleFocused
                ? 'bg-[color:var(--klaud-accent)]/9 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--klaud-accent)_40%,transparent)]'
                : 'bg-transparent'
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
              placeholder="Start your masterpiece..."
            />
            {ready && (
              <div className="flex items-center gap-1.5 min-h-3.5 pl-0.5">
                <div className={`h-1.5 w-1.5 rounded-full ${syncStatus === 'syncing'
                  ? 'bg-amber-500 animate-pulse'
                  : syncStatus === 'error'
                    ? 'bg-rose-500'
                    : 'bg-emerald-500'
                  }`} />
                <span className="text-[9px] uppercase tracking-widest klaud-muted font-bold opacity-60">
                  {syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'error' ? 'Sync failed' : 'Synced'}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <NotesDrawer open={menuOpen} currentNoteId={noteId ?? ''} onClose={() => setMenuOpen(false)} />

        <main className="flex-1 relative overflow-hidden flex flex-col">
          <div
            className="w-full h-full overflow-y-auto px-3 sm:px-4 pb-20 pt-8"
            onMouseDown={(event) => {
              if (!editor) return;
              const target = event.target as HTMLElement | null;
              if (target?.closest('.ProseMirror')) return;
              event.preventDefault();
              editor.commands.focus('end');
            }}
          >
            {/* Zen Editor Container */}
            <div className="mx-auto max-w-3xl min-h-full transition-all duration-300">
              <EditorContent
                editor={editor}
                className="prose prose-lg dark:prose-invert max-w-none focus:outline-none klaud-text"
              />
            </div>
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
