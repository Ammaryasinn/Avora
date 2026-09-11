import { z } from "zod";

import { createProductMediaUploadIntent } from "@/features/catalogue/server/media";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

const uploadIntentSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(80),
  productId: z.string().trim().min(1),
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
    const upload = await createProductMediaUploadIntent({
      organizationId: tenant.organizationId,
      productId: parsed.data.productId,
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
