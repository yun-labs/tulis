'use client';

export function NotePageSkeleton() {
  return (
    <div className="flex h-screen w-full overflow-hidden tulis-bg font-sans">
      <aside className="hidden h-full w-[312px] shrink-0 border-r border-[color:var(--border2)] bg-[color:var(--sidebar)] md:block">
        <div className="flex h-full min-h-0 flex-col p-3">
          <div className="h-10 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
          <div className="mt-3 h-10 rounded-[var(--rSm)] bg-[color:var(--accent)] opacity-90" />
          <div className="mt-3 h-9 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
              >
                <div className="h-4 w-3/4 rounded bg-[color:var(--surface2)]" />
                <div className="mt-2 h-3 w-full rounded bg-[color:var(--surface2)]" />
                <div className="mt-1.5 h-3 w-2/3 rounded bg-[color:var(--surface2)]" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--canvas)]">
        <header className="shrink-0 border-b border-[color:var(--divider)] bg-[color:var(--header)] px-3 py-2.5 sm:px-4">
          <div className="mx-auto grid min-w-0 max-w-[840px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_13.75rem] sm:gap-3">
            <div className="flex items-center">
              <div className="h-9 w-9 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
            </div>
            <div className="h-8 rounded-[var(--rSm)] bg-[color:var(--surface2)]" />
            <div className="flex items-center justify-end gap-2">
              <div className="hidden h-3 w-[6.25rem] rounded bg-[color:var(--surface2)] md:block" />
              <div className="h-8 w-8 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
              <div className="h-8 w-8 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
              <div className="h-8 w-8 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 sm:pb-16">
          <div className="mx-auto min-h-full max-w-[840px] min-w-0">
            <div className="space-y-3 pt-1">
              <div className="h-5 w-[62%] rounded bg-[color:var(--surface2)] opacity-95" />
              <div className="h-4 w-full rounded bg-[color:var(--surface2)]" />
              <div className="h-4 w-[92%] rounded bg-[color:var(--surface2)]" />
              <div className="h-4 w-[88%] rounded bg-[color:var(--surface2)]" />
              <div className="h-4 w-[95%] rounded bg-[color:var(--surface2)]" />
              <div className="h-4 w-[76%] rounded bg-[color:var(--surface2)]" />
              <div className="h-4 w-[83%] rounded bg-[color:var(--surface2)]" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
