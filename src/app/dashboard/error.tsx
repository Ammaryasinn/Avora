"use client";

import { RouteError } from "@/components/ui/route-error";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="app-backdrop min-h-screen px-6 py-16 text-foreground">
      <div className="mx-auto max-w-4xl">
        <RouteError
          title="The dashboard could not be loaded"
          description="Your workspace data is temporarily unavailable. Try loading it again."
          reset={reset}
        />
      </div>
    </main>
  );
}
