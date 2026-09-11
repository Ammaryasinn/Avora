"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

import {
  developmentPrimarySignInUrl,
  developmentPrimarySignUpUrl,
  developmentSatelliteDomain,
  developmentSatelliteOrigin,
  isDevelopmentSatelliteUrl,
} from "@/config/clerk-development";

export function HostAwareClerkProvider({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") {
    return <ClerkProvider>{children}</ClerkProvider>;
  }

  return (
    <ClerkProvider
      isSatellite={isDevelopmentSatelliteUrl}
      domain={developmentSatelliteDomain}
      signInUrl={developmentPrimarySignInUrl}
      signUpUrl={developmentPrimarySignUpUrl}
      allowedRedirectOrigins={[developmentSatelliteOrigin]}
      satelliteAutoSync
    >
      {children}
    </ClerkProvider>
  );
}
