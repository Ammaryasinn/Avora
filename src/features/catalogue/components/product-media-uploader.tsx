"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ProductMediaUploaderProps = {
  organizationSlug: string;
  productId: string;
  media: { id: string; altText: string | null }[];
};

export function ProductMediaUploader({ organizationSlug, productId, media }: ProductMediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setStatus("uploading");
    setMessage("Preparing secure upload…");

    try {
      const intentResponse = await fetch("/api/storage/product-media/upload-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationSlug,
          productId,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      const intent = await intentResponse.json();

      if (!intentResponse.ok) throw new Error(intent.error ?? "Upload could not be started.");
      setMessage("Uploading privately to Avora storage…");
      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.headers,
        body: file,
      });

      if (!uploadResponse.ok) throw new Error("The private storage upload failed.");
      setMessage("Verifying image…");
      const completeResponse = await fetch("/api/storage/product-media/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationSlug, mediaId: intent.mediaId }),
      });
      const completed = await completeResponse.json();

      if (!completeResponse.ok) throw new Error(completed.error ?? "Image verification failed.");
      setStatus("idle");
      setMessage("Product image ready.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  return (
    <section className="premium-panel mt-6 rounded-3xl p-5 sm:p-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <p className="eyebrow">Product media</p>
          <h2 className="section-heading mt-3 text-2xl">Private source images</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Upload JPEG, PNG, or WebP files up to 10 MB. Images remain private and are accessed through short-lived URLs.
          </p>
        </div>
        <label className="button-secondary cursor-pointer">
          {status === "uploading" ? "Uploading…" : "Upload image"}
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={status === "uploading"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>

      {message ? (
        <p className={`mt-5 text-sm ${status === "error" ? "text-danger" : "text-text-secondary"}`}>{message}</p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {media.map((item) => (
          <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-surface-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/storage/product-media/${item.id}`} alt={item.altText ?? "Product image"} className="aspect-[4/3] w-full object-cover" />
          </div>
        ))}
        {media.length === 0 ? (
          <div className="empty-state p-6 text-sm sm:col-span-2 lg:col-span-3">
            No product images yet. Add one before generating image creatives.
          </div>
        ) : null}
      </div>
    </section>
  );
}
