import Link from "next/link";

import { Container } from "@/components/ui/container";
import { BrandMark } from "@/components/ui/brand-mark";
import { ArrowRightIcon } from "@/components/ui/icons";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="relative z-20 border-b border-border bg-background/75 backdrop-blur-xl">
      <Container className="flex h-20 items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-3"
          aria-label={`${siteConfig.name} home`}
        >
          <BrandMark />
          <span className="text-lg font-semibold tracking-[-0.02em]">
            {siteConfig.name}
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/sign-in"
            className="rounded-full px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-primary-muted hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="button-primary rounded-full px-4 py-2.5"
          >
            Get started
            <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Container>
    </header>
  );
}
