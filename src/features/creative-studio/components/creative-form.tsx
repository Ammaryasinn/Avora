"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/forms/action-state";

import { createCreativeAction } from "../server/actions";

const types = [
  ["PRODUCT_AD", "Product Ad", "Product-focused campaign visual and copy."],
  ["LIFESTYLE_IMAGE", "Lifestyle Image", "Place the product in a considered setting."],
  ["VIRTUAL_TRY_ON", "Virtual Try-On", "Apply apparel to a consented person reference."],
  ["INSTAGRAM_POST", "Instagram Post", "A polished 4:5 social creative."],
  ["STORY_STATUS", "Story / WhatsApp Status", "A vertical 9:16 creative asset."],
  ["AD_COPY_ONLY", "Ad Copy Only", "Generate editable copy without an image."],
] as const;

export function CreativeForm({ organizationSlug, products }: {
  organizationSlug: string;
  products: { id: string; name: string; sku: string | null; media: { id: string }[] }[];
}) {
  const [state, action, pending] = useActionState(
    createCreativeAction.bind(null, organizationSlug),
    initialActionState,
  );

  return (
    <form action={action} className="mt-8 space-y-6">
      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow eyebrow-ai">01 · Product</p>
        <h2 className="section-heading mt-3 text-2xl">Choose a catalogue product</h2>
        <select name="productId" className="form-control mt-6" required defaultValue="">
          <option value="" disabled>Select a product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}{product.sku ? ` · ${product.sku}` : ""}{product.media.length ? " · image ready" : " · needs image"}
            </option>
          ))}
        </select>
        {state.fieldErrors?.productId?.[0] ? <p className="field-error">{state.fieldErrors.productId[0]}</p> : null}
      </section>

      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow eyebrow-ai">02 · Creative type</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {types.map(([value, label, description], index) => (
            <label key={value} className="choice-card">
              <input className="peer sr-only" type="radio" name="type" value={value} defaultChecked={index === 0} />
              <span className="choice-indicator" />
              <span className="font-semibold text-foreground">{label}</span>
              <span className="mt-2 block text-sm leading-6 text-text-secondary">{description}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow eyebrow-ai">03 · Brief</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="field-label sm:col-span-2">Creative title<input name="title" className="form-control" placeholder="New season launch" required /></label>
          <label className="field-label sm:col-span-2">Objective<textarea name="objective" className="form-control min-h-28 resize-y" placeholder="Introduce this product to new customers without making unverified claims." required /></label>
          <label className="field-label">Audience<input name="audience" className="form-control" placeholder="Style-conscious urban professionals" required /></label>
          <label className="field-label">Tone<input name="tone" className="form-control" placeholder="Confident, restrained, premium" required /></label>
        </div>
      </section>

      {state.message ? <p className="rounded-xl border border-danger/20 bg-danger-muted p-4 text-sm text-danger">{state.message}</p> : null}
      <div className="flex justify-end">
        <button className="button-primary" disabled={pending || products.length === 0}>{pending ? "Creating…" : "Continue to inputs"}</button>
      </div>
    </form>
  );
}
