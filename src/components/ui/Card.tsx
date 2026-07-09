import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className = "", interactive = false, ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-card border border-border bg-surface p-5 shadow-card",
        interactive ? "cursor-pointer transition-[box-shadow,border-color] hover:border-accent/30 hover:shadow-raised motion-reduce:transition-none" : "",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
