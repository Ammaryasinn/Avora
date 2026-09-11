import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { GenerationForm } from "@/features/creative-studio/components/generation-form";
import { ReferenceUploader } from "@/features/creative-studio/components/reference-uploader";
import { getCreativeForStudio } from "@/features/creative-studio/server/queries";
import { deletePersonReferenceAction } from "@/features/creative-studio/server/actions";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string; creativeId: string }> };

export default async function ConfigureCreativePage({ params }: PageProps) {
  const { organizationSlug, creativeId } = await params;
  const tenant = await requireTenantContext(organizationSlug, [OrganizationRole.OWNER, OrganizationRole.ADMIN]);
  const creative = await getCreativeForStudio(tenant.organizationId, creativeId);
  if (!creative) notFound();
  const personAssets = creative.assets.filter((asset) => asset.role === "PERSON_REFERENCE" && asset.status === "READY" && (!asset.expiresAt || asset.expiresAt > new Date()));

  return <div className="mx-auto max-w-5xl">
    <Link href={`/dashboard/${organizationSlug}/creative-studio`} className="back-link">← Back to Creative Studio</Link>
    <p className="eyebrow eyebrow-ai mt-8">Generation setup</p><h1 className="page-title">{creative.title}</h1>
    <p className="page-description">{creative.product?.name} · {creative.type.replaceAll("_", " ").toLowerCase()}</p>

    <section className="premium-panel mt-8 rounded-3xl p-6 sm:p-8">
      <p className="eyebrow eyebrow-ai">Secure inputs</p><h2 className="section-heading mt-3 text-2xl">Prepare generation</h2>
      {creative.type === "VIRTUAL_TRY_ON" ? <div className="mt-6"><ReferenceUploader organizationSlug={organizationSlug} creativeId={creative.id} /></div> : null}
      {personAssets.length ? <div className="mt-4 space-y-2">{personAssets.map((asset, index) => <div key={asset.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"><span className="text-text-secondary">Person reference {index + 1} · expires {asset.expiresAt?.toLocaleDateString() ?? "by policy"}</span><form action={deletePersonReferenceAction.bind(null, organizationSlug, creative.id, asset.id)}><button className="text-xs font-semibold text-danger hover:underline">Delete now</button></form></div>)}</div> : null}
      <GenerationForm
        organizationSlug={organizationSlug}
        creativeId={creative.id}
        creativeType={creative.type}
        requestNonce={randomUUID()}
        productMedia={creative.product?.media.map((media) => ({ id: media.id, altText: media.altText })) ?? []}
        personAssets={personAssets.map((asset) => ({ id: asset.id, expiresAt: asset.expiresAt }))}
      />
    </section>
    {creative.product && creative.product.media.length === 0 ? <p className="mt-5 text-sm text-text-secondary">This product has no ready media. <Link className="font-semibold text-ai hover:underline" href={`/dashboard/${organizationSlug}/catalogue/${creative.product.id}/edit`}>Upload a product image</Link>.</p> : null}
  </div>;
}
