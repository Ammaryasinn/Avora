import {
  disconnectWhatsAppAction,
} from "@/features/whatsapp/server/actions";
import { WhatsAppConnectionForm } from "@/features/whatsapp/components/whatsapp-forms";
import { getWhatsAppIntegrationOverview } from "@/features/whatsapp/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";
import { getWhatsAppCallbackUrl } from "@/lib/whatsapp/config";

type PageProps = { params: Promise<{ organizationSlug: string }> };

export default async function WhatsAppIntegrationPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const overview = await getWhatsAppIntegrationOverview(tenant.organizationId);
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const callbackUrl = getWhatsAppCallbackUrl();

  return (
    <div>
      <p className="eyebrow">Settings · Integrations</p>
      <h1 className="page-title">WhatsApp</h1>
      <p className="page-description">Receive real customer messages into a tenant-scoped inbox. Outbound delivery and automation remain disabled.</p>

      {!overview.availability.configured ? (
        <section className="mt-8 rounded-3xl border border-warning/25 bg-warning-muted p-6">
          <p className="font-semibold text-warning">Server configuration required</p>
          <p className="mt-2 text-sm text-text-secondary">Configure these server variables; Avora never displays their values:</p>
          <p className="mt-3 font-mono text-xs leading-6 text-text-secondary">{overview.availability.missing.join(" · ")}</p>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="premium-panel rounded-3xl p-6 sm:p-8">
          <p className="eyebrow">Connected numbers</p>
          <h2 className="section-heading mt-3 text-2xl">WhatsApp identities</h2>
          <div className="mt-6 space-y-4">
            {overview.connections.length ? overview.connections.map((connection) => (
              <article key={connection.id} className="rounded-2xl border border-border bg-surface-muted/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{connection.verifiedName ?? "WhatsApp business number"}</p>
                    <p className="mt-1 text-sm text-text-secondary">{connection.displayPhoneNumber ?? `Phone ID ${connection.phoneNumberId}`}</p>
                  </div>
                  <span className={`status-pill ${connection.status === "CONNECTED" ? "status-success" : connection.status === "DEGRADED" ? "status-warning" : "status-error"}`}>{connection.status}</span>
                </div>
                <p className="mt-4 text-xs leading-5 text-text-muted">WABA {connection.wabaId} · {connection._count.conversations} conversations · {connection._count.webhookEvents} events</p>
                <p className="mt-2 text-xs text-text-muted">Connection tested: {connection.lastValidatedAt?.toLocaleString() ?? "Not tested"}</p>
                <p className="mt-2 text-xs text-text-muted">WABA webhook subscription: {connection.webhookSubscribedAt?.toLocaleString() ?? "Not confirmed"}</p>
                <p className="mt-2 text-xs text-text-muted">Last webhook: {connection.lastWebhookAt?.toLocaleString() ?? "Not received yet"}</p>
                {connection.lastErrorMessage ? <p className="mt-3 text-sm text-danger">{connection.lastErrorMessage}</p> : null}
                {canManage && connection.status !== "DISCONNECTED" ? (
                  <div className="mt-4 space-y-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-primary">Reconnect or replace credentials</summary>
                      <div className="mt-4">
                        <WhatsAppConnectionForm
                          organizationSlug={organizationSlug}
                          connection={{ id: connection.id, wabaId: connection.wabaId, phoneNumberId: connection.phoneNumberId }}
                        />
                      </div>
                    </details>
                    <form action={disconnectWhatsAppAction.bind(null, organizationSlug, connection.id)}>
                      <button className="button-secondary text-danger">Disconnect in Avora</button>
                    </form>
                  </div>
                ) : null}
              </article>
            )) : <div className="empty-state p-8 text-center text-sm">No WhatsApp business number is connected.</div>}
          </div>
        </section>

        <div className="space-y-6">
          {canManage && overview.availability.configured ? <WhatsAppConnectionForm organizationSlug={organizationSlug} /> : (
            <section className="premium-panel rounded-3xl p-6"><p className="font-semibold">Read-only access</p><p className="mt-2 text-sm text-text-secondary">Only organization owners and admins can configure WhatsApp.</p></section>
          )}
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Meta webhook</p>
            <h2 className="section-heading mt-3 text-xl">Callback configuration</h2>
            <p className="mt-3 break-all rounded-xl border border-border bg-surface-muted/45 p-3 font-mono text-xs text-text-secondary">{callbackUrl ?? "Set a valid APP_URL to generate the callback URL."}</p>
            <p className="mt-3 text-sm leading-6 text-text-secondary">Subscribe the WABA to the <span className="font-medium text-foreground">messages</span> field. Raw verified deliveries remain private in R2 and expire automatically.</p>
          </section>
          <section className="rounded-3xl border border-border bg-surface-muted/45 p-6">
            <p className="font-semibold">Outbound safety</p>
            <p className="mt-2 text-sm font-medium leading-6 text-warning">Draft only — outbound WhatsApp sending is disabled.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
