import Link from "next/link";

export type CampaignStep =
  | "objective"
  | "products"
  | "audience"
  | "creatives"
  | "budget"
  | "review";

const steps: { key: CampaignStep; label: string }[] = [
  { key: "objective", label: "Objective" },
  { key: "products", label: "Products" },
  { key: "audience", label: "Audience" },
  { key: "creatives", label: "Creatives" },
  { key: "budget", label: "Budget" },
  { key: "review", label: "Review" },
];

export function CampaignWorkflowNav({
  campaignHref,
  activeStep,
}: {
  campaignHref: string;
  activeStep: CampaignStep;
}) {
  return (
    <nav className="mt-8 overflow-x-auto" aria-label="Campaign builder steps">
      <ol className="flex min-w-max items-center gap-2 rounded-2xl border border-border bg-surface/75 p-2">
        {steps.map((step, index) => {
          const active = step.key === activeStep;
          return (
            <li key={step.key}>
              <Link
                href={`${campaignHref}?step=${step.key}`}
                aria-current={active ? "step" : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-primary-muted text-primary-hover"
                    : "text-text-secondary hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                <span className="text-[10px] opacity-65">{String(index + 1).padStart(2, "0")}</span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
