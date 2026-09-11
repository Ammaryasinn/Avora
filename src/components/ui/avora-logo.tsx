import type { ComponentProps } from "react";

type AvoraMonogramProps = ComponentProps<"svg">;

export function AvoraMonogram({ className = "", ...props }: AvoraMonogramProps) {
  return (
    <svg
      viewBox="0 0 48 42"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        d="M3.5 34.5 16.2 7.2l5.2 11.2-7.5 16.1H3.5Z"
        fill="currentColor"
      />
      <path
        d="m17.2 4.1 17.1 36.1 6.1-12.9-5.1-10.8-3.4 7.3L20.9.8l-3.7 3.3Z"
        fill="url(#avora-mark-gradient)"
      />
      <path
        d="M36.1 15.1h8.4l-8.2 17.3-4.2-8.9 4-8.4Z"
        fill="currentColor"
        opacity="0.88"
      />
      <defs>
        <linearGradient
          id="avora-mark-gradient"
          x1="17"
          y1="3"
          x2="34"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#B89A74" />
          <stop offset="0.58" stopColor="#D7C3A8" />
          <stop offset="1" stopColor="#A47D55" />
        </linearGradient>
      </defs>
    </svg>
  );
}

type AvoraLogoProps = ComponentProps<"span"> & {
  markClassName?: string;
  wordmarkClassName?: string;
  showMark?: boolean;
};

export function AvoraLogo({
  className = "",
  markClassName = "",
  wordmarkClassName = "",
  showMark = false,
  ...props
}: AvoraLogoProps) {
  return (
    <span
      className={`inline-flex items-center text-foreground ${className}`}
      {...props}
    >
      {showMark ? (
        <AvoraMonogram className={`mr-3 h-8 w-auto ${markClassName}`} />
      ) : null}
      <span
        className={`avora-wordmark text-[1.42rem] leading-none ${wordmarkClassName}`}
        aria-label="Avora"
      >
        ΛVORΛ
      </span>
    </span>
  );
}
