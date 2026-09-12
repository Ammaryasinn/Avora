"use client";

import { useActionState } from "react";

import {
  FollowUpConsentStatus,
  LeadQualificationStage,
  LeadStatus,
} from "@/generated/prisma/enums";
import { initialActionState, type ActionState } from "@/lib/forms/action-state";

import {
  assignConversationAction,
  createManualDraftAction,
  saveWhatsAppConnectionAction,
  updateFollowUpConsentAction,
  updateLeadQualificationAction,
} from "../server/actions";

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p className={`rounded-xl border p-3 text-sm ${state.status === "error" ? "border-danger/20 bg-danger-muted text-danger" : "border-success/20 bg-success-muted text-success"}`}>
      {state.message}
    </p>
  );
}

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const message = state.fieldErrors?.[name]?.[0];
  return message ? <span className="mt-1 block text-xs text-danger">{message}</span> : null;
}

export function WhatsAppConnectionForm({
  organizationSlug,
  connection,
}: {
  organizationSlug: string;
  connection?: { id: string; wabaId: string; phoneNumberId: string };
}) {
  const [state, action, pending] = useActionState(
    saveWhatsAppConnectionAction.bind(null, organizationSlug),
    initialActionState,
  );
  return (
    <form action={action} className="premium-panel space-y-5 rounded-3xl p-6 sm:p-8">
      {connection ? <input name="connectionId" type="hidden" value={connection.id} /> : null}
      <div>
        <p className="eyebrow">Secure setup</p>
        <h2 className="section-heading mt-3 text-2xl">{connection ? "Replace connection credentials" : "Connect a business number"}</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Test performs read-only Meta lookups for the WABA and phone number. Connect subscribes the WABA and encrypts the replacement token before storage.
        </p>
      </div>
      <label className="block">
        <span className="field-label">WhatsApp Business Account ID</span>
        <input className="form-control" name="wabaId" inputMode="numeric" defaultValue={connection?.wabaId} required />
        <FieldError state={state} name="wabaId" />
      </label>
      <label className="block">
        <span className="field-label">Phone number ID</span>
        <input className="form-control" name="phoneNumberId" inputMode="numeric" defaultValue={connection?.phoneNumberId} required />
        <FieldError state={state} name="phoneNumberId" />
      </label>
      <label className="block">
        <span className="field-label">System user access token</span>
        <input className="form-control" name="accessToken" type="password" autoComplete="off" required />
        <span className="mt-2 block text-xs leading-5 text-text-muted">The token is never returned to the browser after this request.</span>
        <FieldError state={state} name="accessToken" />
      </label>
      <ActionMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <button className="button-secondary" disabled={pending} name="intent" type="submit" value="test">{pending ? "Checking…" : "Test connection"}</button>
        <button className="button-primary" disabled={pending} name="intent" type="submit" value="connect">{pending ? "Verifying…" : connection ? "Reconnect and replace token" : "Verify and connect"}</button>
      </div>
    </form>
  );
}

export function AssignmentForm({
  organizationSlug,
  conversationId,
  members,
  defaultMemberId,
}: {
  organizationSlug: string;
  conversationId: string;
  members: { id: string; label: string; role: string }[];
  defaultMemberId: string | null;
}) {
  const [state, action, pending] = useActionState(
    assignConversationAction.bind(null, organizationSlug, conversationId),
    initialActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="field-label">Assign to</span>
        <select className="form-control" name="assignedOrganizationMemberId" defaultValue={defaultMemberId ?? ""} required>
          <option value="" disabled>Select a team member</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.label} · {member.role}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Handoff reason</span>
        <textarea className="form-control min-h-20" name="reason" placeholder="Why human attention is needed" />
      </label>
      <ActionMessage state={state} />
      <button className="button-secondary" disabled={pending}>{pending ? "Assigning…" : "Handoff and assign"}</button>
    </form>
  );
}

export function QualificationForm({
  organizationSlug,
  leadId,
  value,
}: {
  organizationSlug: string;
  leadId: string;
  value: {
    leadStatus: LeadStatus;
    stage: LeadQualificationStage;
    need: string | null;
    budget: string | null;
    timeline: string | null;
    decisionMaker: string | null;
    score: number | null;
    notes: string | null;
  };
}) {
  const [state, action, pending] = useActionState(
    updateLeadQualificationAction.bind(null, organizationSlug, leadId),
    initialActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="field-label">Lead status</span><select className="form-control" name="leadStatus" defaultValue={value.leadStatus}>{Object.values(LeadStatus).map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="block"><span className="field-label">Qualification stage</span><select className="form-control" name="stage" defaultValue={value.stage}>{Object.values(LeadQualificationStage).map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="block"><span className="field-label">Need</span><input className="form-control" name="need" defaultValue={value.need ?? ""} /></label>
        <label className="block"><span className="field-label">Budget context</span><input className="form-control" name="budget" defaultValue={value.budget ?? ""} /></label>
        <label className="block"><span className="field-label">Timeline</span><input className="form-control" name="timeline" defaultValue={value.timeline ?? ""} /></label>
        <label className="block"><span className="field-label">Decision maker</span><input className="form-control" name="decisionMaker" defaultValue={value.decisionMaker ?? ""} /></label>
        <label className="block"><span className="field-label">Score</span><input className="form-control" name="score" type="number" min="0" max="100" defaultValue={value.score ?? ""} /></label>
      </div>
      <label className="block"><span className="field-label">Notes</span><textarea className="form-control min-h-24" name="notes" defaultValue={value.notes ?? ""} /></label>
      <ActionMessage state={state} />
      <button className="button-primary" disabled={pending}>{pending ? "Saving…" : "Save qualification"}</button>
    </form>
  );
}

export function ConsentForm({
  organizationSlug,
  leadId,
  consentStatus,
  consentSource,
}: {
  organizationSlug: string;
  leadId: string;
  consentStatus: FollowUpConsentStatus;
  consentSource: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateFollowUpConsentAction.bind(null, organizationSlug, leadId),
    initialActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="field-label">Follow-up consent</span>
        <select className="form-control" name="consentStatus" defaultValue={consentStatus}>
          {Object.values(FollowUpConsentStatus).map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Consent source</span>
        <input className="form-control" name="consentSource" defaultValue={consentSource ?? ""} placeholder="For example: customer explicitly agreed in chat" />
      </label>
      <p className="text-xs leading-5 text-text-muted">Opted-in status records the source. No follow-up is scheduled or sent automatically.</p>
      <ActionMessage state={state} />
      <button className="button-secondary" disabled={pending}>{pending ? "Saving…" : "Update consent"}</button>
    </form>
  );
}

export function ManualDraftForm({ organizationSlug, conversationId }: { organizationSlug: string; conversationId: string }) {
  const [state, action, pending] = useActionState(
    createManualDraftAction.bind(null, organizationSlug, conversationId),
    initialActionState,
  );
  return (
    <form action={action} className="rounded-2xl border border-border bg-surface-muted/35 p-4">
      <label className="block">
        <span className="field-label">Human reply draft</span>
        <textarea className="form-control min-h-28" name="body" placeholder="Write a response for review" />
      </label>
      <p className="mt-2 text-xs font-medium leading-5 text-warning">Draft only — outbound WhatsApp sending is disabled.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="button-primary" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
