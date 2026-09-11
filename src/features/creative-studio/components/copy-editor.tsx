"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/forms/action-state";

import { updateCopyVariantAction } from "../server/actions";

export function CopyEditor({ organizationSlug, creativeId, variantId, content }: {
  organizationSlug: string;
  creativeId: string;
  variantId: string;
  content: { headline: string; primaryText: string; callToAction: string; caption: string };
}) {
  const [state, action, pending] = useActionState(
    updateCopyVariantAction.bind(null, organizationSlug, creativeId, variantId),
    initialActionState,
  );

  return (
    <form action={action} className="premium-panel mt-8 space-y-5 rounded-3xl p-6 sm:p-8">
      <label className="field-label">Headline<input name="headline" className="form-control" defaultValue={content.headline} /></label>
      <label className="field-label">Primary text<textarea name="primaryText" className="form-control min-h-32 resize-y" defaultValue={content.primaryText} /></label>
      <label className="field-label">Call to action<input name="callToAction" className="form-control" defaultValue={content.callToAction} /></label>
      <label className="field-label">Caption<textarea name="caption" className="form-control min-h-32 resize-y" defaultValue={content.caption} /></label>
      {state.message ? <p className="field-error">{state.message}</p> : null}
      <button className="button-primary" disabled={pending}>{pending ? "Saving…" : "Save as new variant"}</button>
    </form>
  );
}
