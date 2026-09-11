export default function CampaignsLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading campaigns">
      <div className="h-3 w-36 rounded bg-surface-muted" />
      <div className="h-12 max-w-xl rounded-xl bg-surface-muted" />
      <div className="grid gap-4 xl:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-52 rounded-3xl border border-border bg-surface/75" />
        ))}
      </div>
    </div>
  );
}
