import { z } from "zod";

import { createCampaignAssetUploadIntent } from "@/features/campaigns/server/assets";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

const uploadIntentSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(80),
  campaignId: z.string().trim().min(1).max(100),
  fileName: z.string().trim().min(1).max(240),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
});

export async function POST(request: Request) {
  try {
    const parsed = uploadIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid upload request." }, { status: 400 });
    }

    const tenant = await requireTenantContext(parsed.data.organizationSlug, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    const upload = await createCampaignAssetUploadIntent({
      organizationId: tenant.organizationId,
      campaignId: parsed.data.campaignId,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      fileSize: parsed.data.fileSize,
    });

    return Response.json(upload, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload could not be started.";
    return Response.json({ error: message }, { status: 400 });
  }
}
