import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AssignmentForm,
  ConsentForm,
  ManualDraftForm,
} from "@/features/whatsapp/components/whatsapp-forms";
import {
  markConversationReadAction,
  releaseConversationAssignmentAction,
} from "@/features/whatsapp/server/actions";
import {
  getConversationDetail,
  getOrganizationAssignmentOptions,
} from "@/features/whatsapp/server/queries";
import { FollowUpConsentStatus, OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string; conversationId: string }> };

export default async function ConversationPage({ params }: PageProps) {
  const { organizationSlug, conversationId } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const [conversation, members] = await Promise.all([
    getConversationDetail(tenant.organizationId, conversationId),
    getOrganizationAssignmentOptions(tenant.organizationId),
  ]);
  if (!conversation) notFound();
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const contactName = conversation.contact.displayName ?? conversation.contact.phoneE164 ?? conversation.contact.waId;
  const memberOptions = members.map((member) => ({
    id: member.id,
    role: member.role,
    label: [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || member.user.email,
  }));
  const followUp = conversation.lead?.followUpState;

  return (
    <div>
      <Link href={`/dashboard/${organizationSlug}/conversations`} className="back-link">← Conversations</Link>
      <header className="mt-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><p className="eyebrow">WhatsApp conversation</p><h1 className="page-title">{contactName}</h1><p className="page-description">{conversation.contact.phoneE164 ?? conversation.contact.waId}</p></div>
        <div className="flex flex-wrap gap-2"><span className={`status-pill ${conversation.status === "HANDOFF" ? "status-warning" : "status-success"}`}>{conversation.status.replaceAll("_", " ")}</span>{conversation.automationSuppressedAt ? <span className="status-pill status-warning">Automation suppressed</span> : null}</div>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="premium-panel rounded-3xl p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Thread</p><h2 className="section-heading mt-2 text-xl">Message history</h2></div>{canManage && conversation.unreadCount ? <form action={markConversationReadAction.bind(null, organizationSlug, conversation.id)}><button className="button-secondary">Mark read</button></form> : null}</div>
          <div className="mt-6 space-y-4">
            {conversation.messages.length ? conversation.messages.map((message) => (
              <article key={message.id} className={`max-w-[88%] rounded-2xl border p-4 ${message.direction === "INBOUND" ? "border-border bg-surface-muted/55" : "ml-auto border-primary/20 bg-primary-muted/60"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted"><span>{message.direction === "INBOUND" ? contactName : message.authorType === "HUMAN" ? "Avora team" : message.authorType}</span><span>{(message.providerTimestamp ?? message.createdAt).toLocaleString()}</span></div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.textBody ?? `${message.contentType.replaceAll("_", " ").toLowerCase()} message${message.mediaFileName ? ` · ${message.mediaFileName}` : ""}`}</p>
                <span className={`mt-3 inline-flex text-[10px] font-semibold uppercase tracking-wider ${message.currentStatus === "DRAFT" ? "text-warning" : "text-text-muted"}`}>{message.currentStatus}</span>
              </article>
            )) : <div className="empty-state p-8 text-center text-sm">No persisted messages.</div>}
          </div>
          {canManage ? <div className="mt-6"><ManualDraftForm organizationSlug={organizationSlug} conversationId={conversation.id} /></div> : <p className="mt-6 rounded-2xl border border-border bg-surface-muted/40 p-4 text-sm text-text-secondary">Members can read conversations but cannot create reply drafts in Phase 1.</p>}
        </section>

        <aside className="space-y-6">
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Lead</p>
            <h2 className="section-heading mt-3 text-xl">Sales context</h2>
            {conversation.lead ? <><p className="mt-3 text-sm text-text-secondary">Status: <span className="font-medium text-foreground">{conversation.lead.status}</span></p>{conversation.lead.campaign ? <p className="mt-2 text-sm text-text-secondary">Campaign: {conversation.lead.campaign.name}</p> : null}{conversation.lead.product ? <p className="mt-2 text-sm text-text-secondary">Product: {conversation.lead.product.name}</p> : null}<Link className="button-secondary mt-5" href={`/dashboard/${organizationSlug}/leads/${conversation.lead.id}`}>Open lead</Link></> : <p className="mt-3 text-sm text-text-secondary">No lead is linked.</p>}
          </section>
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Human handoff</p><h2 className="section-heading mt-3 text-xl">Assignment</h2>
            {conversation.currentAssignedOrganizationMember ? <p className="mt-3 text-sm text-text-secondary">Currently assigned to {[conversation.currentAssignedOrganizationMember.user.firstName, conversation.currentAssignedOrganizationMember.user.lastName].filter(Boolean).join(" ") || conversation.currentAssignedOrganizationMember.user.email}.</p> : <p className="mt-3 text-sm text-text-secondary">No team member is assigned.</p>}
            {canManage ? <div className="mt-5"><AssignmentForm organizationSlug={organizationSlug} conversationId={conversation.id} members={memberOptions} defaultMemberId={conversation.currentAssignedOrganizationMemberId} />{conversation.currentAssignedOrganizationMemberId ? <form className="mt-3" action={releaseConversationAssignmentAction.bind(null, organizationSlug, conversation.id)}><button className="button-secondary">Release assignment</button></form> : null}</div> : null}
          </section>
          {conversation.lead ? <section className="premium-panel rounded-3xl p-6"><p className="eyebrow">Follow-up</p><h2 className="section-heading mt-3 text-xl">Consent state</h2><p className="mt-3 text-sm text-text-secondary">Current: {followUp?.consentStatus ?? "UNKNOWN"}</p>{canManage ? <div className="mt-5"><ConsentForm organizationSlug={organizationSlug} leadId={conversation.lead.id} consentStatus={followUp?.consentStatus ?? FollowUpConsentStatus.UNKNOWN} consentSource={followUp?.consentSource ?? null} /></div> : null}</section> : null}
        </aside>
      </div>
    </div>
  );
}
