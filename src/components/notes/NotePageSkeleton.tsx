'use client';

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[var(--rSm)] bg-[color:var(--surface2)] ${className}`} />;
}

function SkeletonActionButton() {
  return <div className="h-8 w-8 animate-pulse rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />;
}

export function NotePageSkeleton() {
  const contentLineWidths = ['w-[62%]', 'w-full', 'w-[92%]', 'w-[88%]', 'w-[95%]', 'w-[76%]', 'w-[83%]'];

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden tulis-bg font-sans">
      <aside className="hidden h-full w-[312px] shrink-0 border-r tulis-border bg-[color:var(--sidebar)] md:block">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 px-3 pb-3 pt-4">
            <div className="h-10 rounded-[var(--rSm)] bg-[color:var(--accent)] opacity-85" />

            <div className="mt-3 h-10 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3">
              <div className="flex h-full items-center gap-2.5">
                <div className="h-4 w-4 rounded-full bg-[color:var(--surface2)]" />
                <SkeletonBar className="h-3.5 w-[58%]" />
              </div>
            </div>

            <div className="mt-2 h-10 rounded-[calc(var(--rSm)-2px)] border border-[color:var(--border2)] bg-transparent p-0.5">
              <div className="flex h-full items-center gap-1">
                <div className="h-full flex-1 rounded-[calc(var(--rSm)-4px)] bg-[color:var(--surface2)]" />
                <div className="h-full flex-1 rounded-[calc(var(--rSm)-4px)] bg-[color:var(--surface)]" />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div>
              <SkeletonBar className="ml-3 h-2.5 w-14" />
              <div className="mt-2 space-y-1.5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-8 rounded-[var(--rSm)] bg-[color:var(--surface)] px-4 py-2">
                    <SkeletonBar className="h-3.5 w-20" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 border-t border-[color:var(--border2)] pt-3">
              <div className="space-y-1.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)] p-2.5">
                    <div className="flex items-center gap-2">
                      <SkeletonBar className="h-4 w-[58%]" />
                      <SkeletonBar className="ml-auto h-3 w-10" />
                    </div>
                    <SkeletonBar className="mt-2 h-3 w-[82%]" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[color:var(--border2)] px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <SkeletonBar className="h-3.5 w-24" />
              <div className="flex items-center gap-1.5">
                <div className="h-9 w-9 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
                <div className="h-9 w-9 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--canvas)]">
        <header className="sticky top-0 z-40 shrink-0 border-b border-[color:var(--divider)] bg-[color:var(--header)] px-3 py-2.5 sm:px-4">
          <div className="mx-auto grid min-w-0 max-w-[840px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_13.75rem] sm:gap-3">
            <div className="flex items-center">
              <div className="h-9 w-9 rounded-[var(--rSm)] border border-[color:var(--border)] bg-[color:var(--surface)]" />
            </div>
            <div className="h-8 rounded-[var(--rSm)] bg-[color:var(--surface2)]" />
            <div className="flex items-center justify-end gap-2">
              <SkeletonBar className="hidden h-3 w-[6.25rem] md:block" />
              <SkeletonActionButton />
              <SkeletonActionButton />
              <SkeletonActionButton />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-5 sm:px-6 sm:pb-16">
          <div className="mx-auto min-h-full max-w-[840px] min-w-0">
            <div className="space-y-3 pt-1">
              {contentLineWidths.map((width, index) => (
                <SkeletonBar key={width} className={`${index === 0 ? 'h-5 opacity-95' : 'h-4'} ${width}`} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
