type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-border-strong bg-[linear-gradient(145deg,var(--primary-muted),#d9c2a7)] shadow-[0_12px_28px_rgba(119,84,56,0.14)] ${className}`}
    >
      <span className="absolute inset-[1px] rounded-[12px] border border-white/25" />
      <span className="relative flex h-5 items-end gap-[3px]">
        <span className="h-2.5 w-[3px] rounded-full bg-foreground/85" />
        <span className="h-5 w-[3px] rounded-full bg-foreground/85" />
        <span className="h-3.5 w-[3px] rounded-full bg-foreground/85" />
      </span>
    </span>
  );
}
