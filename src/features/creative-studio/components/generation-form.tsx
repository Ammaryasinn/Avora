"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/forms/action-state";

import { generateCreativeAction } from "../server/actions";

export function GenerationForm({
  organizationSlug,
  creativeId,
  creativeType,
  requestNonce,
  productMedia,
  personAssets,
}: {
  organizationSlug: string;
  creativeId: string;
  creativeType: string;
  requestNonce: string;
  productMedia: { id: string; altText: string | null }[];
  personAssets: { id: string; expiresAt: Date | null }[];
}) {
  const [state, action, pending] = useActionState(
    generateCreativeAction.bind(null, organizationSlug, creativeId),
    initialActionState,
  );
  const imageRequired = creativeType !== "AD_COPY_ONLY";

  return (
    <form action={action} className="mt-6 space-y-6">
      <input type="hidden" name="requestNonce" value={requestNonce} />
      {imageRequired ? (
        <div>
          <label className="field-label">Product image
            <select name="productMediaId" className="form-control" required defaultValue={productMedia[0]?.id ?? ""}>
              {productMedia.length === 0 ? <option value="">No ready product images</option> : null}
              {productMedia.map((media, index) => <option key={media.id} value={media.id}>{media.altText || `Product image ${index + 1}`}</option>)}
            </select>
          </label>
          {productMedia.length === 0 ? <p className="field-error">Add an image from the product edit page before generation.</p> : null}
        </div>
      ) : null}

      {creativeType === "LIFESTYLE_IMAGE" ? (
        <label className="field-label">Generation approach
          <select name="generationMode" className="form-control" defaultValue="REFERENCE_EDIT">
            <option value="REFERENCE_EDIT">Use product image as a faithful reference</option>
            <option value="CONCEPT_IMAGE">Generate a concept from the catalogue description</option>
          </select>
        </label>
      ) : null}

      {creativeType === "VIRTUAL_TRY_ON" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="field-label">Person reference
            <select name="personAssetId" className="form-control" required defaultValue={personAssets[0]?.id ?? ""}>
              {personAssets.length === 0 ? <option value="">No ready person reference</option> : null}
              {personAssets.map((asset, index) => <option key={asset.id} value={asset.id}>Person reference {index + 1}</option>)}
            </select>
          </label>
          <label className="field-label">Garment category
            <select name="virtualTryOnCategory" className="form-control" defaultValue="tops">
              <option value="tops">Top</option><option value="bottoms">Bottom</option><option value="one-pieces">One-piece</option>
            </select>
          </label>
        </div>
      ) : null}

      {state.message ? <p className="rounded-xl border border-danger/20 bg-danger-muted p-4 text-sm text-danger">{state.message}</p> : null}
      <button className="button-primary w-full sm:w-auto" disabled={pending || (imageRequired && productMedia.length === 0) || (creativeType === "VIRTUAL_TRY_ON" && personAssets.length === 0)}>
        {pending ? "Securing budget and queueing…" : "Generate creative"}
      </button>
    </form>
  );
}
