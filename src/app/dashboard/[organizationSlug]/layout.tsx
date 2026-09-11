import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type OrganizationLayoutProps = {
  children: ReactNode;
  params: Promise<{ organizationSlug: string }>;
};

export default async function OrganizationLayout({
  children,
  params,
}: OrganizationLayoutProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);

  return (
    <DashboardShell organization={tenant.organization}>
      {children}
    </DashboardShell>
  );
}
