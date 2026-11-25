import { cn, getInitialsColor, initials } from "@/lib/utils";

export function PartyAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[9px]",
    md: "h-10 w-10 text-[10px]",
    lg: "h-12 w-12 text-xs",
    xl: "h-16 w-16 text-base",
  };
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-display font-extrabold tracking-tight",
        sizes[size],
        getInitialsColor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
