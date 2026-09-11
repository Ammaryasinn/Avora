import Link from "next/link";

import { ArrowLeftIcon } from "@/components/ui/icons";

export default function OrganizationNotFound() {
  return (
    <div className="premium-panel mx-auto max-w-2xl rounded-3xl px-6 py-14 text-center sm:px-10 sm:py-16">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border-strong bg-primary-muted text-xl font-semibold text-primary">
        ?
      </div>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        Workspace unavailable
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
        This resource was not found
      </h1>
      <p className="mx-auto mt-4 max-w-lg leading-7 text-text-secondary">
        It may not exist, may be archived, or your account may not have access
        to its organization.
      </p>
      <Link
        href="/dashboard"
        className="button-primary mt-8 gap-2"
      >
        <ArrowLeftIcon className="size-4" />
        Return to dashboard
      </Link>
    </div>
  );
}
