"use client";

import { RouteError } from "@/components/ui/route-error";

export default function ConversationsError({ reset }: { reset: () => void }) {
  return <RouteError title="Conversations could not load" description="Your persisted WhatsApp data is safe. Retry when the service is available." reset={reset} />;
}
