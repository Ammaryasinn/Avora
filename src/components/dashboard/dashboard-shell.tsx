import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { BrandMark } from "@/components/ui/brand-mark";

type DashboardShellProps = {
  children: ReactNode;
  organization: {
    name: string;
    slug: string;
    businessProfile: {
      displayName: string;
    } | null;
  };
};

export function DashboardShell({
  children,
  organization,
}: DashboardShellProps) {
  const dashboardHref = `/dashboard/${organization.slug}`;
  const displayName =
    organization.businessProfile?.displayName ?? organization.name;

  return (
    <div className="app-backdrop min-h-screen text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-surface/90 px-5 py-6 shadow-[12px_0_40px_rgba(64,48,32,0.035)] backdrop-blur-xl lg:flex">
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-3 px-2"
          aria-label="Avora dashboard"
        >
          <BrandMark />
          <div>
            <p className="brand-wordmark text-lg">Avora</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              Revenue OS
            </p>
          </div>
        </Link>

        <div className="mt-8 rounded-2xl border border-border bg-surface-muted/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Current workspace
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-foreground">
            {displayName}
          </p>
          <p className="mt-1 truncate text-xs text-text-secondary">
            {organization.name}
          </p>
        </div>

        <DashboardNav dashboardHref={dashboardHref} />

        <div className="mt-auto border-t border-border px-2 pt-5">
          <p className="text-xs leading-5 text-text-muted">
            Catalogue, Creative Studio, campaigns, and inbound WhatsApp conversations are available. Outbound automation remains deferred.
          </p>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border bg-background/82 backdrop-blur-xl">
          <div className="flex h-20 items-center justify-between px-5 sm:px-8 lg:px-10 xl:px-12">
            <Link
              href={dashboardHref}
              className="inline-flex items-center gap-3 lg:hidden"
            >
              <BrandMark />
              <span className="brand-wordmark text-lg">Avora</span>
            </Link>

            <div className="hidden lg:block">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
                Workspace
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {displayName}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block lg:hidden">
                <p className="max-w-48 truncate text-sm font-medium text-foreground">
                  {displayName}
                </p>
                <p className="text-xs text-text-muted">Workspace</p>
              </div>
              <div className="rounded-full border border-border-strong bg-surface-raised p-1 shadow-sm">
                <UserButton
                  appearance={{
                    elements: { avatarBox: "size-8" },
                  }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border px-5 py-2 lg:hidden">
            <DashboardNav dashboardHref={dashboardHref} mobile />
          </div>
        </header>

        <main className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 xl:px-12 xl:py-12">
          <div className="mx-auto max-w-[92rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
