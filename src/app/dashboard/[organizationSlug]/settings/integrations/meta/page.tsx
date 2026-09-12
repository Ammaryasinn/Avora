import Link from "next/link";

import {
  disconnectMetaAction,
  syncMetaAssetsFormAction,
} from "@/features/meta/server/actions";
import { getMetaIntegrationOverview } from "@/features/meta/server/queries";
import { getWhatsAppIntegrationOverview } from "@/features/whatsapp/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { MegaphoneIcon, MessageIcon } from "@/components/ui/icons";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{
    meta?: string;
    reason?: string;
    reference?: string;
  }>;
};

export default async function MetaIntegrationPage({ params, searchParams }: PageProps) {
  const { organizationSlug } = await params;
  const query = await searchParams;
  const tenant = await requireTenantContext(organizationSlug);
  const [overview, whatsappOverview] = await Promise.all([
    getMetaIntegrationOverview(tenant.organizationId),
    getWhatsAppIntegrationOverview(tenant.organizationId),
  ]);
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const metaConnected = overview.connections.some((connection) => connection.status === "CONNECTED");
  const whatsappConnected = whatsappOverview.connections.some((connection) => connection.status === "CONNECTED");

  return (
    <div>
      <p className="eyebrow">Settings · Integrations</p>
      <h1 className="page-title">Meta Ads</h1>
      <p className="page-description">
        Connect authorized Meta business assets, validate approved campaign plans, and publish new objects in a paused state only.
      </p>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Available integrations</p>
            <h2 className="section-heading mt-3 text-2xl">Connected channels</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Link
            aria-current="page"
            className="premium-panel group rounded-3xl border-primary/25 p-5 transition hover:-translate-y-0.5 hover:border-primary/40 sm:p-6"
            href={`/dashboard/${organizationSlug}/settings/integrations/meta`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary-muted text-primary"><MegaphoneIcon className="size-5" /></span>
              <span className={`status-pill ${metaConnected ? "status-success" : ""}`}>{metaConnected ? "Connected" : "Not connected"}</span>
            </div>
            <h3 className="mt-5 text-lg font-semibold">Meta Ads</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">Business assets and paused-only campaign publishing.</p>
          </Link>
          <Link
            className="premium-panel group rounded-3xl p-5 transition hover:-translate-y-0.5 hover:border-primary/40 sm:p-6"
            href={`/dashboard/${organizationSlug}/settings/integrations/whatsapp`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary-muted text-primary"><MessageIcon className="size-5" /></span>
              <span className={`status-pill ${whatsappConnected ? "status-success" : ""}`}>{whatsappConnected ? "Connected" : "Not connected"}</span>
            </div>
            <h3 className="mt-5 text-lg font-semibold">WhatsApp</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">Secure inbound conversations, leads, and human handoff.</p>
          </Link>
        </div>
      </section>

      {query.meta === "connected" ? <Notice tone="success">Meta identity connected. Sync assets before configuring campaigns.</Notice> : null}
      {query.meta === "connection_failed" ? (
        <Notice tone="danger">
          {getConnectionFailureMessage(query.reason)}
          {query.reference ? ` Reference: ${query.reference}` : ""}
        </Notice>
      ) : null}
      {!overview.availability.configured ? (
        <section className="mt-8 rounded-3xl border border-warning/25 bg-warning-muted p-6">
          <p className="font-semibold text-warning">Server configuration required</p>
          <p className="mt-2 text-sm text-text-secondary">Configure these variables locally; values are never shown in Avora:</p>
          <p className="mt-3 font-mono text-xs leading-6 text-text-secondary">{overview.availability.missing.join(" · ")}</p>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="premium-panel rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="eyebrow">Connections</p><h2 className="section-heading mt-3 text-2xl">Authorized identities</h2></div>
            {canManage && overview.availability.configured ? <a className="button-primary" href={`/api/integrations/meta/oauth/start?organizationSlug=${encodeURIComponent(organizationSlug)}`}>Connect Meta</a> : null}
          </div>
          <div className="mt-6 space-y-4">
            {overview.connections.length ? overview.connections.map((connection) => (
              <article key={connection.id} className="rounded-2xl border border-border bg-surface-muted/35 p-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div><p className="font-semibold">{connection.metaUserName ?? "Meta account"}</p><p className="mt-1 text-xs text-text-muted">Updated {connection.updatedAt.toLocaleString()}</p></div>
                  <span className={`status-pill ${connection.status === "CONNECTED" ? "status-success" : connection.status === "DEGRADED" ? "status-warning" : "status-error"}`}>{connection.status}</span>
                </div>
                <p className="mt-4 text-sm text-text-secondary">{connection._count.adAccounts} ad accounts · {connection._count.pages} Pages · {connection._count.instagramAccounts} Instagram accounts · {connection._count.datasets} datasets</p>
                {connection.lastErrorMessage ? <p className="mt-3 text-sm text-danger">{connection.lastErrorMessage}</p> : null}
                {canManage && connection.status !== "DISCONNECTED" ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <form action={syncMetaAssetsFormAction.bind(null, organizationSlug, connection.id)}><button className="button-secondary">Sync assets</button></form>
                    <form action={disconnectMetaAction.bind(null, organizationSlug, connection.id)}><button className="button-secondary text-danger">Disconnect</button></form>
                  </div>
                ) : null}
              </article>
            )) : <div className="empty-state p-8 text-center text-sm">No Meta identity is connected.</div>}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Publishing safety</p>
            <h2 className="section-heading mt-3 text-xl">Paused by design</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">Campaigns, ad sets, and ads created by this milestone are PAUSED. Avora cannot activate delivery or change budgets.</p>
          </section>
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Assets</p>
            <h2 className="section-heading mt-3 text-xl">Choose defaults</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">After syncing, select the owned ad account, Page, Instagram identity, and dataset for this organization.</p>
            <Link href={`/dashboard/${organizationSlug}/settings/integrations/meta/assets`} className="button-secondary mt-5">Manage connected assets</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  return <p className={`mt-6 rounded-2xl border p-4 text-sm ${tone === "success" ? "border-success/20 bg-success-muted text-success" : "border-danger/20 bg-danger-muted text-danger"}`}>{children}</p>;
}

function getConnectionFailureMessage(reason?: string) {
  if (reason === "token_encryption_failed") {
    return "Meta authorization succeeded, but Avora could not encrypt the connection securely.";
  }
  if (reason === "connection_not_saved") {
    return "Meta authorization succeeded, but Avora could not save the connection.";
  }
  if (reason === "meta_token_exchange_failed") {
    return "Meta authorization returned to Avora, but the access credential could not be validated.";
  }
  if (reason === "organization_access_changed") {
    return "Your organization access changed before the Meta connection completed.";
  }
  if (reason === "session_unavailable") {
    return "Your Avora session could not be verified when Meta redirected back.";
  }
  if (reason === "provider_authorization_failed") {
    return "Meta authorization was cancelled or denied.";
  }
  return "The Meta connection request was invalid or expired. Please reconnect.";
}
