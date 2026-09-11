/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { getCreativeLibrary } from "@/features/creative-studio/server/queries";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string }> };

export default async function CreativeLibraryPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const creatives = await getCreativeLibrary(tenant.organizationId);

  return <div><div><p className="eyebrow eyebrow-ai">Creative Library</p><h1 className="page-title">Approved work</h1><p className="page-description">Only explicitly approved creatives appear here. Assets remain private and are delivered through short-lived links.</p></div>
    <div className="mt-9 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {creatives.map((creative) => { const asset = creative.selectedVariant?.assets[0]; return <Link key={creative.id} href={`/dashboard/${organizationSlug}/creative-studio/${creative.id}`} className="premium-panel group overflow-hidden rounded-3xl transition hover:-translate-y-0.5 hover:border-ai/35">{asset ? <img src={`/api/storage/creative-assets/${asset.id}`} alt={creative.title} className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-ai-muted text-sm text-text-muted">Approved copy creative</div>}<div className="p-5"><span className="status-pill status-success">Approved</span><h2 className="mt-4 font-semibold text-foreground">{creative.title}</h2><p className="mt-2 text-sm text-text-secondary">{creative.product?.name ?? "Catalogue creative"}</p></div></Link>; })}
      {creatives.length === 0 ? <div className="empty-state p-12 text-center sm:col-span-2 xl:col-span-3"><p className="font-medium text-foreground">No approved creatives yet</p><p className="mt-2 text-sm text-text-secondary">Select and approve a generated variant to add it here.</p></div> : null}
    </div>
  </div>;
}
