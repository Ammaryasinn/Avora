export default function CreativeStudioLoading() {
  return <div className="space-y-6" aria-label="Loading Creative Studio"><div className="h-4 w-36 animate-pulse rounded bg-ai-muted" /><div className="h-12 max-w-xl animate-pulse rounded-xl bg-surface-muted" /><div className="grid gap-5 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl border border-border bg-surface" />)}</div></div>;
}
