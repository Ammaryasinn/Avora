import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/ui/brand-mark";
import { CheckIcon } from "@/components/ui/icons";
import { siteConfig } from "@/config/site";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="app-backdrop relative min-h-screen overflow-hidden text-foreground">
      <div
        aria-hidden="true"
        className="subtle-grid pointer-events-none absolute inset-0"
      />
      <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden border-r border-border px-12 py-12 lg:flex lg:flex-col xl:px-16">
          <Link href="/" className="inline-flex items-center gap-3 self-start">
            <BrandMark />
            <span className="brand-wordmark text-xl">
              {siteConfig.name}
            </span>
          </Link>

          <div className="my-auto max-w-md py-16">
            <p className="eyebrow">
              Your revenue workspace
            </p>
            <h1 className="section-heading mt-6 text-4xl leading-tight">
              One secure home for the systems that help your business sell.
            </h1>
            <p className="mt-5 leading-7 text-text-secondary">
              Start with your organization and catalogue today. Expand into
              connected revenue workflows as Avora grows.
            </p>
            <div className="mt-9 space-y-4">
              {[
                "Secure identity with Clerk",
                "Tenant-isolated business data",
                "Product and inventory foundation",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 text-sm text-foreground"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-success-muted text-success">
                    <CheckIcon className="size-3.5" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Built for focused, modern businesses.
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
          <div className="flex w-full max-w-md flex-col items-center gap-8">
            <Link href="/" className="inline-flex items-center gap-3 lg:hidden">
              <BrandMark />
              <span className="brand-wordmark text-xl">
                {siteConfig.name}
              </span>
            </Link>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
