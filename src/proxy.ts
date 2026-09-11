import { clerkMiddleware } from "@clerk/nextjs/server";

import {
  developmentPrimaryOrigin,
  developmentPrimarySignInUrl,
  developmentPrimarySignUpUrl,
  developmentSatelliteDomain,
  developmentSatelliteOrigin,
  isDevelopmentSatelliteHost,
  isDevelopmentSatelliteUrl,
} from "@/config/clerk-development";

export default clerkMiddleware(
  () => undefined,
  (request) => {
    if (process.env.NODE_ENV !== "development") return {};

    const forwardedHost =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const isSatellite =
      isDevelopmentSatelliteHost(forwardedHost) ||
      isDevelopmentSatelliteUrl(request.nextUrl);
    return {
      isSatellite,
      domain: developmentSatelliteDomain,
      signInUrl: developmentPrimarySignInUrl,
      signUpUrl: developmentPrimarySignUpUrl,
      satelliteAutoSync: isSatellite,
      authorizedParties: [developmentPrimaryOrigin, developmentSatelliteOrigin],
    };
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
