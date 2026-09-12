import Link from "next/link";
import { notFound } from "next/navigation";

import { ConsentForm, QualificationForm } from "@/features/whatsapp/components/whatsapp-forms";
import { getLeadDetail } from "@/features/whatsapp/server/queries";
import {
  FollowUpConsentStatus,
  LeadQualificationStage,
  OrganizationRole,
} from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string; leadId: string }> };

export default async function LeadDetailPage({ params }: PageProps) {
  const { organizationSlug, leadId } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const lead = await getLeadDetail(tenant.organizationId, leadId);
  if (!lead) notFound();
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const qualification = lead.qualification;
  const followUp = lead.followUpState;
  const contactName = lead.contact.displayName ?? lead.contact.phoneE164 ?? lead.contact.waId;

  return (
    <div>
      <Link href={`/dashboard/${organizationSlug}/leads`} className="back-link">← Leads</Link>
      <header className="mt-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="eyebrow">Lead record</p><h1 className="page-title">{contactName}</h1><p className="page-description">Last activity {lead.lastActivityAt.toLocaleString()}</p></div><span className={`status-pill ${lead.status === "QUALIFIED" || lead.status === "WON" ? "status-success" : ""}`}>{lead.status}</span></header>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="premium-panel rounded-3xl p-6 sm:p-8">
          <p className="eyebrow">Qualification</p><h2 className="section-heading mt-3 text-2xl">Current sales context</h2>
          {canManage ? <div className="mt-6"><QualificationForm organizationSlug={organizationSlug} leadId={lead.id} value={{ leadStatus: lead.status, stage: qualification?.stage ?? LeadQualificationStage.UNASSESSED, need: qualification?.need ?? null, budget: qualification?.budget ?? null, timeline: qualification?.timeline ?? null, decisionMaker: qualification?.decisionMaker ?? null, score: qualification?.score ?? null, notes: qualification?.notes ?? null }} /></div> : <p className="mt-4 text-sm text-text-secondary">Members have read-only access to qualification data.</p>}
        </section>
        <aside className="space-y-6">
          <section className="premium-panel rounded-3xl p-6"><p className="eyebrow">Attribution</p><h2 className="section-heading mt-3 text-xl">Known source</h2><p className="mt-3 text-sm text-text-secondary">Source: {lead.source.replaceAll("_", " ")}</p>{lead.campaign ? <p className="mt-2 text-sm text-text-secondary">Campaign: {lead.campaign.name}</p> : null}{lead.product ? <p className="mt-2 text-sm text-text-secondary">Product: {lead.product.name}</p> : null}{!lead.campaign && !lead.product ? <p className="mt-2 text-sm text-text-muted">No verified campaign or product attribution is available.</p> : null}</section>
          <section className="premium-panel rounded-3xl p-6"><p className="eyebrow">Follow-up consent</p><h2 className="section-heading mt-3 text-xl">Permission state</h2>{canManage ? <div className="mt-5"><ConsentForm organizationSlug={organizationSlug} leadId={lead.id} consentStatus={followUp?.consentStatus ?? FollowUpConsentStatus.UNKNOWN} consentSource={followUp?.consentSource ?? null} /></div> : <p className="mt-3 text-sm text-text-secondary">{followUp?.consentStatus ?? "UNKNOWN"}</p>}</section>
          <section className="premium-panel rounded-3xl p-6"><p className="eyebrow">Conversations</p><div className="mt-4 space-y-3">{lead.conversations.map((conversation) => <Link key={conversation.id} className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/35 p-3 text-sm" href={`/dashboard/${organizationSlug}/conversations/${conversation.id}`}><span>{conversation.status.replaceAll("_", " ")}</span><span className="text-text-muted">{conversation.lastMessageAt?.toLocaleString() ?? "No message"}</span></Link>)}</div></section>
        </aside>
      </div>
    </div>
  );
}
