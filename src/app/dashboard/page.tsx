import { redirect } from "next/navigation";

import { getFirstOrganizationMembership } from "@/features/organizations/server/queries";

export const dynamic = "force-dynamic";

export default async function DashboardEntryPage() {
  const membership = await getFirstOrganizationMembership();

  if (!membership) {
    redirect("/onboarding");
  }

  redirect(`/dashboard/${membership.organization.slug}`);
}
