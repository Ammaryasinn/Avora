import Link from "next/link";

import { CreativeForm } from "@/features/creative-studio/components/creative-form";
import { getCreativeProducts } from "@/features/creative-studio/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string }> };

export default async function NewCreativePage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug, [OrganizationRole.OWNER, OrganizationRole.ADMIN]);
  const products = await getCreativeProducts(tenant.organizationId);

  return <div className="mx-auto max-w-5xl">
    <Link href={`/dashboard/${organizationSlug}/creative-studio`} className="back-link">← Back to Creative Studio</Link>
    <p className="eyebrow eyebrow-ai mt-8">New creative</p><h1 className="page-title">Start with product truth</h1>
    <p className="page-description">Choose a product and set direction. Generation runs asynchronously after the required media is ready.</p>
    {products.length === 0 ? <div className="ai-panel mt-8 rounded-3xl p-8"><h2 className="section-heading text-2xl">Add a catalogue product first</h2><p className="mt-2 text-sm text-text-secondary">Creative Studio uses real product records as its source.</p><Link className="button-primary mt-5" href={`/dashboard/${organizationSlug}/catalogue/new`}>Add product</Link></div> : <CreativeForm organizationSlug={organizationSlug} products={products.map((product) => ({ ...product, price: undefined }))} />}
  </div>;
}
