import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("environment template contains blank placeholders only", async () => {
  const template = await read(".env.example");
  for (const line of template.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    assert.match(line, /^[A-Z0-9_]+=$/);
  }
});

test("Meta delivery objects are hard-coded to PAUSED", async () => {
  const gateway = await read("src/lib/meta/meta-ads-gateway.ts");
  assert.equal((gateway.match(/status: "PAUSED"/g) ?? []).length, 3);
  assert.doesNotMatch(gateway, /status:\s*input\./);
});

test("the final approval action states paused publishing explicitly", async () => {
  const review = await read("src/app/dashboard/[organizationSlug]/campaigns/[campaignId]/meta/review/page.tsx");
  assert.match(review, />Publish to Meta as Paused</);
});

test("development OAuth requests only the approved minimal scopes", async () => {
  const config = await read("src/lib/meta/config.ts");
  const requested = config.slice(
    config.indexOf("export const META_OAUTH_SCOPES"),
    config.indexOf("export const META_OPTIONAL_OAUTH_SCOPES"),
  );
  for (const scope of ["public_profile", "ads_management", "business_management", "pages_show_list", "pages_read_engagement"]) {
    assert.match(requested, new RegExp(`"${scope}"`));
  }
  for (const scope of ["pages_manage_ads", "instagram_basic", "pages_read_user_content", "ads_read"]) {
    assert.doesNotMatch(requested, new RegExp(`"${scope}"`));
  }
});

test("OAuth starts on the configured callback origin before binding state", async () => {
  const route = await read("src/app/api/integrations/meta/oauth/start/route.ts");
  assert.match(route, /requestUrl\.origin !== callbackOrigin/);
  assert.ok(route.indexOf("requestUrl.origin !== callbackOrigin") < route.lastIndexOf("createMetaOAuthStart("));
});

test("development Clerk satellite configuration is host-aware", async () => {
  const provider = await read("src/components/auth/host-aware-clerk-provider.tsx");
  const middleware = await read("src/proxy.ts");
  const nextConfig = await read("next.config.ts");
  assert.match(provider, /isSatellite=\{isDevelopmentSatelliteUrl\}/);
  assert.match(provider, /allowedRedirectOrigins=\{\[developmentSatelliteOrigin\]\}/);
  assert.match(provider, /satelliteAutoSync/);
  assert.match(middleware, /isDevelopmentSatelliteHost\(forwardedHost\)/);
  assert.match(middleware, /isDevelopmentSatelliteUrl\(request\.nextUrl\)/);
  assert.match(middleware, /satelliteAutoSync: isSatellite/);
  assert.match(nextConfig, /allowedDevOrigins: \["return-iii-grill-vic\.trycloudflare\.com"\]/);
});

test("the Meta migration is additive", async () => {
  const migration = await read("prisma/migrations/20260911142248_milestone_2c_meta_ads/migration.sql");
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|TRUNCATE\b|DELETE\s+FROM\b)/im);
  assert.match(migration, /CREATE TABLE "MetaConnection"/);
  assert.match(migration, /CREATE TABLE "MetaPublishJob"/);
});
