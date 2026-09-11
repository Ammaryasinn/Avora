"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BoxIcon,
  ChartIcon,
  GridIcon,
  MegaphoneIcon,
  MessageIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/ui/icons";

type DashboardNavProps = {
  dashboardHref: string;
  mobile?: boolean;
};

const futureItems = [
  { label: "WhatsApp", icon: MessageIcon },
  { label: "CRM", icon: UsersIcon },
  { label: "Analytics", icon: ChartIcon },
] as const;

export function DashboardNav({
  dashboardHref,
  mobile = false,
}: DashboardNavProps) {
  const pathname = usePathname();
  const mainItems = [
    { label: "Overview", href: dashboardHref, icon: GridIcon },
    {
      label: "Catalogue",
      href: `${dashboardHref}/catalogue`,
      icon: BoxIcon,
    },
    {
      label: "Creative Studio",
      href: `${dashboardHref}/creative-studio`,
      icon: SparklesIcon,
    },
    {
      label: "Campaigns",
      href: `${dashboardHref}/campaigns`,
      icon: MegaphoneIcon,
    },
    {
      label: "Settings",
      href: `${dashboardHref}/settings/integrations/meta`,
      icon: SettingsIcon,
    },
  ] as const;

  if (mobile) {
    return (
      <nav className="flex gap-2 overflow-x-auto" aria-label="Main navigation">
        {mainItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === dashboardHref
              ? pathname === href
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-primary-muted text-primary-hover"
                  : "text-text-secondary hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="mt-8" aria-label="Main navigation">
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        Workspace
      </p>
      <div className="mt-3 space-y-1">
        {mainItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === dashboardHref
              ? pathname === href
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-primary-muted text-primary-hover shadow-[inset_0_0_0_1px_var(--border-strong)]"
                  : "text-text-secondary hover:bg-surface-muted/65 hover:text-foreground"
              }`}
            >
              <Icon
                className={`size-[18px] ${isActive ? "text-primary" : "text-text-muted group-hover:text-text-secondary"}`}
              />
              {label}
              {isActive ? (
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        })}
      </div>

      <p className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        Revenue tools
      </p>
      <div className="mt-3 space-y-1">
        {futureItems.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-muted"
          >
            <Icon className="size-[18px] text-text-muted" />
            <span>{label}</span>
            <span className="ml-auto rounded-full border border-border bg-surface-muted/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              Soon
            </span>
          </div>
        ))}
      </div>
    </nav>
  );
}
