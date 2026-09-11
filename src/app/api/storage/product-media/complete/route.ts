import { z } from "zod";

import { completeProductMediaUpload } from "@/features/catalogue/server/media";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

const completeUploadSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(80),
  mediaId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const parsed = completeUploadSchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json({ error: "Invalid completion request." }, { status: 400 });
    }

    const tenant = await requireTenantContext(parsed.data.organizationSlug, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    const media = await completeProductMediaUpload({
      organizationId: tenant.organizationId,
      mediaId: parsed.data.mediaId,
    });

    return Response.json(media);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload could not be verified.";
    return Response.json({ error: message }, { status: 400 });
  }
}
