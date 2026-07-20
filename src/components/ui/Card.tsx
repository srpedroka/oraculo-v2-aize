import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevated?: boolean;
}

export function Card({ className = "", interactive = false, elevated = false, ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-card border border-border bg-surface p-5",
        elevated ? "shadow-raised" : "",
        interactive ? "transition-[background-color,border-color,box-shadow] duration-fast hover:border-accent/30 hover:bg-surface-muted motion-reduce:transition-none" : "",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
