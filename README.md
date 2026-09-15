# Avora

Avora is a multi-tenant AI-powered revenue platform. Milestone 3B adds a real,
signed WhatsApp Cloud API inbound path to the Clerk, organization, catalogue,
Creative Studio, Campaign Builder, and PAUSED-only Meta Ads foundation.

Implemented now:

- Avora-owned organizations, memberships, and `OWNER` / `ADMIN` / `MEMBER` roles
- Tenant-scoped products, variants, inventory, and private product media
- Product-grounded creative briefs and asynchronous generation jobs
- OpenAI copy, moderation, general image generation, and image editing
- fal.ai virtual try-on with explicit person consent and seven-day retention
- Private Cloudflare R2 assets with short-lived signed upload/download URLs
- Creative variants, non-destructive editing, approval, and Creative Library
- Decimal AI budget reservations, usage reconciliation, retries, and rate limits
- Draft campaign planning across objectives, products, audiences, creatives,
  budgets, schedules, review, and internal approval
- Real approved Creative Studio selections and private manual campaign assets
- Tenant-scoped Meta OAuth connections and synchronized owned business assets
- Immutable Meta validation snapshots, explicit publish approvals, and audit events
- Durable, idempotent Meta publish jobs with reconciliation-first failure handling
- Real Meta campaign, ad set, creative, and ad creation with delivery objects fixed to `PAUSED`
- Encrypted tenant WhatsApp connections with read-only connection testing
- Signed, durable, idempotent WhatsApp webhooks and lease-based processing
- Real inbound contacts, leads, conversations, messages, assignment, and consent state
- Controlled human WhatsApp replies with a server kill switch, 24-hour window enforcement, and delivery tracking

Campaign activation, ad spend execution, automatic budget changes, optimization,
performance analytics, Instant Forms, Meta catalogues, WhatsApp templates,
AI auto-replies, automated follow-ups, payments, and video generation remain
intentionally unavailable.
The UI does not display fabricated revenue, sales, or performance data.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Tailwind CSS 4 and the semantic Sand & Beige Design System V2
- Clerk for authentication and identity only
- Neon PostgreSQL and Prisma ORM 7
- Zod for all browser-to-server input validation
- Cloudflare R2 for canonical private assets
- OpenAI and fal.ai behind Avora-owned provider contracts

Node.js 20.19 or newer is required.

## Architecture

Avora is a modular monolith: one deployable Next.js application with internal
feature boundaries. Route files remain thin, server/database logic lives outside
presentation components, and provider-specific SDKs do not enter domain code.

```text
prisma/
  schema.prisma                 Database schema and tenant ownership
  migrations/                  Reviewed SQL migrations
scripts/
  ai-worker.mjs                Postgres job-runner polling process
  meta-publish-worker.mjs      Postgres Meta publishing worker
  whatsapp-worker.mjs          Fallback WhatsApp webhook worker
src/
  app/                         App Router pages and route handlers
  components/                  Shared shell and UI primitives
  features/
    catalogue/                 Products, inventory, and product media
    creative-studio/           Briefs, jobs, variants, editor, library
    campaigns/                 Draft planning, audience, budget, assets
    meta/                      OAuth, asset sync, validation, publish jobs
    whatsapp/                  Connections, inbound processing, conversations, leads
    onboarding/                First organization/business setup
    organizations/             Organization queries
  lib/
    ai/                        Provider contracts, adapters, policy, webhooks
    auth/                      Clerk identity resolution
    db/                        Prisma lifecycle
    storage/                   BlobStore contract and private R2 adapter
    meta/                      Graph adapter, encryption, contracts, controls
    whatsapp/                  Cloud API adapter, signatures, encryption, contracts
    tenancy/                   Membership authorization
  generated/prisma/            Generated Prisma Client
```

`AIJobDispatcher` currently targets a Postgres-backed queue. The worker claims
jobs with leases and optimistic transactional updates, so it can later be
replaced by a managed queue without changing Creative Studio domain code.

Meta publishing uses the same modular pattern behind `MetaPublishJobDispatcher`.
Every write step has a deterministic marker and request fingerprint. Successful
external IDs are persisted immediately. Ambiguous create responses stop the job
for reconciliation rather than issuing a blind retry.

## Tenant Isolation

Clerk proves identity only. Avora owns organizations, memberships, roles, and
all business data in Neon. Every business-owned record includes
`organizationId`.

Server routes and actions derive the trusted organization ID through
`requireTenantContext`. Browser-provided slugs and record IDs are treated as
untrusted and every lookup combines the record identifier with the derived
tenant context. The browser never supplies provider or model identifiers.

`OWNER` and `ADMIN` can create or change products, creatives, and campaign
plans, manage Meta connections, validate, and approve publishing. `MEMBER` has
read-only access. Membership is checked again immediately before the first Meta
write. R2 buckets stay private; authenticated
handlers issue 60-second download redirects only after membership checks.

Campaign products and approved creatives are resolved server-side against the
derived tenant. Browser-provided organization IDs are never accepted as
authorization, and manually uploaded campaign assets use the same private R2
validation and signed delivery boundary as catalogue and Creative Studio media.

## Money and AI Limits

Product prices and AI costs use Prisma `Decimal` backed by PostgreSQL `numeric`.
The pilot default is USD 10 per organization per month, with a USD 2 per-job
ceiling, two concurrent jobs, and ten requests per minute. Values are
configurable through environment defaults and persisted organization settings.

Generation reserves budget atomically before queueing. Completion releases the
reservation and records consumed cost. Failed terminal jobs release their
reservation. Provider-reported usage is retained when available; otherwise the
attempt is marked as an Avora estimate.

## Environment

Copy `.env.example` to `.env` and provide values locally. Never commit
secrets or paste them into issues or chat.

### Clerk and Neon

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL=
DIRECT_URL=
```

Use a pooled Neon URL for `DATABASE_URL` and a direct Neon URL for migrations in
`DIRECT_URL`.

### Cloudflare R2

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

Create a private bucket and an API token scoped only to that bucket. Configure
bucket CORS for the application origins and `PUT` requests with
`Content-Type`. Do not make the bucket or a custom domain public.

### OpenAI and fal.ai

```env
OPENAI_API_KEY=
OPENAI_PROJECT_ID=
OPENAI_TEXT_MODEL=
OPENAI_IMAGE_MODEL=
OPENAI_MODERATION_MODEL=omni-moderation-latest
FAL_KEY=
FAL_VIRTUAL_TRY_ON_MODEL=
```

Model environment values are optional overrides, but any supplied value must be
in Avora's server allowlist. Use a scoped fal API key. Configure fal webhook
delivery to the public application URL; Avora verifies fal's ED25519 signature.

### Worker and controls

```env
APP_URL=http://localhost:3000
AI_WORKER_SECRET=
AI_DEFAULT_MONTHLY_BUDGET_USD=10.00
AI_DEFAULT_PER_JOB_LIMIT_USD=2.00
AI_DEFAULT_MAX_CONCURRENT_JOBS=2
AI_DEFAULT_REQUESTS_PER_MINUTE=10
AI_PERSON_REFERENCE_RETENTION_DAYS=7
AI_TEXT_ENABLED=true
AI_IMAGE_ENABLED=true
AI_IMAGE_EDIT_ENABLED=true
AI_VIRTUAL_TRY_ON_ENABLED=true
```

Generate `AI_WORKER_SECRET` as a high-entropy secret and keep it server-side.
Production should run the worker continuously against the deployed `APP_URL`.
Kill switches can disable each implemented capability without a deployment.

### Meta Ads

```env
META_APP_ID=
META_APP_SECRET=
META_OAUTH_REDIRECT_URI=
META_GRAPH_API_VERSION=
META_TOKEN_ENCRYPTION_KEY=
META_TOKEN_ENCRYPTION_KEY_VERSION=
META_TOKEN_ENCRYPTION_PREVIOUS_KEYS=
META_OAUTH_STATE_SECRET=
META_PUBLISH_WORKER_SECRET=
META_PUBLISHING_ENABLED=
META_MAX_PUBLISH_CONCURRENCY=
```

Create a Meta developer app with the Marketing API product and register
`META_OAUTH_REDIRECT_URI` exactly as
`https://your-domain.example/api/integrations/meta/oauth/callback`. Use Graph API
`v26.0`. `META_TOKEN_ENCRYPTION_KEY` must be a base64-encoded 32-byte key;
increment `META_TOKEN_ENCRYPTION_KEY_VERSION` when rotating it and temporarily
provide older version-to-key mappings as JSON in
`META_TOKEN_ENCRYPTION_PREVIOUS_KEYS`. Generate the OAuth state and worker
secrets independently with high entropy.

Development/app-role testing can use only Meta assets owned by or assigned to
the app's test users, developers, or administrators. Production use requires
the applicable App Review permissions and may require Business Verification,
Advanced Access, and Full Marketing API access. Keep those provider processes
separate from local development testing.

The initial development OAuth request is intentionally limited to
`public_profile`, `ads_management`, `business_management`, `pages_show_list`,
and `pages_read_engagement`. Page publishing and Instagram-specific permissions
remain modeled but optional; request `pages_manage_ads`, `instagram_basic`, or
`pages_read_user_content` only after the corresponding Meta products and access
requirements are configured.

`META_PUBLISHING_ENABLED=true` is the server kill switch. An owner or admin must
also enable publishing for the organization, validate the immutable snapshot,
and click **Publish to Meta as Paused**. Avora does not expose an activation path.

### WhatsApp inbound and controlled outbound

```env
APP_URL=https://avora-livid.vercel.app
WHATSAPP_META_APP_ID=
WHATSAPP_META_APP_SECRET=
WHATSAPP_GRAPH_API_VERSION=v26.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_TOKEN_ENCRYPTION_KEY=
WHATSAPP_TOKEN_ENCRYPTION_KEY_VERSION=v1
WHATSAPP_TOKEN_ENCRYPTION_PREVIOUS_KEYS={}
WHATSAPP_WEBHOOK_WORKER_SECRET=
WHATSAPP_RAW_EVENT_RETENTION_DAYS=7
WHATSAPP_WEBHOOK_MAX_ATTEMPTS=8
WHATSAPP_WEBHOOK_LEASE_SECONDS=60
WHATSAPP_INBOUND_ENABLED=true
WHATSAPP_OUTBOUND_ENABLED=false
```

All values above belong in Vercel server environment variables. Never prefix
them with `NEXT_PUBLIC_`. `WHATSAPP_META_APP_SECRET`, the verification token,
encryption keys, and worker secret must be independently generated secrets.
`WHATSAPP_TOKEN_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Preserve
old version-to-key mappings in `WHATSAPP_TOKEN_ENCRYPTION_PREVIOUS_KEYS` during
key rotation.

The WABA ID, phone number ID, display phone metadata, and tenant access token are
configured by an owner or admin at
`/dashboard/{organizationSlug}/settings/integrations/whatsapp`. Avora stores the
access token only as AES-256-GCM ciphertext bound to that organization and
connection. The token is never returned to the browser after submission.

In Meta for Developers, use a Business app and add the **WhatsApp** product. In
**WhatsApp > API Setup**, select or create the WABA and business phone number;
copy the WABA ID and phone number ID. For an initial app-role test, the temporary
token from API Setup is sufficient. For a durable connection, assign the app and
WABA to a Meta system user and generate a token with
`whatsapp_business_management` and `whatsapp_business_messaging`.

In **WhatsApp > Configuration**, configure the webhook callback as
`https://avora-livid.vercel.app/api/webhooks/whatsapp`, use the exact value of
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and subscribe the
`whatsapp_business_account` object to the `messages` field. Saving a connection
in Avora performs read-only WABA and phone lookups, confirms the IDs belong
together, subscribes the supplied WABA to the app, and then encrypts the token.
It never sends a message.

To prove the inbound path, send a text from a real WhatsApp account to the Meta
test or registered business number. The signed callback is acknowledged, its
known-tenant payload is stored privately in R2, and a post-response worker creates
the Contact, Lead, Conversation, and inbound Message. Open
`/dashboard/{organizationSlug}/conversations` and select the new thread. If the
hosting platform cannot run post-response work, run `npm run whatsapp:worker` as
the fallback poller.

`WHATSAPP_OUTBOUND_ENABLED` is a hard server-side kill switch. Keep it `false`
to allow owners and admins to save drafts without making any `/messages` API
call. Set it to `true` in Vercel and redeploy only when controlled human sending
is approved. Members remain read-only. Avora permits text sends only from a
persisted draft, through a connected tenant-owned phone, within the rolling
24-hour customer service window derived from the latest persisted inbound
message. `UNKNOWN` and `NO_CONSENT` follow-up states do not block a reply inside
that user-initiated window; `OPTED_OUT`, blocked contacts, archived
conversations, inactive connections, and closed windows are hard blocks. Closed
windows require a template, and template sending is not implemented.

For a production proof, first deploy with `WHATSAPP_OUTBOUND_ENABLED=false`,
save a draft, and confirm the send button is disabled. Then send a fresh inbound
message from the test customer, set the Vercel variable to `true`, redeploy, and
sign in as an owner or admin. Save a text draft and click **Send via WhatsApp**
once; confirm one outbound message, one provider message ID, and a delivery
history that advances from `SENT` to `DELIVERED` and `READ` as webhooks arrive.
Double-click testing must still create only one external message. Confirm a
member has no draft or send controls, an opted-out or blocked contact cannot
send, and a conversation whose latest inbound message is older than 24 hours
shows **Customer service window closed** with no enabled send control.

## Setup

```bash
npm install
npm run db:generate
npx prisma migrate deploy
```

Migrations in this repository:

- `20260910232251_milestone_1`
- `20260911092307_milestone_2a_creative_studio`
- `20260911122955_milestone_2b_campaign_builder`
- `20260911142248_milestone_2c_meta_ads`
- `20260912092915_milestone_3a_whatsapp_conversations_leads`

For a new schema change during development, use:

```bash
npm run db:migrate -- --name descriptive_name
```

## Development

Run the web application and worker in separate terminals:

```bash
npm run dev
npm run ai:worker
npm run meta:worker
npm run whatsapp:worker
```

Open [http://localhost:3000](http://localhost:3000). The worker requires the web
application because it calls the protected internal worker endpoint.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npx prisma validate
npx prisma migrate status
npm run build
```
