import { AvoraMonogram } from "@/components/ui/avora-logo";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-border-strong bg-[linear-gradient(145deg,var(--surface),var(--primary-muted))] shadow-[0_12px_28px_rgba(119,84,56,0.14)] ${className}`}
    >
      <span className="absolute inset-[1px] rounded-[11px] border border-white/45" />
      <AvoraMonogram className="relative h-6 w-auto text-foreground" />
    </span>
  );
}
