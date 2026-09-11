"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/forms/action-state";

import { requestImageEditAction } from "../server/actions";

export function ImageEditor({ organizationSlug, creativeId, variantId, requestNonce }: {
  organizationSlug: string; creativeId: string; variantId: string; requestNonce: string;
}) {
  const [state, action, pending] = useActionState(
    requestImageEditAction.bind(null, organizationSlug, creativeId, variantId),
    initialActionState,
  );
  return (
    <form action={action} className="premium-panel mt-8 rounded-3xl p-6 sm:p-8">
      <input type="hidden" name="requestNonce" value={requestNonce} />
      <label className="field-label">Edit direction<textarea name="prompt" className="form-control min-h-32 resize-y" placeholder="Keep the product unchanged. Simplify the background and use softer directional light." required /></label>
      <p className="mt-3 text-xs leading-5 text-text-secondary">Image edits create a new variant. The original remains unchanged.</p>
      {state.message ? <p className="field-error">{state.message}</p> : null}
      <button className="button-primary mt-5" disabled={pending}>{pending ? "Queueing edit…" : "Generate edited variant"}</button>
    </form>
  );
}
