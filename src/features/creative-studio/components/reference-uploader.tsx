"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function ReferenceUploader({ organizationSlug, creativeId }: { organizationSlug: string; creativeId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    if (!consent) {
      setMessage("Confirm consent before uploading a person reference.");
      return;
    }

    setPending(true);
    setMessage("Uploading private reference…");
    try {
      const intentResponse = await fetch("/api/storage/creative-assets/upload-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationSlug, creativeId, fileName: file.name, contentType: file.type, fileSize: file.size, consentAcknowledged: true }),
      });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.error ?? "Upload could not be started.");
      const uploadResponse = await fetch(intent.uploadUrl, { method: "PUT", headers: intent.headers, body: file });
      if (!uploadResponse.ok) throw new Error("The private upload failed.");
      const completeResponse = await fetch("/api/storage/creative-assets/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationSlug, assetId: intent.assetId }),
      });
      const complete = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(complete.error ?? "Reference verification failed.");
      setMessage(`Reference ready. It expires automatically after the configured retention period.`);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ai/20 bg-ai-muted p-5">
      <p className="font-semibold text-foreground">Person reference</p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Used only for this virtual try-on and automatically deleted after the configured retention window (7 days by default).</p>
      <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-foreground">
        <input type="checkbox" className="mt-1 accent-ai" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        I confirm the depicted person consented to this upload and AI use.
      </label>
      <label className={`button-secondary mt-4 cursor-pointer ${!consent ? "opacity-50" : ""}`}>
        {pending ? "Uploading…" : "Upload person image"}
        <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={!consent || pending} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      </label>
      {message ? <p className="mt-3 text-xs text-text-secondary">{message}</p> : null}
    </div>
  );
}
