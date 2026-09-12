"use client";

import { RouteError } from "@/components/ui/route-error";

export default function LeadsError({ reset }: { reset: () => void }) {
  return <RouteError title="Leads could not load" description="Your lead records are unchanged. Retry when the service is available." reset={reset} />;
}
