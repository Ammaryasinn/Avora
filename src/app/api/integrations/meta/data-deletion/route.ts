import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { encryptMetaToken } from "@/lib/meta/token-cipher";
import { getMetaConfiguration } from "@/lib/meta/config";
import { getDatabase } from "@/lib/db/database";

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const signedRequest = formData.get("signed_request");
  if (typeof signedRequest !== "string") return Response.json({ error: "Invalid request." }, { status: 400 });
  const [encodedSignature, encodedPayload] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload) return Response.json({ error: "Invalid request." }, { status: 400 });

  const expected = createHmac("sha256", getMetaConfiguration().appSecret)
    .update(encodedPayload)
    .digest();
  const received = decodeBase64Url(encodedSignature);
  if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as {
    user_id?: string;
  };
  if (!payload.user_id) return Response.json({ error: "Invalid request." }, { status: 400 });
  const connections = await getDatabase().metaConnection.findMany({
    where: { metaUserId: payload.user_id },
    select: { id: true, organizationId: true },
  });
  for (const connection of connections) {
    const encrypted = encryptMetaToken(
      `revoked:${randomBytes(32).toString("base64url")}`,
      connection.organizationId,
      connection.id,
    );
    await getDatabase().metaConnection.update({
      where: { id: connection.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
      },
    });
  }

  const confirmationCode = randomBytes(16).toString("hex");
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  return Response.json({
    url: `${appUrl}/?meta_data_deletion=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
