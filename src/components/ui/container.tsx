import type { ComponentProps } from "react";

type ContainerProps = ComponentProps<"div">;

export function Container({ className = "", ...props }: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10 ${className}`}
      {...props}
    />
  );
}
