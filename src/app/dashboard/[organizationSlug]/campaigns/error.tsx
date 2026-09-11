"use client";

import { RouteError } from "@/components/ui/route-error";

export default function CampaignsError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Campaign plans could not be loaded"
      description="Your campaign data remains unchanged. Try loading this workspace again."
      reset={reset}
    />
  );
}
