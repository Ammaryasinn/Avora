import Link from "next/link";

import { ArrowLeftIcon } from "@/components/ui/icons";
import { ProductForm } from "@/features/catalogue/components/product-form";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type NewProductPageProps = {
  params: Promise<{ organizationSlug: string }>;
};

export default async function NewProductPage({ params }: NewProductPageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug, [
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
  ]);
  const currencyCode =
    tenant.organization.businessProfile?.currencyCode ?? "USD";

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/dashboard/${organizationSlug}/catalogue`}
        className="back-link group inline-flex items-center gap-2"
      >
        <ArrowLeftIcon className="size-4 transition group-hover:-translate-x-0.5" />
        Back to catalogue
      </Link>
      <div className="mt-7">
        <p className="eyebrow">
          New catalogue record
        </p>
        <h1 className="section-heading mt-4 text-4xl">
          Add product
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-text-secondary">
          Create the core product record and organize its inventory variants.
        </p>
      </div>

      <ProductForm
        organizationSlug={organizationSlug}
        currencyCode={currencyCode}
      />
    </div>
  );
}
