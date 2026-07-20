import { forwardRef, type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevated?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ className = "", interactive = false, elevated = false, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={[
        "rounded-card border border-border bg-surface p-5",
        elevated ? "shadow-raised" : "",
        interactive ? "transition-[background-color,border-color,box-shadow] duration-fast hover:border-accent/30 hover:bg-surface-muted motion-reduce:transition-none" : "",
        className,
      ].join(" ")}
      {...props}
    />
  );
});
