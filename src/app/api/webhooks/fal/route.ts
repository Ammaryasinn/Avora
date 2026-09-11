import { z } from "zod";

import { verifyFalWebhook } from "@/lib/ai/fal-webhook";
import { getDatabase } from "@/lib/db/database";

export const runtime = "nodejs";

const payloadSchema = z.object({
  request_id: z.string().min(1),
  status: z.string().min(1),
});

export async function POST(request: Request) {
  const body = new Uint8Array(await request.arrayBuffer());

  if (!(await verifyFalWebhook(request, body))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  const database = getDatabase();
  const attempt = await database.aIJobAttempt.findFirst({
    where: { providerKey: "fal", providerRequestId: parsed.data.request_id },
    select: { id: true, jobId: true, organizationId: true },
  });

  if (!attempt) {
    return Response.json({ received: true });
  }

  await database.$transaction([
    database.aIJobAttempt.update({
      where: { id: attempt.id },
      data: { providerStatus: parsed.data.status },
    }),
    database.aIJob.updateMany({
      where: {
        id: attempt.jobId,
        organizationId: attempt.organizationId,
        status: "QUEUED",
      },
      data: { availableAt: new Date() },
    }),
  ]);

  return Response.json({ received: true });
}
