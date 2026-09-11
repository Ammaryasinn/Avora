"use client";

import { RouteError } from "@/components/ui/route-error";

export default function CatalogueError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="The catalogue could not be loaded"
      description="Product data is temporarily unavailable. No changes were made."
      reset={reset}
    />
  );
}
