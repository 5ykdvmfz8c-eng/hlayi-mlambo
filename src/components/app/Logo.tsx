import { cn } from "@/lib/utils";

export function Logo({ className, tone = "light", size = "md" }: { className?: string; tone?: "light" | "dark"; size?: "sm" | "md" | "lg" }) {
  const big = size === "lg" ? "text-5xl" : size === "sm" ? "text-2xl" : "text-3xl";
  const small = size === "lg" ? "text-[0.8rem] tracking-[0.28em]" : "text-[0.55rem] tracking-[0.24em]";
  return (
    <div className={cn("inline-flex flex-col items-center leading-none select-none", className)}>
      <span className={cn("font-display font-bold", big, tone === "light" ? "text-navy-foreground" : "text-navy")}>
        H<span className="text-primary">&amp;</span>M
      </span>
      <span className={cn("mt-1 font-semibold uppercase", small, tone === "light" ? "text-navy-muted" : "text-muted-foreground")}>
        Consulting &amp; Tech
      </span>
    </div>
  );
}
