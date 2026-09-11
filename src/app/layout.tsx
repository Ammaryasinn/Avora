import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HostAwareClerkProvider } from "@/components/auth/host-aware-clerk-provider";
import { siteConfig } from "@/config/site";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <HostAwareClerkProvider>
      <html lang="en" className="h-full scroll-smooth antialiased">
        <body className="min-h-full">{children}</body>
      </html>
    </HostAwareClerkProvider>
  );
}
