"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function CampaignAssetUploader({
  organizationSlug,
  campaignId,
}: {
  organizationSlug: string;
  campaignId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function upload(file: File) {
    setPending(true);
    setFailed(false);
    setMessage("Preparing a private upload…");

    try {
      const intentResponse = await fetch(
        "/api/storage/campaign-assets/upload-intent",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationSlug,
            campaignId,
            fileName: file.name,
            contentType: file.type,
            fileSize: file.size,
          }),
        },
      );
      const intent = await intentResponse.json();
      if (!intentResponse.ok) {
        throw new Error(intent.error ?? "Upload could not be started.");
      }

      setMessage("Uploading privately to Avora storage…");
      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("The private upload failed.");

      setMessage("Verifying the campaign image…");
      const completeResponse = await fetch(
        "/api/storage/campaign-assets/complete",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationSlug,
            campaignId,
            campaignCreativeId: intent.campaignCreativeId,
          }),
        },
      );
      const complete = await completeResponse.json();
      if (!completeResponse.ok) {
        throw new Error(complete.error ?? "Image verification failed.");
      }

      setMessage("Manual campaign asset ready.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-muted/45 p-5">
      <p className="font-semibold">Manual campaign asset</p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Upload a real JPEG, PNG, or WebP image up to 10 MB. It remains private
        in Avora storage and is not published anywhere.
      </p>
      <label className="button-secondary mt-4 cursor-pointer">
        {pending ? "Uploading…" : "Upload image"}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      {message ? (
        <p className={`mt-3 text-xs ${failed ? "text-danger" : "text-text-secondary"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
