export function RepoListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div>
      <p role="status" className="sr-only">
        Loading repositories…
      </p>
      <div aria-hidden="true" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
      <ul aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="rounded-xl border border-line bg-surface p-5">
            <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="mt-6 flex gap-2">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-10 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-10 animate-pulse rounded bg-surface-2" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
