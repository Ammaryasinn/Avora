import Link from "next/link";

import { Container } from "@/components/ui/container";
import { BrandMark } from "@/components/ui/brand-mark";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-slate-300/10 py-8">
      <Container className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="scale-90" />
          <div>
            <p className="brand-wordmark text-sm text-foreground">
              {siteConfig.name}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              A focused foundation for modern revenue teams.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm text-text-secondary">
          <Link href="/sign-in" className="transition hover:text-primary-hover">
            Sign in
          </Link>
          <span>
            &copy; {new Date().getFullYear()} {siteConfig.name}
          </span>
        </div>
      </Container>
    </footer>
  );
}
