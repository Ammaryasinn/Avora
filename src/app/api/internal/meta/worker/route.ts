import { timingSafeEqual } from "node:crypto";

import { processNextMetaPublishJob } from "@/features/meta/server/worker";

export const runtime = "nodejs";

function authorized(request: Request) {
  const configured = process.env.META_PUBLISH_WORKER_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const configuredBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  return configuredBytes.length === suppliedBytes.length && timingSafeEqual(configuredBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return Response.json(await processNextMetaPublishJob());
}
