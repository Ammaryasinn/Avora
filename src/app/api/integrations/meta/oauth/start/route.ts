import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  META_OAUTH_COOKIE,
  createMetaOAuthStart,
} from "@/features/meta/server/oauth";
import { getMetaConfiguration } from "@/lib/meta/config";

const querySchema = z.object({ organizationSlug: z.string().min(1).max(120) });

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackOrigin = new URL(getMetaConfiguration().oauthRedirectUri).origin;
  if (requestUrl.origin !== callbackOrigin) {
    return NextResponse.redirect(
      new URL(`${requestUrl.pathname}${requestUrl.search}`, callbackOrigin),
    );
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(requestUrl.searchParams.entries()),
  );
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await createMetaOAuthStart(parsed.data.organizationSlug);
  const cookieStore = await cookies();
  cookieStore.set(META_OAUTH_COOKIE, result.browserBinding, {
    httpOnly: true,
    secure: result.secureCookie,
    sameSite: "lax",
    path: "/api/integrations/meta/oauth/callback",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(result.authorizationUrl);
}
