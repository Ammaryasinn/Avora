import Link from "next/link";

import { Container } from "@/components/ui/container";
import { AvoraLogo } from "@/components/ui/avora-logo";
import { ArrowRightIcon } from "@/components/ui/icons";
import { siteConfig } from "@/config/site";

const navigation = [
  { label: "Product", href: "#product" },
  { label: "How it Works", href: "#avora-flow" },
  { label: "Solutions", href: "#solutions" },
  { label: "Pricing", href: "#get-started" },
  { label: "Resources", href: "#avora-flow" },
] as const;

export function SiteHeader() {
  return (
    <header className="relative z-30 bg-transparent">
      <Container className="flex h-20 items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center"
          aria-label={`${siteConfig.name} home`}
        >
          <AvoraLogo />
        </Link>

        <nav className="hidden items-center gap-8 text-[0.82rem] font-medium text-foreground lg:flex xl:gap-10">
          {navigation.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="transition-colors hover:text-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/sign-in"
            className="hidden rounded-xl border border-border-strong bg-surface/55 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="marketing-primary-button group rounded-xl px-4 py-3 sm:px-6"
          >
            Get Started
            <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Container>
    </header>
  );
}
