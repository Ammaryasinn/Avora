export default function CatalogueLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-px w-8 bg-border-strong" />
        <div className="h-3 w-28 rounded bg-surface-muted" />
      </div>
      <div className="mt-6 h-11 w-48 rounded-xl bg-surface-muted" />
      <div className="mt-4 h-5 w-full max-w-xl rounded bg-surface-muted/70" />
      <div className="mt-10 grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-56 rounded-2xl border border-border bg-surface/75"
          />
        ))}
      </div>
    </div>
  );
}
