import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "quiet";
  size?: "sm" | "md" | "icon";
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading = false,
  children,
  className = "",
  type = "button",
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "border-accent bg-accent text-white hover:bg-[#1D1D1F] active:bg-[#161618]",
    ghost: "border-border bg-transparent text-text hover:border-accent/30 hover:bg-white active:bg-surface-muted",
    quiet: "border-transparent bg-transparent text-text-secondary hover:bg-fill-hover hover:text-text active:bg-fill-press",
  };
  const sizes = {
    sm: "h-8 gap-1.5 rounded-control px-3 text-label",
    md: "h-10 gap-2 rounded-control px-4 text-sm",
    icon: "h-9 w-9 rounded-control p-0 active:scale-95 motion-reduce:active:scale-100",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex shrink-0 items-center justify-center border font-medium transition active:translate-y-px disabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
