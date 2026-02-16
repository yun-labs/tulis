'use client';

import { useEffect, useMemo, useState } from 'react';
import { NotesDrawer } from '@/components/notes/NotesDrawer';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Editor, EditorContent, useEditor, JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import debounce from 'lodash.debounce';
import { AbbrevExpand } from '@/editor/AbbrevExpand';
import { SlashCommand } from '@/lib/editor/SlashCommand';

type RouteParams = { id: string };

export default function NotePage({ params }: { params: Promise<RouteParams> }) {
  const { user, loading: authLoading } = useAuthGuard();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    params.then((resolved) => {
      if (active) setNoteId(resolved.id);
    });
    return () => {
      active = false;
    };
  }, [params]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
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

        // Only update editor if content is different to avoid cursor jumps
        const newContent = data.content_json || { type: 'doc', content: [] };
        const currentContent = editor.getJSON();

        if (JSON.stringify(newContent) !== JSON.stringify(currentContent)) {
          editor.commands.setContent(newContent, { emitUpdate: false });
        }

        setReady(true);
      }
    });

    return () => unsubscribe();
  }, [noteId, editor, user]);

  const saveContent = useMemo(
    () =>
      debounce(async (content: JSONContent) => {
        if (!noteId || !user) return;

        try {
          const noteRef = doc(db, 'notes', noteId);
          await updateDoc(noteRef, {
            content_json: content,
            updated_at: serverTimestamp(),
          });
        } catch (error) {
          console.error('Failed to save content:', error);
        }
      }, 800),
    [noteId, user]
  );

  const saveTitle = useMemo(
    () =>
      debounce(async (newTitle: string) => {
        if (!noteId || !user) return;

        try {
          const noteRef = doc(db, 'notes', noteId);
          await updateDoc(noteRef, {
            title: newTitle,
            updated_at: serverTimestamp(),
          });
        } catch (error) {
          console.error('Failed to save title:', error);
        }
      }, 600),
    [noteId, user]
  );

  // Listen to editor updates
  useEffect(() => {
    if (!editor) return;

    const handler = ({ editor }: { editor: Editor }) => {
      saveContent(editor.getJSON());
    };

    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
      (saveContent as unknown as { cancel: () => void }).cancel();
    };
  }, [editor, saveContent]);

  useEffect(() => {
    return () => {
      (saveTitle as unknown as { cancel: () => void }).cancel();
    };
  }, [saveTitle]);

  useEffect(() => {
    setMenuOpen(false);
  }, [noteId]);

  if (authLoading || !noteId) {
    return <div className="klaud-bg min-h-screen" />;
  }

  return (
    <div className="flex h-screen flex-col klaud-bg font-sans selection:bg-[color:var(--klaud-accent)]/30">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between klaud-border px-4 backdrop-blur-md bg-[color:var(--klaud-glass)] border-b shadow-sm transition-all duration-300">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <button
            type="button"
            className="group flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[color:var(--klaud-surface)] border klaud-border shadow-sm transition-all hover:border-[color:var(--klaud-accent)] active:scale-95"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle drawer"
          >
            <svg
              className={`h-5 w-5 klaud-muted transition-colors group-hover:text-[color:var(--klaud-accent)] ${menuOpen ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            >
              <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
              <line x1="4" y1="12" x2="16" y2="12" strokeLinecap="round" />
              <line x1="4" y1="18" x2="20" y2="18" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex-1 min-w-0 max-w-2xl px-1">
            <input
              className="w-full border-none bg-transparent text-xl font-bold klaud-text tracking-tight placeholder:opacity-30 focus:outline-none focus:ring-0 truncate"
              value={title}
              onChange={(event) => {
                const value = event.target.value;
                setTitle(value);
                saveTitle(value);
              }}
              placeholder="Start your masterpiece..."
            />
            {ready && (
              <div className="flex items-center gap-1.5 mt-[-4px]">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] uppercase tracking-widest klaud-muted font-bold opacity-60">Synced</span>
              </div>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 shrink-0 ml-4">
          <div className="text-[10px] uppercase tracking-widest klaud-muted font-bold px-3 py-1.5 rounded-full border klaud-border bg-[color:var(--klaud-surface)]">
            Zen Mode
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <NotesDrawer open={menuOpen} currentNoteId={noteId ?? ''} onClose={() => setMenuOpen(false)} />

        <main className="flex-1 relative overflow-hidden flex flex-col">
          <div
            className="w-full h-full overflow-y-auto px-4 pb-20 pt-8"
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
    </div>
  );
}
