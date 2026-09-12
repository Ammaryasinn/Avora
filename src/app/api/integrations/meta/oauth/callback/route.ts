import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  META_OAUTH_COOKIE,
  MetaOAuthCompletionError,
  completeMetaOAuth,
  logMetaOAuthEvent,
} from "@/features/meta/server/oauth";

function failureReason(stage: MetaOAuthCompletionError["stage"]) {
  if (stage === "token_encryption") return "token_encryption_failed";
  if (stage === "connection_upsert") return "connection_not_saved";
  if (stage === "code_exchange" || stage === "token_validation") {
    return "meta_token_exchange_failed";
  }
  if (stage === "organization_resolution") return "organization_access_changed";
  if (stage === "user_resolution") return "session_unavailable";
  return "oauth_state_invalid";
}

function redirectWithStatus(
  requestUrl: URL,
  path: string,
  meta: string,
  correlationId: string,
  reason?: string,
) {
  const safePath = path.startsWith("/dashboard") ? path : "/dashboard";
  const redirectUrl = new URL(safePath, requestUrl.origin);
  redirectUrl.searchParams.set("meta", meta);
  redirectUrl.searchParams.set("reference", correlationId);
  if (reason) redirectUrl.searchParams.set("reason", reason);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(META_OAUTH_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const correlationId = randomUUID();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const cookieStore = await cookies();
  const browserBinding = cookieStore.get(META_OAUTH_COOKIE)?.value;
  logMetaOAuthEvent({ event: "callback_received", correlationId });

  if (providerError) {
    logMetaOAuthEvent({
      event: "callback_failed",
      correlationId,
      stage: "provider_authorization",
      errorType: "MetaAuthorizationError",
      errorMessage: "Meta authorization was cancelled or denied.",
    });
    return redirectWithStatus(
      url,
      "/dashboard",
      "connection_failed",
      correlationId,
      "provider_authorization_failed",
    );
  }
  if (!code || !state || !browserBinding) {
    logMetaOAuthEvent({
      event: "callback_failed",
      correlationId,
      stage: "callback_validation",
      errorType: "OAuthCallbackValidationError",
      errorMessage: "The OAuth callback was missing required state.",
    });
    return redirectWithStatus(
      url,
      "/dashboard",
      "connection_failed",
      correlationId,
      "oauth_state_invalid",
    );
  }

  try {
    const result = await completeMetaOAuth({
      code,
      state,
      browserBinding,
      correlationId,
    });
    logMetaOAuthEvent({
      event: "callback_completed",
      correlationId,
      organizationId: result.connection.organizationId,
    });
    return redirectWithStatus(
      url,
      result.redirectPath,
      "connected",
      correlationId,
    );
  } catch (error) {
    const failure =
      error instanceof MetaOAuthCompletionError
        ? error
        : new MetaOAuthCompletionError({
            stage: "connection_upsert",
            cause: error,
          });
    logMetaOAuthEvent({
      event: "callback_failed",
      correlationId,
      organizationId: failure.organizationId,
      stage: failure.stage,
      errorType: failure.safeErrorType,
      errorMessage: failure.safeErrorMessage,
      httpStatus: failure.httpStatus,
    });
    return redirectWithStatus(
      url,
      failure.redirectPath ?? "/dashboard",
      "connection_failed",
      correlationId,
      failureReason(failure.stage),
    );
  }
}
