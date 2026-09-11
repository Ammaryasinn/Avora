import { requireClerkUserId } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import { getBlobStore } from "@/lib/storage/r2-object-storage";

type CampaignAssetRouteProps = {
  params: Promise<{ campaignCreativeId: string }>;
};

export async function GET(
  _request: Request,
  { params }: CampaignAssetRouteProps,
) {
  const { campaignCreativeId } = await params;
  const clerkUserId = await requireClerkUserId();
  const asset = await getDatabase().campaignCreative.findFirst({
    where: {
      id: campaignCreativeId,
      source: "MANUAL_UPLOAD",
      uploadStatus: "READY",
      organization: {
        members: { some: { user: { clerkUserId } } },
      },
    },
    select: { storageKey: true },
  });

  if (!asset?.storageKey) return new Response(null, { status: 404 });

  const downloadUrl = await getBlobStore().createDownloadUrl({
    key: asset.storageKey,
    expiresInSeconds: 60,
  });

  return Response.redirect(downloadUrl, 307);
}
