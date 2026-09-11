import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import { META_OAUTH_SCOPES, getMetaConfiguration } from "@/lib/meta/config";
import { getMetaAdsGateway } from "@/lib/meta/meta-ads-gateway";
import { encryptMetaToken } from "@/lib/meta/token-cipher";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";
import { OrganizationRole } from "@/generated/prisma/enums";

import { recordMetaAuditEvent } from "./audit";

export const META_OAUTH_COOKIE = "avora_meta_oauth";
const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

function stateHash(state: string, browserBinding: string) {
  return createHmac("sha256", getMetaConfiguration().oauthStateSecret)
    .update(`${state}:${browserBinding}`)
    .digest("hex");
}

export async function createMetaOAuthStart(organizationSlug: string) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const config = getMetaConfiguration();
  const state = randomBytes(32).toString("base64url");
  const browserBinding = randomBytes(32).toString("base64url");
  const redirectPath = `/dashboard/${tenant.organization.slug}/settings/integrations/meta`;

  await getDatabase().metaOAuthState.create({
    data: {
      organizationId: tenant.organizationId,
      initiatedById: user.id,
      stateHash: stateHash(state, browserBinding),
      redirectPath,
      expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
    },
  });

  const query = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.oauthRedirectUri,
    response_type: "code",
    state,
    scope: META_OAUTH_SCOPES.join(","),
  });

  return {
    authorizationUrl: `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth?${query}`,
    browserBinding,
    secureCookie: config.oauthRedirectUri.startsWith("https://"),
  };
}

export async function completeMetaOAuth(input: {
  code: string;
  state: string;
  browserBinding: string;
}) {
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const oauthState = await database.metaOAuthState.findUnique({
    where: { stateHash: stateHash(input.state, input.browserBinding) },
  });
  if (
    !oauthState ||
    oauthState.consumedAt ||
    oauthState.expiresAt <= new Date() ||
    oauthState.initiatedById !== user.id
  ) {
    throw new Error("The Meta connection request is invalid or expired.");
  }

  const consumed = await database.metaOAuthState.updateMany({
    where: { id: oauthState.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new Error("The Meta connection request was already used.");

  const gateway = getMetaAdsGateway();
  const exchanged = await gateway.exchangeAuthorizationCode(input.code);
  const [identity, inspected] = await Promise.all([
    gateway.getIdentity(exchanged.accessToken),
    gateway.inspectToken(exchanged.accessToken),
  ]);
  if (!inspected.valid) throw new Error("Meta returned an invalid access credential.");

  const missingScopes = META_OAUTH_SCOPES.filter(
    (scope) => scope !== "public_profile" && !inspected.scopes.includes(scope),
  );
  const existing = await database.metaConnection.findUnique({
    where: {
      organizationId_metaUserId: {
        organizationId: oauthState.organizationId,
        metaUserId: identity.id,
      },
    },
    select: { id: true },
  });
  const connectionId = existing?.id ?? randomUUID();
  const encrypted = encryptMetaToken(
    exchanged.accessToken,
    oauthState.organizationId,
    connectionId,
  );
  const expiresAt = inspected.expiresAt ?? exchanged.expiresAt;

  const connection = await database.metaConnection.upsert({
    where: {
      organizationId_metaUserId: {
        organizationId: oauthState.organizationId,
        metaUserId: identity.id,
      },
    },
    create: {
      id: connectionId,
      organizationId: oauthState.organizationId,
      connectedById: user.id,
      metaUserId: identity.id,
      metaUserName: identity.name,
      status: missingScopes.length ? "DEGRADED" : "CONNECTED",
      scopes: inspected.scopes,
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      tokenKeyVersion: encrypted.keyVersion,
      tokenExpiresAt: expiresAt,
      dataAccessExpiresAt: inspected.dataAccessExpiresAt,
      lastValidatedAt: new Date(),
      lastErrorCode: missingScopes.length ? "MISSING_SCOPES" : null,
      lastErrorMessage: missingScopes.length
        ? "Reconnect Meta and grant all required permissions."
        : null,
    },
    update: {
      connectedById: user.id,
      metaUserName: identity.name,
      status: missingScopes.length ? "DEGRADED" : "CONNECTED",
      scopes: inspected.scopes,
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      tokenKeyVersion: encrypted.keyVersion,
      tokenExpiresAt: expiresAt,
      dataAccessExpiresAt: inspected.dataAccessExpiresAt,
      lastValidatedAt: new Date(),
      lastErrorCode: missingScopes.length ? "MISSING_SCOPES" : null,
      lastErrorMessage: missingScopes.length
        ? "Reconnect Meta and grant all required permissions."
        : null,
      disconnectedAt: null,
      revokedAt: null,
    },
  });
  await recordMetaAuditEvent({
    organizationId: oauthState.organizationId,
    actorUserId: user.id,
    action: "META_CONNECTED",
    entityType: "MetaConnection",
    entityId: connection.id,
    metadata: { scopeCount: inspected.scopes.length, missingScopeCount: missingScopes.length },
  });

  return { connection, redirectPath: oauthState.redirectPath };
}
