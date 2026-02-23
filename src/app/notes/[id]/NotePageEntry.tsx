'use client';

import dynamic from 'next/dynamic';
import { NotePageSkeleton } from '@/components/notes/NotePageSkeleton';

const NoteClient = dynamic(() => import('./NoteClient'), {
  ssr: false,
  loading: () => <NotePageSkeleton />,
});

export default function NotePageEntry() {
  return <NoteClient />;
}
