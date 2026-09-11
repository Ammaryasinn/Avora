export default function DashboardLoading() {
  return (
    <main className="app-backdrop min-h-screen px-5 py-10 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-px w-8 bg-border-strong" />
          <div className="h-3 w-32 rounded bg-surface-muted" />
        </div>
        <div className="mt-6 h-11 w-full max-w-lg rounded-xl bg-surface-muted" />
        <div className="mt-4 h-5 w-full max-w-xl rounded bg-surface-muted/70" />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    </main>
  );
}

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`rounded-3xl border border-border bg-surface/75 ${className}`}
    />
  );
}
