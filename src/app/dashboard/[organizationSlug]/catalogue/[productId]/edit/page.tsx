import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeftIcon } from "@/components/ui/icons";
import { ProductForm } from "@/features/catalogue/components/product-form";
import { ProductMediaUploader } from "@/features/catalogue/components/product-media-uploader";
import { getProductForEdit } from "@/features/catalogue/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type EditProductPageProps = {
  params: Promise<{ organizationSlug: string; productId: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { organizationSlug, productId } = await params;
  const tenant = await requireTenantContext(organizationSlug, [
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
  ]);
  const product = await getProductForEdit(tenant.organizationId, productId);

  if (!product) {
    notFound();
  }

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
          Catalogue record
        </p>
        <h1 className="section-heading mt-4 text-4xl">
          Edit product
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-text-secondary">
          Update product and inventory details without changing its organization
          ownership.
        </p>
      </div>

      <ProductForm
        organizationSlug={organizationSlug}
        currencyCode={currencyCode}
        product={product}
      />
      <ProductMediaUploader
        organizationSlug={organizationSlug}
        productId={product.id}
        media={product.media}
      />
    </div>
  );
}
