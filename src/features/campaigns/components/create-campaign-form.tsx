"use client";

import { useActionState } from "react";

import { CampaignObjective } from "@/generated/prisma/enums";
import { initialActionState } from "@/lib/forms/action-state";

import { createCampaignAction } from "../server/actions";

const objectives = [
  [CampaignObjective.SALES, "Sales", "Plan activity intended to generate product sales."],
  [CampaignObjective.LEADS, "Leads", "Plan how prospective customers will express interest."],
  [CampaignObjective.TRAFFIC, "Traffic", "Plan visits to a real destination or product page."],
  [CampaignObjective.AWARENESS, "Awareness", "Plan reach and brand consideration."],
] as const;

export function CreateCampaignForm({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const [state, action, pending] = useActionState(
    createCampaignAction.bind(null, organizationSlug),
    initialActionState,
  );

  return (
    <form action={action} className="mt-8 space-y-6">
      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow">01 · Objective</p>
        <h2 className="section-heading mt-3 text-2xl">Name the plan and choose its purpose</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          You can leave the objective open and save an incomplete draft.
        </p>

        <div className="mt-7">
          <label className="field-label">
            Campaign name
            <input
              name="name"
              className="form-control"
              placeholder="October product launch"
              maxLength={160}
            />
          </label>
          {state.fieldErrors?.name?.[0] ? (
            <p className="field-error">{state.fieldErrors.name[0]}</p>
          ) : null}
        </div>

        <fieldset className="mt-7">
          <legend className="field-label">Objective</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {objectives.map(([value, label, description]) => (
              <label key={value} className="choice-card">
                <input className="sr-only" type="radio" name="objective" value={value} />
                <span className="choice-indicator" />
                <span className="font-semibold">{label}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">
                  {description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field-label mt-7">
          Planning notes
          <textarea
            name="notes"
            className="form-control min-h-28 resize-y"
            placeholder="Optional context for your team."
            maxLength={2000}
          />
        </label>
      </section>

      {state.message ? (
        <p className="rounded-xl border border-danger/20 bg-danger-muted p-4 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button className="button-primary" disabled={pending}>
          {pending ? "Saving draft…" : "Save draft and continue"}
        </button>
      </div>
    </form>
  );
}
