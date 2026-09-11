import Link from "next/link";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Container } from "@/components/ui/container";
import {
  ArrowRightIcon,
  BoxIcon,
  ChartIcon,
  CheckIcon,
  MegaphoneIcon,
  MessageIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/ui/icons";

const roadmapItems = [
  { label: "AI creative", icon: SparklesIcon },
  { label: "Meta advertising", icon: MegaphoneIcon },
  { label: "WhatsApp sales", icon: MessageIcon },
  { label: "CRM", icon: UsersIcon },
  { label: "Revenue analytics", icon: ChartIcon },
] as const;

export default function Home() {
  return (
    <div className="app-backdrop relative flex min-h-screen flex-col overflow-hidden text-foreground">
      <div
        aria-hidden="true"
        className="subtle-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-24 size-[34rem] -translate-x-1/2 rounded-full bg-primary-muted/45 blur-3xl"
      />

      <SiteHeader />

      <main className="relative flex flex-1 items-center">
        <Container className="grid items-center gap-16 py-20 lg:grid-cols-[1.08fr_0.92fr] lg:py-28 xl:gap-24 xl:py-32">
          <section aria-labelledby="home-heading">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface/80 px-3.5 py-2 text-xs font-medium text-primary shadow-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-30" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Milestone 1 is live
            </div>

            <h1
              id="home-heading"
              className="section-heading mt-8 max-w-4xl text-5xl text-balance sm:text-6xl lg:text-[4.65rem] lg:leading-[0.98]"
            >
              Turn your product catalogue into a revenue engine.
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-text-secondary sm:text-xl sm:leading-9">
              Avora is building one intelligent workspace for the systems that
              help modern businesses sell. Start with a secure organization and
              a structured product catalogue.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className="button-primary gap-2 px-5 py-3.5"
              >
                Create your workspace
                <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/sign-in"
                className="button-secondary px-5 py-3.5"
              >
                Sign in to Avora
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-text-secondary">
              {[
                "Clerk-secured identity",
                "Organization-scoped data",
                "Structured catalogue",
              ].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <CheckIcon className="size-4 text-success" />
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section
            className="relative mx-auto w-full max-w-xl"
            aria-label="Avora platform roadmap"
          >
            <div
              aria-hidden="true"
              className="absolute -inset-8 rounded-full bg-ai-muted/70 blur-3xl"
            />
            <div className="premium-panel relative overflow-hidden rounded-[2rem] p-3">
              <div className="rounded-[1.4rem] border border-border bg-surface-raised/90 p-5 sm:p-6">
                <div className="flex items-center justify-between border-b border-border pb-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                      Avora workspace
                    </p>
                    <p className="mt-1.5 text-sm text-text-secondary">
                      The revenue foundation
                    </p>
                  </div>
                  <span className="status-pill status-success">
                    Foundation live
                  </span>
                </div>

                <div className="mt-5 rounded-2xl border border-border-strong bg-primary-muted/60 p-5">
                  <div className="flex items-start gap-4">
                    <span className="grid size-11 place-items-center rounded-xl border border-border-strong bg-surface text-primary">
                      <BoxIcon className="size-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">Product catalogue</h2>
                        <span className="status-pill status-success">
                          Available
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        Products, variants, pricing, colors, SKUs, and stock in
                        one organization-owned source of truth.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {roadmapItems.map(({ label, icon: Icon }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/45 p-3.5 text-text-secondary"
                    >
                      <span className="grid size-8 place-items-center rounded-lg bg-surface-raised">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {label}
                        </p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-text-muted">
                          Coming soon
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
