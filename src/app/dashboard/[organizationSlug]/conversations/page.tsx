import Link from "next/link";

import { getConversations } from "@/features/whatsapp/server/queries";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string }> };

function personName(contact: { displayName: string | null; phoneE164: string | null; waId: string }) {
  return contact.displayName ?? contact.phoneE164 ?? contact.waId;
}

export default async function ConversationsPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const conversations = await getConversations(tenant.organizationId);
  return (
    <div>
      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div><p className="eyebrow">WhatsApp</p><h1 className="page-title">Conversations</h1><p className="page-description">Real inbound customer threads, qualification context, and human handoff state.</p></div>
        <Link className="button-secondary" href={`/dashboard/${organizationSlug}/settings/integrations/whatsapp`}>Integration settings</Link>
      </header>
      <div className="mt-8 premium-panel overflow-hidden rounded-3xl">
        {conversations.length ? conversations.map((conversation) => {
          const latest = conversation.messages[0];
          const assignee = conversation.currentAssignedOrganizationMember?.user;
          const assigneeName = assignee ? [assignee.firstName, assignee.lastName].filter(Boolean).join(" ") || assignee.email : null;
          return (
            <Link key={conversation.id} href={`/dashboard/${organizationSlug}/conversations/${conversation.id}`} className="flex flex-col gap-4 border-b border-border p-5 transition last:border-b-0 hover:bg-surface-muted/45 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{personName(conversation.contact)}</p>{conversation.unreadCount ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">{conversation.unreadCount}</span> : null}</div>
                <p className="mt-1 text-xs text-text-muted">{conversation.contact.phoneE164 ?? conversation.contact.waId}</p>
                <p className="mt-2 truncate text-sm text-text-secondary">{latest?.textBody ?? (latest ? latest.contentType.replaceAll("_", " ").toLowerCase() : "No messages")}</p>
                <p className="mt-2 text-xs text-text-muted">{conversation.lastMessageAt?.toLocaleString() ?? "Awaiting first message"}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {assigneeName ? <span className="status-pill">Assigned to {assigneeName}</span> : null}
                {conversation.lead ? <span className="status-pill">Lead {conversation.lead.status.replaceAll("_", " ")}</span> : null}
                <span className={`status-pill ${conversation.status === "HANDOFF" ? "status-warning" : conversation.status === "OPEN" ? "status-success" : ""}`}>{conversation.status.replaceAll("_", " ")}</span>
              </div>
            </Link>
          );
        }) : <div className="empty-state p-12 text-center"><p className="font-semibold">No conversations yet</p><p className="mt-2 text-sm text-text-secondary">Verified inbound WhatsApp messages will appear here. Avora does not create sample customer data.</p></div>}
      </div>
    </div>
  );
}
