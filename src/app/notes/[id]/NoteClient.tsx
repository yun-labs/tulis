'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { NotesDrawer } from '@/components/notes/NotesDrawer';
import { NotePageSkeleton } from '@/components/notes/NotePageSkeleton';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { db } from '@/lib/firebase';
import { deleteDoc, deleteField, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { appNoteDoc, appNotesCollection } from '@/lib/firestorePaths';
import { Editor, EditorContent, JSONContent, useEditor } from '@tiptap/react';
import { redoDepth, undoDepth } from '@tiptap/pm/history';
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
import { normalizeLabel, normalizeLabels } from '@/lib/notes';
import { ensureUserHasNote } from '@/lib/notesLifecycle';

type SyncStatus = 'loading' | 'syncing' | 'synced' | 'error';
type SelectionToolbarState = {
  visible: boolean;
  isMobile: boolean;
  left: number;
  top: number;
};
type SidebarMode = 'notes' | 'trash';

const IS_DEV = process.env.NODE_ENV === 'development';

function markDevPerf(name: string) {
  if (!IS_DEV || typeof window === 'undefined' || typeof performance === 'undefined') return;
  try {
    performance.mark(name);
  } catch {
    // Ignore unsupported performance APIs.
  }
}

function measureDevPerf(name: string, startMark: string, endMark: string) {
  if (!IS_DEV || typeof window === 'undefined' || typeof performance === 'undefined') return;
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name);
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
      console.info(`[perf] ${name}: ${Math.round(lastEntry.duration)}ms`);
    }
  } catch {
    // Ignore missing marks or unsupported performance APIs.
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepEqualJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!deepEqualJsonValue(a[index], b[index])) return false;
    }
    return true;
  }

  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqualJsonValue(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

function isEquivalentEditorContent(a: JSONContent, b: JSONContent): boolean {
  return deepEqualJsonValue(a, b);
}

function stripCompletedTasksFromNode(node: JSONContent): { node: JSONContent | null; removedCount: number } {
  let removedCount = 0;
  const children = Array.isArray(node.content) ? node.content : null;

  if (!children) {
    return { node, removedCount };
  }

  const nextChildren: JSONContent[] = [];
  let changed = false;

  for (const child of children) {
    if (child.type === 'taskItem' && child.attrs?.checked === true) {
      removedCount += 1;
      changed = true;
      continue;
    }

    const result = stripCompletedTasksFromNode(child);
    removedCount += result.removedCount;

    if (!result.node) {
      changed = true;
      continue;
    }

    if (result.node !== child) {
      changed = true;
    }

    nextChildren.push(result.node);
  }

  if (node.type === 'taskList' && nextChildren.length === 0) {
    return { node: null, removedCount };
  }

  if (!changed) {
    return { node, removedCount };
  }

  return {
    node: {
      ...node,
      content: nextChildren,
    },
    removedCount,
  };
}

function stripCompletedTasksFromDoc(doc: JSONContent): { doc: JSONContent; removedCount: number } {
  const result = stripCompletedTasksFromNode(doc);
  if (!result.node || result.node.type !== 'doc') {
    return { doc: { type: 'doc', content: [] }, removedCount: result.removedCount };
  }
  return { doc: result.node, removedCount: result.removedCount };
}

export default function NoteClient() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthGuard();
  const noteId = typeof routeParams?.id === 'string' ? routeParams.id : null;
  const [title, setTitle] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [allUserLabels, setAllUserLabels] = useState<string[]>([]);
  const [hasTrashNotes, setHasTrashNotes] = useState(false);
  const [hasLoadedUserNotes, setHasLoadedUserNotes] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [deletedAt, setDeletedAt] = useState<Timestamp | null>(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('notes');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 767px)').matches;
  });
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const [isHeaderActionsMenuOpen, setIsHeaderActionsMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [confirmPermanentDeleteOpen, setConfirmPermanentDeleteOpen] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState>({
    visible: false,
    isMobile: false,
    left: 0,
    top: 0,
  });
  const [mobileToolbarBottom, setMobileToolbarBottom] = useState(12);
  const hasHydratedContentRef = useRef(false);
  const lastSubmittedContentRef = useRef<JSONContent | null>(null);
  const changeVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const contentSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const labelPopoverRef = useRef<HTMLDivElement | null>(null);
  const editorScrollRef = useRef<HTMLElement | null>(null);
  const lastSelectionRangeRef = useRef<{ from: number; to: number } | null>(null);
  const selectionGestureActiveRef = useRef(false);
  const mobileSidebarSwipeRef = useRef({
    tracking: false,
    opened: false,
    touchId: -1,
    startX: 0,
    startY: 0,
  });
  const focusedTitleForNoteRef = useRef<string | null>(null);
  const recoveringNoteRef = useRef(false);
  const trashCleanupRunningRef = useRef(false);
  const perfMarksRef = useRef({
    noteSnapshotMarked: false,
    contentAppliedMarked: false,
    readyMarked: false,
  });
  const shouldFocusTitle = searchParams.get('focus') === 'title';
  const isReadOnly = isDeleted || sidebarMode === 'trash';
  const isTrashEmptyView = sidebarMode === 'trash' && hasLoadedUserNotes && !hasTrashNotes;

  useEffect(() => {
    if (noteId) {
      setSyncStatus('loading');
    }
  }, [noteId]);

  useEffect(() => {
    hasHydratedContentRef.current = false;
    lastSubmittedContentRef.current = null;
    changeVersionRef.current = 0;
    savedVersionRef.current = 0;
    setConfirmPermanentDeleteOpen(false);
    setIsHeaderActionsMenuOpen(false);
    perfMarksRef.current.noteSnapshotMarked = false;
    perfMarksRef.current.contentAppliedMarked = false;
    perfMarksRef.current.readyMarked = false;
    if (noteId) {
      markDevPerf('notes-note:route-start');
    }
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
    if (!user) {
      setAllUserLabels([]);
      setHasTrashNotes(false);
      setHasLoadedUserNotes(false);
      return;
    }
    if (!ready) return;

    const byOwnerUid = query(appNotesCollection(db), where('ownerUid', '==', user.uid));

    const collectLabels = (docs: Array<{ data: () => Record<string, unknown> }>) => {
      const deduped = new Set<string>();

      docs.forEach((snapshotDoc) => {
        const data = snapshotDoc.data();
        if (data.isDeleted === true) return;
        if (!Array.isArray(data.labels)) return;
        data.labels.forEach((tag) => {
          if (typeof tag !== 'string') return;
          const normalized = normalizeLabel(tag);
          if (normalized) deduped.add(normalized);
        });
      });

      return [...deduped].sort((a, b) => a.localeCompare(b));
    };

    let ownerUidDocs: Array<{ data: () => Record<string, unknown> }> = [];

    const sync = () => {
      setAllUserLabels(collectLabels(ownerUidDocs));
      setHasTrashNotes(ownerUidDocs.some((snapshotDoc) => snapshotDoc.data().isDeleted === true));
      setHasLoadedUserNotes(true);
    };

    const unsubscribeOwnerUid = onSnapshot(byOwnerUid, (snapshot) => {
      ownerUidDocs = snapshot.docs;
      sync();
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Label sync permission denied for ownerUid query.');
        return;
      }
      console.error('Label sync error (ownerUid):', error);
      setHasLoadedUserNotes(true);
    });

    return () => {
      unsubscribeOwnerUid();
    };
  }, [ready, user]);

  useEffect(() => {
    if (!noteId || !editor || !user) return;

    const noteRef = appNoteDoc(db, noteId);
    const unsubscribe = onSnapshot(noteRef, (snapshot) => {
      if (!snapshot.exists()) {
        void redirectToAccessibleNote();
        return;
      }

      if (!perfMarksRef.current.noteSnapshotMarked) {
        perfMarksRef.current.noteSnapshotMarked = true;
        markDevPerf('notes-note:first-snapshot');
        measureDevPerf('notes-note:route-to-first-snapshot', 'notes-note:route-start', 'notes-note:first-snapshot');
      }

      const data = snapshot.data();
      setTitle(typeof data.title === 'string' ? data.title : '');
      setPinned(Boolean(data.pinned));
      const deleted = data.isDeleted === true;
      setIsDeleted(deleted);
      setDeletedAt((data.deletedAt as Timestamp | null) || null);
      if (deleted) {
        setSidebarMode('trash');
        setIsHeaderActionsMenuOpen(false);
        setIsLabelPopoverOpen(false);
      }
      try {
        window.localStorage.setItem(`tulis:lastNoteId:${user.uid}`, noteId);
      } catch {
        // Ignore localStorage write failures.
      }

      const incomingLabels = Array.isArray(data.labels)
        ? normalizeLabels(data.labels.filter((value): value is string => typeof value === 'string'))
        : [];
      setLabels(incomingLabels);

      const newContent = data.contentJson || { type: 'doc', content: [] };
      const currentContent = editor.getJSON();
      const isInitialHydration = !hasHydratedContentRef.current;
      const hasPendingLocalContent = changeVersionRef.current > savedVersionRef.current;
      const remoteMatchesLastSubmitted =
        !!lastSubmittedContentRef.current && isEquivalentEditorContent(newContent, lastSubmittedContentRef.current);
      const remoteMatchesCurrentEditor = isEquivalentEditorContent(newContent, currentContent);
      const isExpectedLocalContentEcho =
        !isInitialHydration &&
        remoteMatchesLastSubmitted;
      const shouldApplyRemoteContent = isInitialHydration || !hasPendingLocalContent;

      if (!remoteMatchesCurrentEditor && !isExpectedLocalContentEcho && shouldApplyRemoteContent) {
        const selectionBefore = editor.state.selection;
        editor
          .chain()
          .setMeta('addToHistory', false)
          .setContent(newContent, { emitUpdate: false })
          .run();

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
      if (isInitialHydration && !perfMarksRef.current.contentAppliedMarked) {
        perfMarksRef.current.contentAppliedMarked = true;
        markDevPerf('notes-note:content-applied');
        measureDevPerf('notes-note:route-to-content-applied', 'notes-note:route-start', 'notes-note:content-applied');
      }
      setReady(true);
      if (!perfMarksRef.current.readyMarked) {
        perfMarksRef.current.readyMarked = true;
        markDevPerf('notes-note:ready');
        measureDevPerf('notes-note:route-to-ready', 'notes-note:route-start', 'notes-note:ready');
      }
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

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isReadOnly);
    if (isReadOnly) {
      setIsHeaderActionsMenuOpen(false);
      setIsLabelPopoverOpen(false);
      setDatePickerOpen(false);
      setSelectionToolbar((current) => (current.visible ? { ...current, visible: false } : current));
    }
  }, [editor, isReadOnly]);

  const saveContentNow = useCallback(async ({
    content,
    plainText,
    version,
  }: {
    content: JSONContent;
    plainText: string;
    version: number;
  }) => {
    if (!noteId || !user || isReadOnly) return;

    try {
      const noteRef = appNoteDoc(db, noteId);
      lastSubmittedContentRef.current = content;
      await updateDoc(noteRef, {
        contentJson: content,
        content: plainText,
        updatedAt: serverTimestamp(),
      });
      markSaved(version);
    } catch (error) {
      console.error('Failed to save content:', error);
      setSyncStatus('error');
    }
  }, [isReadOnly, noteId, user, markSaved]);

  const saveTitleNow = useCallback(async ({ newTitle, version }: { newTitle: string; version: number }) => {
    if (!noteId || !user || isReadOnly) return;

    try {
      const noteRef = appNoteDoc(db, noteId);
      await updateDoc(noteRef, {
        title: newTitle,
        updatedAt: serverTimestamp(),
      });
      markSaved(version);
    } catch (error) {
      console.error('Failed to save title:', error);
      setSyncStatus('error');
    }
  }, [isReadOnly, noteId, user, markSaved]);

  const saveLabelsNow = useCallback(async (nextLabels: string[]) => {
    if (!noteId || !user || isReadOnly) return;

    const normalized = normalizeLabels(nextLabels);
    setLabels(normalized);

    try {
      await updateDoc(appNoteDoc(db, noteId), {
        labels: normalized,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to save labels:', error);
      setSyncStatus('error');
    }
  }, [isReadOnly, noteId, user]);

  const togglePinned = useCallback(async () => {
    if (!noteId || !user || isReadOnly) return;

    const nextPinned = !pinned;
    setPinned(nextPinned);

    try {
      await updateDoc(appNoteDoc(db, noteId), {
        pinned: nextPinned,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      setSyncStatus('error');
      setPinned(!nextPinned);
    }
  }, [isReadOnly, noteId, user, pinned]);

  const moveCurrentNoteToTrash = useCallback(async () => {
    if (!noteId || !user || isReadOnly) return;

    setIsHeaderActionsMenuOpen(false);
    setIsLabelPopoverOpen(false);

    try {
      await updateDoc(appNoteDoc(db, noteId), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to move note to trash:', error);
      setSyncStatus('error');
    }
  }, [isReadOnly, noteId, user]);

  const clearCompletedTasks = useCallback(() => {
    if (!editor || isReadOnly) return;

    const currentDoc = editor.getJSON();
    const { doc: nextDoc, removedCount } = stripCompletedTasksFromDoc(currentDoc);
    if (removedCount === 0) {
      setIsHeaderActionsMenuOpen(false);
      return;
    }

    setIsHeaderActionsMenuOpen(false);
    setIsLabelPopoverOpen(false);
    editor.commands.setContent(nextDoc, { emitUpdate: true });
    editor.commands.focus();
  }, [editor, isReadOnly]);

  const restoreNoteFromTrash = useCallback(async () => {
    if (!noteId || !user || !isDeleted) return;

    try {
      await updateDoc(appNoteDoc(db, noteId), {
        isDeleted: false,
        deletedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
      setSidebarMode('notes');
      setConfirmPermanentDeleteOpen(false);
    } catch (error) {
      console.error('Failed to restore note:', error);
      setSyncStatus('error');
    }
  }, [isDeleted, noteId, user]);

  const cleanupExpiredTrashNotes = useCallback(async () => {
    if (!user || trashCleanupRunningRef.current) return;

    trashCleanupRunningRef.current = true;
    try {
      const retentionMs = 30 * 24 * 60 * 60 * 1000;
      const cutoffMs = Date.now() - retentionMs;
      const snapshot = await getDocs(query(appNotesCollection(db), where('ownerUid', '==', user.uid)));

      const expiredDocs = snapshot.docs.filter((docSnapshot) => {
        const data = docSnapshot.data();
        if (data.isDeleted !== true) return false;
        const deletedAt = (data.deletedAt as Timestamp | null) || null;
        if (!deletedAt?.toMillis) return false;
        return deletedAt.toMillis() <= cutoffMs;
      });

      if (expiredDocs.length === 0) return;

      for (let index = 0; index < expiredDocs.length; index += 500) {
        const batch = writeBatch(db);
        expiredDocs.slice(index, index + 500).forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('Failed to clean expired trash notes:', error);
    } finally {
      trashCleanupRunningRef.current = false;
    }
  }, [user]);

  const permanentlyDeleteCurrentNote = useCallback(async () => {
    if (!noteId || !user) return;

    try {
      await deleteDoc(appNoteDoc(db, noteId));
      setConfirmPermanentDeleteOpen(false);

      if (sidebarMode === 'trash') {
        const snapshot = await getDocs(query(appNotesCollection(db), where('ownerUid', '==', user.uid)));
        const remainingTrash = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              isDeleted: data.isDeleted === true,
              deletedAt: (data.deletedAt as Timestamp | null) || null,
            };
          })
          .filter((item) => item.id !== noteId && item.isDeleted)
          .sort((a, b) => (b.deletedAt?.toMillis?.() ?? 0) - (a.deletedAt?.toMillis?.() ?? 0));

        if (remainingTrash.length > 0) {
          router.replace(`/notes/${remainingTrash[0].id}`);
          return;
        }
      }

      const { noteId: nextNoteId, created } = await ensureUserHasNote(user.uid, { excludeNoteId: noteId });
      setSidebarMode('notes');
      router.replace(created ? `/notes/${nextNoteId}?focus=title` : `/notes/${nextNoteId}`);
    } catch (error) {
      console.error('Failed to permanently delete note:', error);
      setSyncStatus('error');
    }
  }, [noteId, router, sidebarMode, user]);

  useEffect(() => {
    if (!user || sidebarMode !== 'trash') return;
    void cleanupExpiredTrashNotes();
  }, [cleanupExpiredTrashNotes, sidebarMode, user]);

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

  const openLabelPopover = useCallback(() => {
    if (isReadOnly) return;
    setIsHeaderActionsMenuOpen(false);
    setIsLabelPopoverOpen(true);
    window.requestAnimationFrame(() => {
      labelInputRef.current?.focus();
    });
  }, [isReadOnly]);

  const labelSuggestions = useMemo(() => {
    const normalizedInput = normalizeLabel(labelInput) || labelInput.trim().toLowerCase();
    const availableLabels = allUserLabels.filter((label) => !labels.includes(label));
    if (!normalizedInput) return availableLabels.slice(0, 8);

    return availableLabels
      .filter((label) => label.includes(normalizedInput))
      .slice(0, 8);
  }, [allUserLabels, labelInput, labels]);

  const addLabelFromInput = useCallback(() => {
    const normalized = normalizeLabel(labelInput);
    if (!normalized) {
      setLabelInput('');
      return;
    }

    if (labels.includes(normalized)) {
      setLabelInput('');
      return;
    }

    if (labels.length >= 10) {
      setLabelInput('');
      return;
    }

    setLabelInput('');
    void saveLabelsNow([...labels, normalized]);
  }, [labelInput, labels, saveLabelsNow]);

  const hideSelectionToolbar = useCallback(() => {
    setSelectionToolbar((current) => (current.visible ? { ...current, visible: false } : current));
  }, []);

  const isMobileSelectionViewport = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  }, []);

  const updateSelectionToolbar = useCallback((targetEditor: Editor | null = editor, options?: { force?: boolean }) => {
    if (!targetEditor || typeof window === 'undefined') {
      hideSelectionToolbar();
      return;
    }
    if (isReadOnly) {
      hideSelectionToolbar();
      return;
    }

    if (selectionGestureActiveRef.current && !options?.force) {
      hideSelectionToolbar();
      return;
    }

    const { from, to, empty } = targetEditor.state.selection;
    if (empty || targetEditor.isActive('codeBlock')) {
      hideSelectionToolbar();
      return;
    }

    lastSelectionRangeRef.current = { from, to };
    const isMobileViewport = isMobileSelectionViewport();

    if (isMobileViewport) {
      setSelectionToolbar({
        visible: true,
        isMobile: true,
        left: window.innerWidth / 2,
        top: 0,
      });
      return;
    }

    try {
      const start = targetEditor.view.coordsAtPos(from);
      const end = targetEditor.view.coordsAtPos(to);
      const centerX = (start.left + end.right) / 2;
      const estimatedWidth = 230;
      const edgePadding = 12;
      const left = Math.max(
        edgePadding + estimatedWidth / 2,
        Math.min(centerX, window.innerWidth - edgePadding - estimatedWidth / 2),
      );
      const top = Math.max(12, Math.min(start.top, end.top) - 10);

      setSelectionToolbar({
        visible: true,
        isMobile: false,
        left,
        top,
      });
    } catch {
      hideSelectionToolbar();
    }
  }, [editor, hideSelectionToolbar, isMobileSelectionViewport, isReadOnly]);

  const runSelectionMarkToggle = useCallback((mark: 'bold' | 'italic' | 'underline' | 'strike' | 'code') => {
    if (!editor || isReadOnly) return;

    const chain = editor.chain().focus();
    if (editor.state.selection.empty && lastSelectionRangeRef.current) {
      chain.setTextSelection(lastSelectionRangeRef.current);
    }

    if (mark === 'bold') chain.toggleBold();
    if (mark === 'italic') chain.toggleItalic();
    if (mark === 'underline') chain.toggleUnderline();
    if (mark === 'strike') chain.toggleStrike();
    if (mark === 'code') chain.toggleCode();
    chain.run();

    window.requestAnimationFrame(() => updateSelectionToolbar(editor));
  }, [editor, isReadOnly, updateSelectionToolbar]);

  const getSelectionAnchor = useCallback(() => {
    if (!editor) return null;
    if (!editor.state.selection.empty) {
      return { from: editor.state.selection.from, to: editor.state.selection.to };
    }
    return lastSelectionRangeRef.current;
  }, [editor]);

  const canShiftListItem = useCallback((direction: 'left' | 'right', itemType: 'taskItem' | 'listItem') => {
    if (!editor || isReadOnly) return false;

    const selection = getSelectionAnchor();
    if (!selection) return false;

    const canChain = editor.can().chain();
    canChain.setTextSelection({ from: selection.from, to: selection.from });

    if (direction === 'right') {
      canChain.sinkListItem(itemType);
    } else {
      canChain.liftListItem(itemType);
    }

    return canChain.run();
  }, [editor, getSelectionAnchor, isReadOnly]);

  const resetMobileSidebarSwipe = useCallback(() => {
    mobileSidebarSwipeRef.current.tracking = false;
    mobileSidebarSwipeRef.current.opened = false;
    mobileSidebarSwipeRef.current.touchId = -1;
  }, []);

  const findTrackedTouch = useCallback((touches: TouchList) => {
    const trackedTouchId = mobileSidebarSwipeRef.current.touchId;
    if (trackedTouchId < 0) return touches[0] ?? null;

    for (let index = 0; index < touches.length; index += 1) {
      if (touches[index]?.identifier === trackedTouchId) {
        return touches[index];
      }
    }

    return null;
  }, []);

  const handleMobileSidebarSwipeStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    resetMobileSidebarSwipe();

    if (isSidebarOpen) return;
    if (event.touches.length !== 1) return;
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches) return;

    const touch = event.touches[0];
    // Leave the far-left edge to the browser/OS back-swipe gesture.
    const reservedBackGestureEdge = 28;
    // Allow a broader, more natural left-side swipe zone without taking over the whole viewport.
    const sidebarSwipeStartMax = Math.max(140, Math.min(window.innerWidth * 0.42, 240));

    if (touch.clientX <= reservedBackGestureEdge || touch.clientX > sidebarSwipeStartMax) {
      return;
    }

    mobileSidebarSwipeRef.current.tracking = true;
    mobileSidebarSwipeRef.current.startX = touch.clientX;
    mobileSidebarSwipeRef.current.startY = touch.clientY;
    mobileSidebarSwipeRef.current.touchId = touch.identifier;
  }, [isSidebarOpen, resetMobileSidebarSwipe]);

  const handleMobileSidebarSwipeMove = useCallback((event: TouchEvent) => {
    const swipe = mobileSidebarSwipeRef.current;
    if (!swipe.tracking || swipe.opened) return;

    const touch = findTrackedTouch(event.touches);
    if (!touch) {
      resetMobileSidebarSwipe();
      return;
    }
    const deltaX = touch.clientX - swipe.startX;
    const deltaY = touch.clientY - swipe.startY;

    if (deltaX < -8) {
      resetMobileSidebarSwipe();
      return;
    }

    if (Math.abs(deltaY) > 56 && Math.abs(deltaY) > Math.abs(deltaX)) {
      resetMobileSidebarSwipe();
      return;
    }

    if (deltaX >= 56 && deltaX > Math.abs(deltaY) * 1.2) {
      if (event.cancelable) {
        event.preventDefault();
      }
      swipe.opened = true;
      setIsSidebarOpen(true);
    }
  }, [findTrackedTouch, resetMobileSidebarSwipe]);

  const handleMobileSidebarSwipeEnd = useCallback((event: TouchEvent) => {
    const swipe = mobileSidebarSwipeRef.current;
    if (!swipe.tracking) return;

    if (event.type === 'touchcancel') {
      resetMobileSidebarSwipe();
      return;
    }

    const stillTrackingTouch = findTrackedTouch(event.touches);
    if (stillTrackingTouch) return;

    resetMobileSidebarSwipe();
  }, [findTrackedTouch, resetMobileSidebarSwipe]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onTouchMove = (event: TouchEvent) => {
      handleMobileSidebarSwipeMove(event);
    };
    const onTouchEnd = (event: TouchEvent) => {
      handleMobileSidebarSwipeEnd(event);
    };

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [handleMobileSidebarSwipeEnd, handleMobileSidebarSwipeMove]);

  const runSelectionListShift = useCallback((direction: 'left' | 'right') => {
    if (!editor || isReadOnly) return;

    const selection = getSelectionAnchor();
    if (!selection) return;

    const apply = (itemType: 'taskItem' | 'listItem') => {
      const chain = editor.chain().focus();
      chain.setTextSelection({ from: selection.from, to: selection.from });

      if (direction === 'right') {
        chain.sinkListItem(itemType);
      } else {
        chain.liftListItem(itemType);
      }

      return chain.run();
    };

    const didRun = canShiftListItem(direction, 'taskItem')
      ? apply('taskItem')
      : canShiftListItem(direction, 'listItem')
        ? apply('listItem')
        : false;

    if (!didRun) return;
    window.requestAnimationFrame(() => updateSelectionToolbar(editor));
  }, [canShiftListItem, editor, getSelectionAnchor, isReadOnly, updateSelectionToolbar]);

  useEffect(() => {
    if (!editor) return;

    const handler = ({ editor }: { editor: Editor }) => {
      if (isReadOnly) return;
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
  }, [editor, isReadOnly, scheduleContentSave, markDirty]);

  useEffect(() => {
    if (!editor) return;

    const handler = () => {
      if (isReadOnly) return;
      setDatePickerOpen(true);
    };

    onOpenDatePicker(editor, handler);
    return () => {
      offOpenDatePicker(editor, handler);
    };
  }, [editor, isReadOnly]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isReadOnly) return;
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== 't') return;
      event.preventDefault();
      openLabelPopover();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isReadOnly, openLabelPopover]);

  useEffect(() => {
    if (!isLabelPopoverOpen && !isHeaderActionsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (labelPopoverRef.current?.contains(target)) return;
      setIsHeaderActionsMenuOpen(false);
      setIsLabelPopoverOpen(false);
      setLabelInput('');
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsHeaderActionsMenuOpen(false);
      setIsLabelPopoverOpen(false);
      setLabelInput('');
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isHeaderActionsMenuOpen, isLabelPopoverOpen]);

  useEffect(() => {
    if (!editor) return;

    const refresh = () => {
      window.requestAnimationFrame(() => {
        updateSelectionToolbar(editor);
      });
    };
    const hide = () => {
      if (!isMobileSelectionViewport()) {
        hideSelectionToolbar();
        return;
      }
      window.requestAnimationFrame(() => {
        updateSelectionToolbar(editor, { force: true });
      });
    };

    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    editor.on('focus', refresh);
    editor.on('blur', hide);
    refresh();

    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
      editor.off('focus', refresh);
      editor.off('blur', hide);
    };
  }, [editor, hideSelectionToolbar, isMobileSelectionViewport, updateSelectionToolbar]);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionChange = () => {
      if (isReadOnly) return;
      if (!isMobileSelectionViewport()) return;

      const domSelection = window.getSelection();
      if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) {
        hideSelectionToolbar();
        return;
      }

      const anchorNode = domSelection.anchorNode;
      const focusNode = domSelection.focusNode;
      const isInsideEditor = Boolean(
        (anchorNode && editor.view.dom.contains(anchorNode))
        || (focusNode && editor.view.dom.contains(focusNode))
      );

      if (!isInsideEditor) {
        hideSelectionToolbar();
        return;
      }

      window.requestAnimationFrame(() => {
        updateSelectionToolbar(editor, { force: true });
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editor, hideSelectionToolbar, isMobileSelectionViewport, isReadOnly, updateSelectionToolbar]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectionToolbar.visible || !selectionToolbar.isMobile) return;

    const syncBottomInset = () => {
      const viewport = window.visualViewport;
      if (!viewport) {
        setMobileToolbarBottom(12);
        return;
      }

      const occludedBottom = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
      setMobileToolbarBottom(12 + occludedBottom);
    };

    syncBottomInset();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', syncBottomInset);
    viewport?.addEventListener('scroll', syncBottomInset);
    window.addEventListener('resize', syncBottomInset);

    return () => {
      viewport?.removeEventListener('resize', syncBottomInset);
      viewport?.removeEventListener('scroll', syncBottomInset);
      window.removeEventListener('resize', syncBottomInset);
    };
  }, [selectionToolbar.isMobile, selectionToolbar.visible]);

  useEffect(() => {
    if (!editor) return;

    const handlePointerDown = () => {
      selectionGestureActiveRef.current = true;
      hideSelectionToolbar();
    };

    const finishSelectionGesture = () => {
      if (!selectionGestureActiveRef.current) return;
      selectionGestureActiveRef.current = false;
      window.requestAnimationFrame(() => {
        updateSelectionToolbar(editor, { force: true });
      });
    };

    editor.view.dom.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', finishSelectionGesture);
    window.addEventListener('pointercancel', finishSelectionGesture);
    window.addEventListener('mouseup', finishSelectionGesture);
    window.addEventListener('touchend', finishSelectionGesture);
    window.addEventListener('touchcancel', finishSelectionGesture);

    return () => {
      editor.view.dom.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', finishSelectionGesture);
      window.removeEventListener('pointercancel', finishSelectionGesture);
      window.removeEventListener('mouseup', finishSelectionGesture);
      window.removeEventListener('touchend', finishSelectionGesture);
      window.removeEventListener('touchcancel', finishSelectionGesture);
    };
  }, [editor, hideSelectionToolbar, updateSelectionToolbar]);

  useEffect(() => {
    if (!editor) return;

    const refresh = () => {
      window.requestAnimationFrame(() => {
        updateSelectionToolbar(editor);
      });
    };

    const handleResize = () => refresh();
    const handleScroll = () => refresh();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    const editorScroller = editorScrollRef.current;
    editorScroller?.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      editorScroller?.removeEventListener('scroll', handleScroll);
    };
  }, [editor, updateSelectionToolbar]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.tulis-selection-toolbar')) return;
      if (target.closest('.ProseMirror')) return;
      hideSelectionToolbar();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [hideSelectionToolbar]);

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

  const hasLabels = labels.length > 0;
  const displayTitle = isTrashEmptyView ? '' : title;
  const titlePlaceholder = isTrashEmptyView ? '' : 'Untitled';
  const autoDeleteDate = useMemo(() => {
    if (!deletedAt?.toDate) return null;
    const ms = deletedAt.toDate().getTime() + (30 * 24 * 60 * 60 * 1000);
    return new Date(ms);
  }, [deletedAt]);
  const canTabLeft = canShiftListItem('left', 'taskItem') || canShiftListItem('left', 'listItem');
  const canTabRight = canShiftListItem('right', 'taskItem') || canShiftListItem('right', 'listItem');
  const canUndo = !isReadOnly && !!editor && undoDepth(editor.state) > 0;
  const canRedo = !isReadOnly && !!editor && redoDepth(editor.state) > 0;
  const runUndo = () => {
    if (!editor || isReadOnly) return false;
    if (!editor.isFocused) {
      return editor.chain().focus().undo().run();
    }
    return editor.commands.undo();
  };
  const runRedo = () => {
    if (!editor || isReadOnly) return false;
    if (!editor.isFocused) {
      return editor.chain().focus().redo().run();
    }
    return editor.commands.redo();
  };
  const selectionToolbarButtons = [
    {
      id: 'tab-left',
      label: '<',
      ariaLabel: 'Tab left',
      active: false,
      disabled: !canTabLeft,
      onPress: () => runSelectionListShift('left'),
      className: 'font-semibold',
    },
    {
      id: 'tab-right',
      label: '>',
      ariaLabel: 'Tab right',
      active: false,
      disabled: !canTabRight,
      onPress: () => runSelectionListShift('right'),
      className: 'font-semibold',
    },
    {
      id: 'bold',
      label: 'B',
      ariaLabel: 'Toggle bold',
      active: editor?.isActive('bold') ?? false,
      disabled: false,
      onPress: () => runSelectionMarkToggle('bold'),
      className: 'font-bold',
    },
    {
      id: 'italic',
      label: 'I',
      ariaLabel: 'Toggle italic',
      active: editor?.isActive('italic') ?? false,
      disabled: false,
      onPress: () => runSelectionMarkToggle('italic'),
      className: 'italic',
    },
    {
      id: 'underline',
      label: 'U',
      ariaLabel: 'Toggle underline',
      active: editor?.isActive('underline') ?? false,
      disabled: false,
      onPress: () => runSelectionMarkToggle('underline'),
      className: 'underline decoration-2',
    },
    {
      id: 'strike',
      label: 'S',
      ariaLabel: 'Toggle strikethrough',
      active: editor?.isActive('strike') ?? false,
      disabled: false,
      onPress: () => runSelectionMarkToggle('strike'),
      className: 'line-through decoration-2',
    },
    {
      id: 'inline-code',
      label: '</>',
      ariaLabel: 'Toggle inline code',
      active: editor?.isActive('code') ?? false,
      disabled: false,
      onPress: () => runSelectionMarkToggle('code'),
      className: 'font-mono text-[11px] tracking-tight',
    },
  ];

  if (!noteId || authLoading || !user) {
    return <NotePageSkeleton />;
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden tulis-bg font-sans selection:bg-[color:var(--focusRing)]"
      onTouchStart={handleMobileSidebarSwipeStart}
    >
      <NotesDrawer
        isSidebarOpen={isSidebarOpen}
        currentNoteId={noteId ?? ''}
        sidebarMode={sidebarMode}
        onSidebarModeChange={setSidebarMode}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--canvas)]">
        <header className="shrink-0 border-b border-[color:var(--divider)] bg-[color:var(--header)] px-3 py-2.5 sm:px-4">
          <div className="mx-auto grid min-w-0 max-w-[840px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_13.75rem] sm:gap-3">
            <div className="flex min-w-0 items-center justify-start">
              <button
                type="button"
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--rSm)] border tulis-border bg-[color:var(--surface)] transition-colors hover:border-[color:var(--border)] hover:bg-[color:var(--surface2)]"
                onClick={() => setIsSidebarOpen((open) => !open)}
                aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                {isSidebarOpen ? (
                  <svg
                    className="h-4 w-4 tulis-muted transition-colors group-hover:text-[color:var(--text)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                  >
                    <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4 tulis-muted transition-colors group-hover:text-[color:var(--text)]"
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
            </div>

            <div className="min-w-0">
              <input
                ref={titleInputRef}
                className={`min-w-0 w-full truncate rounded-[var(--rSm)] border px-2 py-1.5 text-[1.18rem] font-semibold tracking-tight placeholder:opacity-35 transition-colors focus:outline-none ${isTitleFocused
                  ? 'border-[color:var(--accent)] bg-[color:var(--surface2)]'
                  : 'border-transparent bg-transparent'
                  }`}
                value={displayTitle}
                readOnly={isReadOnly}
                onChange={(event) => {
                  if (isReadOnly) return;
                  const value = event.target.value;
                  setTitle(value);
                  const version = markDirty();
                  scheduleTitleSave({ newTitle: value, version });
                }}
                onFocus={() => setIsTitleFocused(true)}
                onBlur={() => setIsTitleFocused(false)}
                placeholder={titlePlaceholder}
              />
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2">
              {!isReadOnly && ready && (
                <span className={`hidden w-[6.25rem] shrink-0 items-center justify-end gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] md:inline-flex ${syncStatus === 'error' ? 'text-red-500' : 'tulis-muted'}`}>
                  {syncStatus === 'loading'
                    ? 'Loading'
                    : syncStatus === 'syncing'
                      ? 'Syncing'
                      : syncStatus === 'error'
                        ? 'Failed'
                        : 'Synced'}
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${syncStatus === 'syncing'
                      ? 'bg-[color:var(--text2)]'
                      : syncStatus === 'loading'
                        ? 'bg-[color:var(--text3)]'
                      : syncStatus === 'error'
                        ? 'bg-red-500'
                        : 'bg-[color:var(--text2)]'
                      }`}
                  />
                </span>
              )}

              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      if (!canUndo) return;
                      event.preventDefault();
                      runUndo();
                    }}
                    onKeyDown={(event) => {
                      if (!canUndo) return;
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      runUndo();
                    }}
                    disabled={!canUndo}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--rSm)] border transition-colors ${canUndo
                      ? 'border-[color:var(--border)] tulis-muted hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                      : 'cursor-not-allowed border-[color:var(--border2)] text-[color:var(--text3)] opacity-55'}`}
                    aria-label="Undo"
                    title="Undo"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                      <path d="M9 14 4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 9h11a4 4 0 1 1 0 8h-1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onPointerDown={(event) => {
                      if (!canRedo) return;
                      event.preventDefault();
                      runRedo();
                    }}
                    onKeyDown={(event) => {
                      if (!canRedo) return;
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      runRedo();
                    }}
                    disabled={!canRedo}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--rSm)] border transition-colors ${canRedo
                      ? 'border-[color:var(--border)] tulis-muted hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                      : 'cursor-not-allowed border-[color:var(--border2)] text-[color:var(--text3)] opacity-55'}`}
                    aria-label="Redo"
                    title="Redo"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                      <path d="m15 14 5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M20 9H9a4 4 0 1 0 0 8h1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  <div className="relative" ref={labelPopoverRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isHeaderActionsMenuOpen) {
                          setIsHeaderActionsMenuOpen(false);
                          return;
                        }
                        setIsLabelPopoverOpen(false);
                        setLabelInput('');
                        setIsHeaderActionsMenuOpen(true);
                      }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--rSm)] border transition-colors ${isHeaderActionsMenuOpen || isLabelPopoverOpen
                        ? 'border-[color:var(--border)] text-[color:var(--text)] bg-[color:var(--surface2)]'
                        : 'border-[color:var(--border)] tulis-muted hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'
                        }`}
                      aria-haspopup="menu"
                      aria-expanded={isHeaderActionsMenuOpen}
                      aria-label="Open note actions"
                      title="Note actions"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>

                    {isHeaderActionsMenuOpen && (
                      <div className="absolute right-0 top-10 z-50 min-w-[196px] rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] p-1.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => {
                            openLabelPopover();
                          }}
                          className="flex w-full items-center justify-between rounded-[calc(var(--rSm)-2px)] px-2.5 py-2 text-left text-xs tulis-muted transition-colors hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]"
                        >
                          <span>Manage labels</span>
                          {hasLabels ? (
                            <span className="rounded-full border border-[color:var(--border2)] bg-[color:var(--surface2)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--text)]">
                              {labels.length}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsHeaderActionsMenuOpen(false);
                            void togglePinned();
                          }}
                          className="mt-0.5 flex w-full items-center rounded-[calc(var(--rSm)-2px)] px-2.5 py-2 text-left text-xs tulis-muted transition-colors hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]"
                        >
                          {pinned ? 'Unpin note' : 'Pin note'}
                        </button>
                        <button
                          type="button"
                          onClick={clearCompletedTasks}
                          className="mt-0.5 flex w-full items-center rounded-[calc(var(--rSm)-2px)] px-2.5 py-2 text-left text-xs tulis-muted transition-colors hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]"
                        >
                          Clear completed tasks
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void moveCurrentNoteToTrash();
                          }}
                          className="mt-0.5 flex w-full items-center rounded-[calc(var(--rSm)-2px)] px-2.5 py-2 text-left text-xs text-red-500 transition-colors hover:bg-[color:var(--surface2)]"
                        >
                          Move to Trash
                        </button>
                      </div>
                    )}

                    {isLabelPopoverOpen && (
                      <div className="absolute right-0 top-10 z-50 w-[300px] max-w-[calc(100vw-1rem)] rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] tulis-muted">Labels</p>
                          {hasLabels && (
                            <button
                              type="button"
                              onClick={() => {
                                void saveLabelsNow([]);
                              }}
                              className="text-[10px] font-medium uppercase tracking-[0.08em] tulis-muted transition-colors hover:text-[color:var(--text)]"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        {hasLabels && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {labels.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border2)] bg-[color:var(--surface2)] px-2 py-1 text-xs font-medium tulis-text"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => {
                                    void saveLabelsNow(labels.filter((item) => item !== tag));
                                  }}
                                  className="rounded-full p-0.5 tulis-muted transition-colors hover:text-[color:var(--text)]"
                                  aria-label={`Remove ${tag} label`}
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

                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            addLabelFromInput();
                          }}
                        >
                          <input
                            ref={labelInputRef}
                            value={labelInput}
                            onChange={(event) => setLabelInput(event.target.value)}
                            onKeyDown={(event) => {
                              if ((event.key === 'Enter' || event.key === ',') && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                addLabelFromInput();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setIsLabelPopoverOpen(false);
                                setLabelInput('');
                              }
                              if (event.key === 'Backspace' && !labelInput.trim() && labels.length > 0) {
                                event.preventDefault();
                                void saveLabelsNow(labels.slice(0, -1));
                              }
                            }}
                            placeholder={labels.length >= 10 ? 'Label limit reached' : 'Press enter to add label'}
                            disabled={labels.length >= 10}
                            enterKeyHint="done"
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="h-8 w-full rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 text-xs tulis-text placeholder:text-[color:var(--text3)] focus:border-[color:var(--accent)] focus:outline-none disabled:opacity-50"
                          />
                          <button type="submit" tabIndex={-1} aria-hidden="true" className="sr-only">
                            Add label
                          </button>
                        </form>

                        {labelSuggestions.length > 0 && (
                          <div className="mt-2 max-h-28 overflow-y-auto rounded-[var(--rSm)] border border-[color:var(--border2)] bg-[color:var(--surface2)] p-1">
                            {labelSuggestions.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  if (labels.includes(tag) || labels.length >= 10) return;
                                  void saveLabelsNow([...labels, tag]);
                                  setLabelInput('');
                                }}
                                className="w-full rounded-[var(--rSm)] px-2 py-1 text-left text-xs tulis-muted transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

        </header>

        <main
          ref={editorScrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 sm:pb-16"
          onMouseDown={(event) => {
            if (!editor) return;
            if (isReadOnly) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('.ProseMirror')) return;
            event.preventDefault();
            editor.commands.focus('end');
          }}
        >
          {isDeleted && (
            <div className="sticky top-3 z-30 mx-auto mb-4 max-w-[840px]" data-trash-banner>
              <div className="rounded-[var(--rMd)] border border-[color:var(--border2)] bg-[color:var(--surface2)] px-3 py-2.5 shadow-md">
                <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:items-center sm:text-left">
                  <p className="text-xs tulis-muted">
                    This note is in Trash • Auto-deletes on{' '}
                    <span className="font-semibold text-[color:var(--text)]">
                      {autoDeleteDate
                        ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(autoDeleteDate)
                        : '30 days from deletion'}
                    </span>
                    .
                  </p>
                  <div className="flex w-full items-center justify-center gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        void restoreNoteFromTrash();
                      }}
                      className="h-8 rounded-[var(--rSm)] border border-[color:var(--border)] px-2.5 text-xs font-medium tulis-text transition-colors hover:bg-[color:var(--surface2)]"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPermanentDeleteOpen(true)}
                      className="h-8 rounded-[var(--rSm)] border border-red-500/35 px-2.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      Permanently delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isTrashEmptyView ? (
            <div className="mx-auto flex min-h-full max-w-[840px] min-w-0 items-center justify-center text-center">
              <div>
                <p className="text-base font-semibold tulis-text">Trash is empty.</p>
                <p className="mt-2 text-sm tulis-muted">Deleted notes will appear here.</p>
                <p className="mt-1 text-sm tulis-muted">Notes stay in Trash for 30 days before being permanently removed.</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto min-h-[60vh] max-w-[840px] min-w-0">
              {!ready ? (
                <div className="space-y-3 pt-1" aria-hidden="true">
                  <div className="h-5 w-[58%] rounded bg-[color:var(--surface2)]" />
                  <div className="h-4 w-full rounded bg-[color:var(--surface2)]" />
                  <div className="h-4 w-[91%] rounded bg-[color:var(--surface2)]" />
                  <div className="h-4 w-[87%] rounded bg-[color:var(--surface2)]" />
                  <div className="h-4 w-[95%] rounded bg-[color:var(--surface2)]" />
                  <div className="h-4 w-[79%] rounded bg-[color:var(--surface2)]" />
                </div>
              ) : (
                <EditorContent
                  editor={editor}
                  className="prose prose-lg dark:prose-invert max-w-none focus:outline-none tulis-text"
                />
              )}
            </div>
          )}
        </main>
      </div>

      {!isReadOnly && selectionToolbar.visible && selectionToolbar.isMobile && (
        <div
          className="tulis-selection-toolbar pointer-events-none fixed inset-x-2 z-50 sm:inset-x-4"
          style={{ bottom: `calc(${mobileToolbarBottom}px + env(safe-area-inset-bottom))` }}
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[840px] rounded-[var(--rMd)] border border-[color:var(--border2)] bg-[color:var(--surface2)] px-2.5 py-2 shadow-md">
            <div className="flex items-center gap-1">
              {selectionToolbarButtons.map((button) => (
                <button
                  key={button.id}
                  type="button"
                  aria-label={button.ariaLabel}
                  aria-pressed={button.active}
                  disabled={button.disabled}
                  onPointerDown={(event) => {
                    if (button.disabled) return;
                    event.preventDefault();
                    button.onPress();
                  }}
                  onKeyDown={(event) => {
                    if (button.disabled) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    button.onPress();
                  }}
                  className={`inline-flex h-9 flex-1 items-center justify-center rounded-[var(--rSm)] border text-sm transition-colors ${button.disabled
                    ? 'cursor-not-allowed border-transparent text-[color:var(--text3)] opacity-55'
                    : button.active
                      ? 'border-[color:var(--accent)] bg-[color:var(--surface)] text-[color:var(--accent)]'
                      : 'border-transparent tulis-muted hover:border-[color:var(--border)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]'} ${button.className}`}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isReadOnly && selectionToolbar.visible && !selectionToolbar.isMobile && (
        <div
          className="tulis-selection-toolbar pointer-events-none fixed z-50"
          style={{
            left: `${selectionToolbar.left}px`,
            top: `${selectionToolbar.top}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="pointer-events-auto flex items-center gap-1 rounded-[var(--rMd)] border border-[color:var(--border)] bg-[color:var(--surface)] px-1.5 py-1.5 shadow-md">
            {selectionToolbarButtons.map((button) => (
              <button
                key={button.id}
                type="button"
                aria-label={button.ariaLabel}
                aria-pressed={button.active}
                disabled={button.disabled}
                onPointerDown={(event) => {
                  if (button.disabled) return;
                  event.preventDefault();
                  button.onPress();
                }}
                onKeyDown={(event) => {
                  if (button.disabled) return;
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  button.onPress();
                }}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--rSm)] border text-sm transition-colors ${button.disabled
                  ? 'cursor-not-allowed border-transparent text-[color:var(--text3)] opacity-55'
                  : button.active
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface2)] text-[color:var(--accent)]'
                    : 'border-transparent tulis-muted hover:border-[color:var(--border)] hover:bg-[color:var(--surface2)] hover:text-[color:var(--text)]'} ${button.className}`}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {datePickerOpen && (
        <DatePicker
          onSelect={(date) => {
            if (isReadOnly) return;
            editor?.chain().focus().setDateChip({ date: date.toISOString() }).run();
            setDatePickerOpen(false);
          }}
          onClose={() => setDatePickerOpen(false)}
        />
      )}

      {confirmPermanentDeleteOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="tulis-surface w-full max-w-[320px] rounded-[var(--rLg)] border tulis-border p-8">
            <h2 className="mb-2 text-center text-xl font-bold tracking-tight tulis-text">Permanently delete?</h2>
            <p className="mb-8 text-center text-sm tulis-muted">This action cannot be undone.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  void permanentlyDeleteCurrentNote();
                }}
                className="w-full rounded-[var(--rMd)] bg-red-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600"
              >
                Yes, permanently delete
              </button>
              <button
                onClick={() => setConfirmPermanentDeleteOpen(false)}
                className="w-full rounded-[var(--rMd)] border border-[color:var(--border)] py-3 text-sm font-semibold tulis-text transition-colors hover:bg-[color:var(--surface2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
