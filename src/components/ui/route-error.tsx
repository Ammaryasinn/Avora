"use client";

type RouteErrorProps = {
  title: string;
  description: string;
  reset: () => void;
};

export function RouteError({ title, description, reset }: RouteErrorProps) {
  return (
    <div className="premium-panel relative overflow-hidden rounded-3xl p-7 sm:p-9">
      <div className="absolute left-0 top-0 h-full w-1 bg-danger/70" />
      <div className="grid size-11 place-items-center rounded-2xl border border-danger/20 bg-danger-muted text-lg font-semibold text-danger">
        !
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-danger">
        Something went wrong
      </p>
      <h1 className="section-heading mt-3 text-2xl text-foreground">
        {title}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">
        {description}
      </p>
      <button
        type="button"
        onClick={reset}
        className="button-primary mt-7"
      >
        Try again
      </button>
    </div>
  );
}
