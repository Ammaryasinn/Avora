import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/ui/brand-mark";
import { CheckIcon } from "@/components/ui/icons";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { getFirstOrganizationMembership } from "@/features/organizations/server/queries";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const membership = await getFirstOrganizationMembership();

  if (membership) {
    redirect(`/dashboard/${membership.organization.slug}`);
  }

  return (
    <main className="app-backdrop relative min-h-screen overflow-hidden px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div
        aria-hidden="true"
        className="subtle-grid pointer-events-none absolute inset-0"
      />
      <div className="relative mx-auto max-w-6xl">
        <Link href="/" className="inline-flex items-center gap-3">
          <BrandMark />
          <span className="brand-wordmark text-xl">
            Avora
          </span>
        </Link>

        <div className="grid items-start gap-12 py-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-20">
          <section className="lg:sticky lg:top-16">
            <p className="eyebrow">First-time setup</p>
            <h1 className="section-heading mt-6 text-4xl leading-tight sm:text-5xl">
              Create your business workspace.
            </h1>
            <p className="mt-5 max-w-md leading-7 text-text-secondary">
              This information establishes the organization boundary and
              business profile for your Avora catalogue.
            </p>

            <div className="mt-9 space-y-4">
              {[
                "Your user becomes the workspace owner",
                "Business records stay scoped to the organization",
                "Currency is saved for catalogue pricing",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 text-sm leading-6 text-text-secondary"
                >
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success-muted text-success">
                    <CheckIcon className="size-3.5" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="premium-panel rounded-3xl p-5 sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center justify-between gap-4 border-b border-border pb-6">
              <div>
                <p className="text-lg font-semibold tracking-[-0.02em]">
                  Business details
                </p>
                <p className="mt-1.5 text-sm text-text-secondary">
                  You can expand your workspace later.
                </p>
              </div>
              <span className="rounded-full border border-border-strong bg-primary-muted px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Step 1 of 1
              </span>
            </div>
            <OnboardingForm />
          </section>
        </div>
      </div>
    </main>
  );
}
