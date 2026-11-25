import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "amber"
  | "danger"
  | "dark";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 text-white shadow-[0_8px_20px_-10px_rgba(5,150,105,0.7)] hover:bg-emerald-700 active:bg-emerald-700",
  secondary:
    "bg-steel-600 text-white shadow-[0_8px_20px_-12px_rgba(30,64,175,0.65)] hover:bg-steel-700",
  outline:
    "border border-line bg-white text-ink hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-ink-soft hover:bg-slate-100 hover:text-ink active:bg-slate-200",
  amber:
    "bg-amber-600 text-white shadow-[0_8px_20px_-10px_rgba(217,119,6,0.65)] hover:bg-amber-700",
  danger: "bg-crimson text-white hover:bg-red-700",
  dark: "bg-ink text-white hover:bg-slate-800",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 rounded-lg px-3 text-[13px] gap-1.5",
  md: "h-11 min-h-[44px] rounded-xl px-4 text-sm gap-2",
  lg: "h-12 min-h-[48px] rounded-xl px-5 text-[15px] gap-2.5",
  icon: "h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel-600/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  ),
);
Button.displayName = "Button";
