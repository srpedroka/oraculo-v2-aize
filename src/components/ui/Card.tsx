import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className = "", interactive = false, ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-border bg-surface p-5 shadow-card",
        interactive ? "transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md" : "",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
