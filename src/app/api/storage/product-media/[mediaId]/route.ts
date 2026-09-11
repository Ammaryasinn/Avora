import { requireClerkUserId } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import { getBlobStore } from "@/lib/storage/r2-object-storage";

type ProductMediaRouteProps = {
  params: Promise<{ mediaId: string }>;
};

export async function GET(_request: Request, { params }: ProductMediaRouteProps) {
  const { mediaId } = await params;
  const clerkUserId = await requireClerkUserId();
  const media = await getDatabase().productMedia.findFirst({
    where: {
      id: mediaId,
      uploadStatus: "READY",
      organization: {
        members: { some: { user: { clerkUserId } } },
      },
    },
    select: { storageKey: true },
  });

  if (!media?.storageKey) {
    return new Response(null, { status: 404 });
  }

  const downloadUrl = await getBlobStore().createDownloadUrl({
    key: media.storageKey,
    expiresInSeconds: 60,
  });

  return Response.redirect(downloadUrl, 307);
}
