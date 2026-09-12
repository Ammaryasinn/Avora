import Link from "next/link";

import { getLeads } from "@/features/whatsapp/server/queries";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string }> };

export default async function LeadsPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const leads = await getLeads(tenant.organizationId);
  return (
    <div>
      <div><p className="eyebrow">WhatsApp sales</p><h1 className="page-title">Leads</h1><p className="page-description">Real contacts created from inbound conversations, with explicit qualification and consent state.</p></div>
      <div className="mt-8 premium-panel overflow-hidden rounded-3xl">
        {leads.length ? leads.map((lead) => {
          const latestConversation = lead.conversations[0];
          const assignee = latestConversation?.currentAssignedOrganizationMember?.user;
          const assigneeName = assignee ? [assignee.firstName, assignee.lastName].filter(Boolean).join(" ") || assignee.email : null;
          return (
          <Link key={lead.id} href={`/dashboard/${organizationSlug}/leads/${lead.id}`} className="grid gap-4 border-b border-border p-5 transition last:border-b-0 hover:bg-surface-muted/45 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto] md:items-center">
            <div><p className="font-semibold">{lead.contact.displayName ?? lead.contact.phoneE164 ?? lead.contact.waId}</p><p className="mt-1 text-xs text-text-muted">{lead.contact.phoneE164 ?? lead.contact.waId}</p><p className="mt-1 text-xs text-text-muted">{lead.source.replaceAll("_", " ")} · {lead._count.conversations} conversation(s) · {lead.lastActivityAt.toLocaleString()}</p></div>
            <div><p className="text-xs uppercase tracking-wider text-text-muted">Qualification</p><p className="mt-1 text-sm">{lead.qualification?.stage ?? "UNASSESSED"}{lead.qualification?.score !== null && lead.qualification?.score !== undefined ? ` · ${lead.qualification.score}/100` : ""}</p></div>
            <div><p className="text-xs uppercase tracking-wider text-text-muted">Assignment</p><p className="mt-1 text-sm">{assigneeName ?? "Unassigned"}</p><p className="mt-1 text-xs text-text-muted">{lead.followUpState?.consentStatus ?? "UNKNOWN"} consent</p></div>
            <span className={`status-pill ${lead.status === "QUALIFIED" || lead.status === "WON" ? "status-success" : ""}`}>{lead.status}</span>
          </Link>
          );
        }) : <div className="empty-state p-12 text-center"><p className="font-semibold">No leads yet</p><p className="mt-2 text-sm text-text-secondary">A real inbound WhatsApp message will create the first contact and lead.</p></div>}
      </div>
    </div>
  );
}
