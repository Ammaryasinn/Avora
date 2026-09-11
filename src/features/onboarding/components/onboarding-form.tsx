"use client";

import { useActionState } from "react";

import { ArrowRightIcon } from "@/components/ui/icons";
import { initialActionState } from "@/lib/forms/action-state";

import { createOrganizationAction } from "../server/actions";

const inputClassName =
  "mt-2.5 w-full rounded-xl border border-border-strong bg-surface-raised px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-text-muted hover:border-primary/55 focus:border-primary focus:ring-4 focus:ring-primary/10";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createOrganizationAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Organization name"
          name="organizationName"
          placeholder="Acme Group"
          error={state.fieldErrors?.organizationName?.at(0)}
        />
        <Field
          label="Business name"
          name="businessName"
          placeholder="Acme Store"
          error={state.fieldErrors?.businessName?.at(0)}
        />
      </div>

      <Field
        label="Industry"
        name="industry"
        placeholder="Retail, hospitality, professional services..."
        error={state.fieldErrors?.industry?.at(0)}
        required={false}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Country code"
          name="countryCode"
          placeholder="KE"
          maxLength={2}
          error={state.fieldErrors?.countryCode?.at(0)}
          hint="Two-letter ISO code"
        />
        <Field
          label="Currency"
          name="currencyCode"
          placeholder="KES"
          maxLength={3}
          error={state.fieldErrors?.currencyCode?.at(0)}
          hint="Three-letter ISO code"
        />
      </div>

      {state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="button-primary group w-full gap-2 px-5 py-3.5"
      >
        {pending ? "Creating your workspace..." : "Create workspace"}
        {!pending ? (
          <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
        ) : null}
      </button>
    </form>
  );
}

type FieldProps = {
  label: string;
  name: string;
  placeholder: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  required?: boolean;
};

function Field({
  label,
  name,
  placeholder,
  error,
  hint,
  maxLength,
  required = true,
}: FieldProps) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      <input
        className={inputClassName}
        name={name}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${name}-description` : undefined}
      />
      {error ? (
        <span
          id={`${name}-description`}
          className="mt-2 block text-xs text-danger"
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={`${name}-description`}
          className="mt-2 block text-xs text-text-muted"
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}
