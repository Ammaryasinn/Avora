import { z } from "zod";

import { completeCreativeAssetUpload } from "@/features/creative-studio/server/assets";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

const schema = z.object({
  organizationSlug: z.string().trim().min(1).max(80),
  assetId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json({ error: "Invalid completion request." }, { status: 400 });
    }

    const tenant = await requireTenantContext(parsed.data.organizationSlug, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    const asset = await completeCreativeAssetUpload({
      organizationId: tenant.organizationId,
      assetId: parsed.data.assetId,
    });

    return Response.json({ id: asset.id, expiresAt: asset.expiresAt?.toISOString() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload could not be verified." },
      { status: 400 },
    );
  }
}
