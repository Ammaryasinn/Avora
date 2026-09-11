import Link from "next/link";

import { PlusIcon } from "@/components/ui/icons";
import { CatalogueList } from "@/features/catalogue/components/catalogue-list";
import { getCatalogueProducts } from "@/features/catalogue/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type CataloguePageProps = {
  params: Promise<{ organizationSlug: string }>;
};

export default async function CataloguePage({ params }: CataloguePageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const products = await getCatalogueProducts(tenant.organizationId);
  const canManage =
    tenant.role === OrganizationRole.OWNER ||
    tenant.role === OrganizationRole.ADMIN;
  const currencyCode =
    tenant.organization.businessProfile?.currencyCode ?? "USD";

  return (
    <div>
      <div className="flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
        <div>
          <p className="eyebrow">Product catalogue</p>
          <h1 className="page-title">
            Products
          </h1>
          <p className="page-description">
            Keep product details, variants, colors, pricing, and stock organized
            for this workspace.
          </p>
        </div>
        {canManage ? (
          <Link
            href={`/dashboard/${organizationSlug}/catalogue/new`}
            className="button-primary gap-2 px-5 py-3"
          >
            <PlusIcon className="size-4" />
            Add product
          </Link>
        ) : null}
      </div>

      <CatalogueList
        products={products}
        organizationSlug={organizationSlug}
        currencyCode={currencyCode}
        canManage={canManage}
      />
    </div>
  );
}
