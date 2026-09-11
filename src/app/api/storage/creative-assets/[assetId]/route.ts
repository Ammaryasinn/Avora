import { requireClerkUserId } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import { getBlobStore } from "@/lib/storage/r2-object-storage";

type RouteProps = { params: Promise<{ assetId: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  const { assetId } = await params;
  const clerkUserId = await requireClerkUserId();
  const asset = await getDatabase().creativeAsset.findFirst({
    where: {
      id: assetId,
      status: "READY",
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      organization: { members: { some: { user: { clerkUserId } } } },
    },
    select: { storageKey: true },
  });

  if (!asset) {
    return new Response(null, { status: 404 });
  }

  const downloadUrl = await getBlobStore().createDownloadUrl({
    key: asset.storageKey,
    expiresInSeconds: 60,
  });

  return Response.redirect(downloadUrl, 307);
}
