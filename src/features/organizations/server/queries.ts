import { requireClerkUserId } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";

export async function getFirstOrganizationMembership() {
  const clerkUserId = await requireClerkUserId();

  return getDatabase().organizationMember.findFirst({
    where: {
      user: { clerkUserId },
    },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}
