export const developmentSatelliteDomain =
  "return-iii-grill-vic.trycloudflare.com";
export const developmentSatelliteOrigin =
  `https://${developmentSatelliteDomain}`;
export const developmentPrimaryOrigin = "http://localhost:3000";
export const developmentPrimarySignInUrl =
  `${developmentPrimaryOrigin}/sign-in`;
export const developmentPrimarySignUpUrl =
  `${developmentPrimaryOrigin}/sign-up`;

export function isDevelopmentSatelliteHost(host: string | null) {
  const hostname = host?.split(",")[0]?.trim().split(":")[0];

  return (
    process.env.NODE_ENV === "development" &&
    hostname === developmentSatelliteDomain
  );
}

export function isDevelopmentSatelliteUrl(url: URL) {
  return isDevelopmentSatelliteHost(url.hostname);
}

export function getDevelopmentPrimaryAuthUrl(
  authUrl: string,
  redirectUrl = developmentSatelliteOrigin,
) {
  const url = new URL(authUrl);
  url.searchParams.set("redirect_url", redirectUrl);
  return url.toString();
}
