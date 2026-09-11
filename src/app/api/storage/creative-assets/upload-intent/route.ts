import { z } from "zod";

import { createCreativeAssetUploadIntent } from "@/features/creative-studio/server/assets";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

const schema = z.object({
  organizationSlug: z.string().trim().min(1).max(80),
  creativeId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(240),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
  consentAcknowledged: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json({ error: "Invalid reference upload request." }, { status: 400 });
    }

    const tenant = await requireTenantContext(parsed.data.organizationSlug, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    const upload = await createCreativeAssetUploadIntent({
      organizationId: tenant.organizationId,
      creativeId: parsed.data.creativeId,
      role: "PERSON_REFERENCE",
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      fileSize: parsed.data.fileSize,
      consentAcknowledged: parsed.data.consentAcknowledged,
    });

    return Response.json(upload, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload could not be started." },
      { status: 400 },
    );
  }
}
