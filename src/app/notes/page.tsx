'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { NotesDrawer } from '@/components/notes/NotesDrawer';

type Row = { id: string; title: string; updated_at: Timestamp | null };

export default function Notes() {
  const router = useRouter();
  const { user } = useAuthGuard();
  const [rows, setRows] = useState<Row[]>([]);
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchNotes = async () => {
      try {
        const q = query(
          collection(db, 'notes'),
          where('owner', '==', user.uid),
          orderBy('updated_at', 'desc')
        );
        const snapshot = await getDocs(q);
        const notes = snapshot.docs.map((doc) => ({
          id: doc.id,
          title: doc.data().title || 'Untitled',
          updated_at: doc.data().updated_at,
        }));
        setRows(notes);
      } catch (err) {
        console.error('Notes fetch error:', err);
      }
    };

    fetchNotes();
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

  return (
    <div className="flex h-screen flex-col klaud-bg font-sans">
      {/* Dashboard Header */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between klaud-border px-6 backdrop-blur-md bg-[color:var(--klaud-glass)] border-b shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMenuOpen(true)}
            className="lg:hidden p-2 rounded-xl border klaud-border hover:bg-[color:var(--klaud-surface)] transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
              <line x1="4" y1="12" x2="16" y2="12" strokeLinecap="round" />
              <line x1="4" y1="18" x2="20" y2="18" strokeLinecap="round" />
            </svg>
          </button>
          <h1 className="text-xl font-black tracking-tight klaud-text">Dashboard</h1>
        </div>

        <button
          onClick={createNote}
          disabled={creating}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[color:var(--klaud-accent)] to-[color:var(--klaud-secondary)] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeLinecap="round" />
          </svg>
          {creating ? 'Drafting...' : 'New Note'}
        </button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <NotesDrawer open={menuOpen} currentNoteId="" onClose={() => setMenuOpen(false)} />

        <main className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
          <div className="max-w-6xl mx-auto">
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-4xl font-black tracking-tight klaud-text mb-2">Welcome Back.</h2>
              <p className="klaud-muted opacity-60 font-medium">Capture your thoughts, organize your world.</p>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed klaud-border rounded-[32px] bg-[color:var(--klaud-surface)]/30">
                <div className="h-16 w-16 rounded-full bg-[color:var(--klaud-accent)]/10 flex items-center justify-center mb-4">
                  <svg className="h-8 w-8 text-[color:var(--klaud-accent)]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold klaud-text mb-1">No notes found</h3>
                <p className="klaud-muted text-sm mb-6">Your digital brain is empty. Change that.</p>
                <button onClick={createNote} className="text-sm font-bold text-[color:var(--klaud-accent)] hover:underline">Create your first note &rarr;</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {rows.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="group relative flex flex-col p-6 rounded-[28px] bg-[color:var(--klaud-surface)] border klaud-border shadow-sm transition-all hover:shadow-xl hover:border-[color:var(--klaud-accent)]/50 hover:-translate-y-1"
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
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
