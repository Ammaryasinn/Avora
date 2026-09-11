import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  META_OAUTH_COOKIE,
  completeMetaOAuth,
} from "@/features/meta/server/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const cookieStore = await cookies();
  const browserBinding = cookieStore.get(META_OAUTH_COOKIE)?.value;

  if (providerError || !code || !state || !browserBinding) {
    const response = NextResponse.redirect(new URL("/dashboard?meta=connection_failed", url));
    response.cookies.delete(META_OAUTH_COOKIE);
    return response;
  }

  try {
    const result = await completeMetaOAuth({ code, state, browserBinding });
    const response = NextResponse.redirect(new URL(`${result.redirectPath}?meta=connected`, url));
    response.cookies.delete(META_OAUTH_COOKIE);
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/dashboard?meta=connection_failed", url));
    response.cookies.delete(META_OAUTH_COOKIE);
    return response;
  }
}
