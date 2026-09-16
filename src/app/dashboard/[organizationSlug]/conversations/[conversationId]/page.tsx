import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/features/creative-studio/components/auto-refresh";
import { parseAIDraftMetadata } from "@/features/whatsapp/ai-draft-metadata";
import {
  AIReplyGenerationForm,
  AssignmentForm,
  ConsentForm,
  DraftEditorForm,
  ManualDraftForm,
  SendDraftForm,
} from "@/features/whatsapp/components/whatsapp-forms";
import { applyAIQualificationSuggestionAction } from "@/features/whatsapp/server/ai-actions";
import {
  markConversationReadAction,
  releaseConversationAssignmentAction,
} from "@/features/whatsapp/server/actions";
import {
  getConversationDetail,
  getOrganizationAssignmentOptions,
} from "@/features/whatsapp/server/queries";
import { FollowUpConsentStatus, OrganizationRole } from "@/generated/prisma/enums";
import { getTextAIAvailability } from "@/lib/ai/config";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";
import { isWhatsAppOutboundEnabled } from "@/lib/whatsapp/config";
import {
  evaluateWhatsAppOutboundEligibility,
  resolveLatestInboundAt,
} from "@/lib/whatsapp/outbound-policy.mjs";

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
  const latestInboundAt = resolveLatestInboundAt(
    conversation.messages.filter((message) => message.direction === "INBOUND"),
  );
  const outboundEligibility = evaluateWhatsAppOutboundEligibility({
    featureEnabled: isWhatsAppOutboundEnabled(),
    role: tenant.role,
    conversationArchived: Boolean(conversation.archivedAt),
    connectionStatus: conversation.connection.status,
    connectionDisconnected: Boolean(conversation.connection.disconnectedAt),
    hasUsableToken: conversation.connection.hasUsableToken,
    contactStatus: conversation.contact.status,
    consentStatus: followUp?.consentStatus ?? FollowUpConsentStatus.UNKNOWN,
    latestInboundAt,
    now: new Date(),
  });
  const outboundState = {
    canSend: outboundEligibility.canSend,
    reason: outboundEligibility.reason,
    windowOpen: outboundEligibility.window.isOpen,
    message: outboundEligibility.message,
    closesAtLabel: outboundEligibility.window.closesAt?.toLocaleString() ?? null,
  };
  const activeAIJob = conversation.aiJobs.some((job) => ["PENDING", "QUEUED", "RUNNING", "RETRY_SCHEDULED"].includes(job.status));
  const latestAIJob = conversation.aiJobs[0];
  const aiDisabledReason = !getTextAIAvailability().available
    ? "AI text generation is currently unavailable."
    : conversation.contact.status === "BLOCKED" || conversation.contact.status === "ARCHIVED"
      ? "AI replies are unavailable for this contact."
      : followUp?.consentStatus === FollowUpConsentStatus.OPTED_OUT
        ? "This contact has opted out of WhatsApp follow-up."
        : conversation.connection.status !== "CONNECTED" || conversation.connection.disconnectedAt
          ? "The WhatsApp connection is unavailable."
          : null;

  return (
    <div>
      <AutoRefresh active={activeAIJob} />
      <Link href={`/dashboard/${organizationSlug}/conversations`} className="back-link">← Conversations</Link>
      <header className="mt-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><p className="eyebrow">WhatsApp conversation</p><h1 className="page-title">{contactName}</h1><p className="page-description">{conversation.contact.phoneE164 ?? conversation.contact.waId}</p></div>
        <div className="flex flex-wrap gap-2"><span className={`status-pill ${conversation.status === "HANDOFF" ? "status-warning" : "status-success"}`}>{conversation.status.replaceAll("_", " ")}</span>{conversation.automationSuppressedAt ? <span className="status-pill status-warning">Automation suppressed</span> : null}</div>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="premium-panel rounded-3xl p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Thread</p><h2 className="section-heading mt-2 text-xl">Message history</h2></div>{canManage && conversation.unreadCount ? <form action={markConversationReadAction.bind(null, organizationSlug, conversation.id)}><button className="button-secondary">Mark read</button></form> : null}</div>
          {canManage ? <div className="mt-6"><AIReplyGenerationForm organizationSlug={organizationSlug} conversationId={conversation.id} requestNonce={randomUUID()} active={activeAIJob} disabledReason={aiDisabledReason} /></div> : null}
          {latestAIJob?.status === "FAILED" ? <p className="mt-3 rounded-xl border border-danger/20 bg-danger-muted p-3 text-sm text-danger">{latestAIJob.errorCode === "MODERATION_BLOCKED" ? "AI generation was blocked by content safety checks." : "AI could not generate a reply. No draft was created."}</p> : null}
          <div className="mt-6 space-y-4">
            {conversation.messages.length ? conversation.messages.map((message) => {
              const aiMetadata = parseAIDraftMetadata(message.content);
              const suggestions = aiMetadata ? Object.entries(aiMetadata.qualificationSuggestions).filter((entry): entry is [string, string] => Boolean(entry[1])) : [];
              return (
                <article key={message.id} className={`max-w-[88%] rounded-2xl border p-4 ${message.direction === "INBOUND" ? "border-border bg-surface-muted/55" : aiMetadata && message.currentStatus === "DRAFT" ? "ml-auto border-ai/25 bg-ai-muted/70" : "ml-auto border-primary/20 bg-primary-muted/60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
                    <span>{message.direction === "INBOUND" ? contactName : aiMetadata && message.currentStatus === "DRAFT" ? "AI suggested reply" : message.authorType === "HUMAN" ? "Avora team" : message.authorType}</span>
                    <span>{(message.providerTimestamp ?? message.createdAt).toLocaleString()}</span>
                  </div>
                  {aiMetadata && message.currentStatus === "DRAFT" ? <p className="mt-2 text-xs font-semibold text-ai">AI-generated — review before sending · {aiMetadata.confidence.toLowerCase()} confidence</p> : null}
                  {message.currentStatus === "DRAFT" && message.textBody && canManage
                    ? <DraftEditorForm organizationSlug={organizationSlug} conversationId={conversation.id} messageId={message.id} body={message.textBody} />
                    : <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.textBody ?? `${message.contentType.replaceAll("_", " ").toLowerCase()} message${message.mediaFileName ? ` · ${message.mediaFileName}` : ""}`}</p>}
                  {aiMetadata?.productNames.length ? <div className="mt-3 flex flex-wrap gap-2">{aiMetadata.productNames.map((name) => <span key={name} className="rounded-full border border-ai/20 bg-surface/70 px-2.5 py-1 text-[11px] font-medium text-ai">{name}</span>)}</div> : null}
                  {suggestions.length && message.currentStatus === "DRAFT" ? <div className="mt-3 rounded-xl border border-ai/15 bg-surface/65 p-3"><p className="text-xs font-semibold text-ai">Suggested lead updates</p>{suggestions.map(([field, value]) => <p key={field} className="mt-1 text-xs text-text-secondary">{field}: {value}</p>)}{canManage && conversation.lead ? <form className="mt-3" action={applyAIQualificationSuggestionAction.bind(null, organizationSlug, conversation.id, message.id)}><button className="text-xs font-semibold text-ai">Apply suggestions</button></form> : null}</div> : null}
                  <span className={`mt-3 inline-flex text-[10px] font-semibold uppercase tracking-wider ${message.currentStatus === "DRAFT" || message.currentStatus === "QUEUED" ? "text-warning" : message.currentStatus === "FAILED" ? "text-danger" : message.direction === "OUTBOUND" ? "text-success" : "text-text-muted"}`}>
                    {message.direction === "INBOUND"
                      ? "INBOUND · RECEIVED"
                      : message.currentStatus === "DRAFT"
                        ? "DRAFT · NOT SENT"
                        : message.currentStatus === "QUEUED"
                          ? "SEND PENDING · DO NOT RETRY"
                          : `OUTBOUND · ${message.currentStatus}`}
                  </span>
                  {message.deliveryStatuses.length ? <p className="mt-2 text-[11px] text-text-muted">Delivery history: {message.deliveryStatuses.map((delivery) => delivery.status).join(" → ")}</p> : null}
                  {message.currentStatus === "FAILED" && message.lastErrorMessage ? <p className="mt-2 text-xs leading-5 text-danger">{message.lastErrorMessage}</p> : null}
                  {message.currentStatus === "QUEUED" && message.lastErrorCode === "SEND_OUTCOME_UNKNOWN" ? <p className="mt-2 text-xs leading-5 text-warning">Send result is unknown. Do not retry this draft.</p> : null}
                  {canManage && message.currentStatus === "DRAFT" ? <SendDraftForm organizationSlug={organizationSlug} conversationId={conversation.id} messageId={message.id} outboundState={outboundState} /> : null}
                </article>
              );
            }) : <div className="empty-state p-8 text-center text-sm">No persisted messages.</div>}
          </div>
          {canManage ? <div className="mt-6"><ManualDraftForm organizationSlug={organizationSlug} conversationId={conversation.id} outboundState={outboundState} /></div> : <p className="mt-6 rounded-2xl border border-border bg-surface-muted/40 p-4 text-sm text-text-secondary">Members can read conversations but cannot draft or send WhatsApp replies.</p>}
        </section>

        <aside className="space-y-6">
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Lead</p>
            <h2 className="section-heading mt-3 text-xl">Sales context</h2>
            {conversation.lead ? <><p className="mt-3 text-sm text-text-secondary">Source: <span className="font-medium text-foreground">{conversation.lead.source.replaceAll("_", " ")}</span></p><p className="mt-2 text-sm text-text-secondary">Status: <span className="font-medium text-foreground">{conversation.lead.status}</span></p><p className="mt-2 text-sm text-text-secondary">Qualification: {conversation.lead.qualification?.stage ?? "UNASSESSED"}{conversation.lead.qualification?.score !== null && conversation.lead.qualification?.score !== undefined ? ` · ${conversation.lead.qualification.score}/100` : ""}</p>{conversation.lead.campaign ? <p className="mt-2 text-sm text-text-secondary">Campaign: {conversation.lead.campaign.name}</p> : null}{conversation.lead.product ? <p className="mt-2 text-sm text-text-secondary">Product: {conversation.lead.product.name}</p> : null}<Link className="button-secondary mt-5" href={`/dashboard/${organizationSlug}/leads/${conversation.lead.id}`}>Open lead</Link></> : <p className="mt-3 text-sm text-text-secondary">No lead is linked.</p>}
          </section>
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Human handoff</p><h2 className="section-heading mt-3 text-xl">Assignment</h2>
            {conversation.currentAssignedOrganizationMember ? <p className="mt-3 text-sm text-text-secondary">Currently assigned to {[conversation.currentAssignedOrganizationMember.user.firstName, conversation.currentAssignedOrganizationMember.user.lastName].filter(Boolean).join(" ") || conversation.currentAssignedOrganizationMember.user.email}.</p> : <p className="mt-3 text-sm text-text-secondary">No team member is assigned.</p>}
            {conversation.assignments.length ? <div className="mt-4 space-y-2">{conversation.assignments.slice(0, 3).map((assignment) => <p key={assignment.id} className="text-xs leading-5 text-text-muted">{assignment.status}: {[assignment.assignedOrganizationMember.user.firstName, assignment.assignedOrganizationMember.user.lastName].filter(Boolean).join(" ") || assignment.assignedOrganizationMember.user.email} · {assignment.assignedAt.toLocaleString()}</p>)}</div> : null}
            {canManage ? <div className="mt-5"><AssignmentForm organizationSlug={organizationSlug} conversationId={conversation.id} members={memberOptions} defaultMemberId={conversation.currentAssignedOrganizationMemberId} />{conversation.currentAssignedOrganizationMemberId ? <form className="mt-3" action={releaseConversationAssignmentAction.bind(null, organizationSlug, conversation.id)}><button className="button-secondary">Release assignment</button></form> : null}</div> : null}
          </section>
          {conversation.lead ? <section className="premium-panel rounded-3xl p-6"><p className="eyebrow">Follow-up</p><h2 className="section-heading mt-3 text-xl">Consent state</h2><p className="mt-3 text-sm text-text-secondary">Consent: {followUp?.consentStatus ?? "UNKNOWN"}</p><p className="mt-2 text-sm text-text-secondary">Follow-up status: {followUp?.status ?? "NOT_SCHEDULED"}</p>{followUp?.nextFollowUpAt ? <p className="mt-2 text-sm text-text-secondary">Next follow-up: {followUp.nextFollowUpAt.toLocaleString()}</p> : null}{canManage ? <div className="mt-5"><ConsentForm organizationSlug={organizationSlug} leadId={conversation.lead.id} consentStatus={followUp?.consentStatus ?? FollowUpConsentStatus.UNKNOWN} consentSource={followUp?.consentSource ?? null} /></div> : null}</section> : null}
        </aside>
      </div>
    </div>
  );
}
