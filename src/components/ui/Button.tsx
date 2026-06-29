import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "quiet";
  size?: "sm" | "md" | "icon";
  icon?: LucideIcon;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const variants = {
    primary: "border-accent bg-accent text-white hover:bg-[#0066CC]",
    ghost: "border-border bg-transparent text-text hover:border-accent/30 hover:bg-white",
    quiet: "border-transparent bg-transparent text-text-secondary hover:bg-[#F0F0F2] hover:text-text",
  };
  const sizes = {
    sm: "h-8 gap-1.5 rounded-[10px] px-3 text-[13px]",
    md: "h-10 gap-2 rounded-[10px] px-4 text-[14px]",
    icon: "h-9 w-9 rounded-[10px] p-0",
  };

  return (
    <button
      type={type}
      className={[
        "inline-flex shrink-0 items-center justify-center border font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
