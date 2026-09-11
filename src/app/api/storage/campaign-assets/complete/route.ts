import { z } from "zod";

import { completeCampaignAssetUpload } from "@/features/campaigns/server/assets";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

const completeUploadSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(80),
  campaignId: z.string().trim().min(1).max(100),
  campaignCreativeId: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const parsed = completeUploadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid completion request." },
        { status: 400 },
      );
    }

    const tenant = await requireTenantContext(parsed.data.organizationSlug, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    const asset = await completeCampaignAssetUpload({
      organizationId: tenant.organizationId,
      campaignId: parsed.data.campaignId,
      campaignCreativeId: parsed.data.campaignCreativeId,
    });

    return Response.json(asset);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload could not be verified.";
    return Response.json({ error: message }, { status: 400 });
  }
}
