"use client";

import { RouteError } from "@/components/ui/route-error";

export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <main className="app-backdrop min-h-screen px-6 py-16 text-foreground">
      <div className="mx-auto max-w-2xl">
        <RouteError
          title="Onboarding is temporarily unavailable"
          description="We could not load your workspace setup. Check the connection and try again."
          reset={reset}
        />
      </div>
    </main>
  );
}
