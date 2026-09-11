import { notFound } from "next/navigation";

import { OrganizationRole } from "@/generated/prisma/enums";
import { requireClerkUserId } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";

export async function requireTenantContext(
  organizationSlug: string,
  allowedRoles?: readonly OrganizationRole[],
) {
  const clerkUserId = await requireClerkUserId();
  const membership = await getDatabase().organizationMember.findFirst({
    where: {
      organization: { slug: organizationSlug },
      user: { clerkUserId },
    },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          businessProfile: {
            select: {
              displayName: true,
              currencyCode: true,
            },
          },
        },
      },
    },
  });

  if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
    notFound();
  }

  return {
    organizationId: membership.organization.id,
    organization: membership.organization,
    role: membership.role,
  };
}
