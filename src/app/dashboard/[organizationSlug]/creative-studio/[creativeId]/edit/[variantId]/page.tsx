/* eslint-disable @next/next/no-img-element */
import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyEditor } from "@/features/creative-studio/components/copy-editor";
import { ImageEditor } from "@/features/creative-studio/components/image-editor";
import { getCreativeForStudio } from "@/features/creative-studio/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string; creativeId: string; variantId: string }> };

export default async function CreativeEditorPage({ params }: PageProps) {
  const { organizationSlug, creativeId, variantId } = await params;
  const tenant = await requireTenantContext(organizationSlug, [OrganizationRole.OWNER, OrganizationRole.ADMIN]);
  const creative = await getCreativeForStudio(tenant.organizationId, creativeId);
  const variant = creative?.variants.find((item) => item.id === variantId);
  if (!creative || !variant) notFound();
  const content = variant.content && typeof variant.content === "object" && !Array.isArray(variant.content) ? variant.content as Record<string, unknown> : {};
  const isCopy = ["headline", "primaryText", "callToAction", "caption"].every((key) => typeof content[key] === "string");

  return <div className="mx-auto max-w-4xl"><Link href={`/dashboard/${organizationSlug}/creative-studio/${creative.id}`} className="back-link">← Back to results</Link><p className="eyebrow eyebrow-ai mt-8">Creative editor</p><h1 className="page-title">Refine {variant.name.toLowerCase()}</h1><p className="page-description">Edits are non-destructive and create a traceable new variant.</p>
    {isCopy ? <CopyEditor organizationSlug={organizationSlug} creativeId={creative.id} variantId={variant.id} content={{ headline: String(content.headline), primaryText: String(content.primaryText), callToAction: String(content.callToAction), caption: String(content.caption) }} /> : <><div className="premium-panel mt-8 overflow-hidden rounded-3xl">{variant.assets[0] ? <img src={`/api/storage/creative-assets/${variant.assets[0].id}`} alt={variant.name} className="max-h-[36rem] w-full object-contain" /> : <div className="p-8 text-sm text-text-secondary">No editable image asset is available.</div>}</div>{variant.assets[0] ? <ImageEditor organizationSlug={organizationSlug} creativeId={creative.id} variantId={variant.id} requestNonce={randomUUID()} /> : null}</>}
  </div>;
}
