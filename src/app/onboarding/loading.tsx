export default function OnboardingLoading() {
  return (
    <main className="app-backdrop min-h-screen px-5 py-12 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-10 w-32 rounded-xl bg-surface-muted" />
        <div className="grid gap-12 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <div className="h-3 w-36 rounded bg-surface-muted" />
            <div className="mt-7 h-24 rounded-2xl bg-surface-muted" />
            <div className="mt-6 h-20 rounded-2xl bg-surface-muted/70" />
          </div>
          <div className="h-[34rem] rounded-3xl border border-border bg-surface/75" />
        </div>
      </div>
    </main>
  );
}
