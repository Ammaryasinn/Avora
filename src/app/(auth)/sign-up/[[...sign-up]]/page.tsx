import { SignUp } from "@clerk/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  developmentPrimarySignUpUrl,
  getDevelopmentPrimaryAuthUrl,
  isDevelopmentSatelliteHost,
} from "@/config/clerk-development";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (isDevelopmentSatelliteHost(host)) {
    redirect(getDevelopmentPrimaryAuthUrl(developmentPrimarySignUpUrl));
  }

  return <SignUp appearance={clerkAppearance} />;
}

const clerkAppearance = {
  variables: {
    colorPrimary: "#8b6747",
    colorBackground: "#fffdf8",
    colorForeground: "#1b1815",
    colorMutedForeground: "#746b61",
    colorInputBackground: "#ffffff",
    colorInputText: "#1b1815",
    borderRadius: "0.875rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full border border-border bg-surface/95 shadow-[var(--shadow-raised)]",
    headerTitle: "tracking-[-0.025em]",
    headerSubtitle: "text-text-secondary",
    socialButtonsBlockButton:
      "border-border-strong bg-surface-raised hover:bg-primary-muted",
    formFieldInput:
      "border-border-strong bg-surface-raised focus:border-primary",
    footerActionLink: "text-primary hover:text-primary-hover",
  },
};
