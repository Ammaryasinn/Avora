"use client";

import { RouteError } from "@/components/ui/route-error";

export default function CreativeStudioError({ reset }: { reset: () => void }) {
  return <RouteError title="Creative Studio could not load" description="Your data is safe. Retry the request when you are ready." reset={reset} />;
}
