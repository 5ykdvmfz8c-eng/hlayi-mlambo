import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import { Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-navy sm:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {action}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const toneIcon = cva("flex size-11 shrink-0 items-center justify-center rounded-xl", {
  variants: {
    tone: {
      primary: "bg-primary-soft text-primary",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-destructive-soft text-destructive",
      navy: "bg-secondary text-navy",
    },
  },
  defaultVariants: { tone: "primary" },
});

export type Tone = "primary" | "success" | "warning" | "danger" | "navy";

export function StatCard({ label, value, hint, icon: Icon, tone = "primary", className }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <div className={cn("flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-card", className)}>
      <div className={toneIcon({ tone })}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 truncate font-display text-xl font-semibold text-navy tabular sm:text-2xl">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

const pill = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    tone: {
      primary: "bg-primary-soft text-primary",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning-foreground",
      danger: "bg-destructive-soft text-destructive",
      muted: "bg-muted text-muted-foreground",
      navy: "bg-navy text-navy-foreground",
    },
  },
  defaultVariants: { tone: "muted" },
});

export function Pill({ tone, children, className }: { tone?: "primary" | "success" | "warning" | "danger" | "muted" | "navy"; children: ReactNode; className?: string }) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}

const LOAN_STATUS: Record<string, { label: string; tone: "primary" | "success" | "warning" | "danger" | "muted" | "navy" }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "primary" },
  active: { label: "Active", tone: "success" },
  partially_paid: { label: "Partially Paid", tone: "warning" },
  fully_paid: { label: "Fully Paid", tone: "navy" },
  overdue: { label: "Overdue", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
};
export const LOAN_STATUS_OPTIONS = Object.entries(LOAN_STATUS).map(([value, v]) => ({ value, label: v.label }));

export function LoanStatusBadge({ status }: { status: string }) {
  const s = LOAN_STATUS[status] ?? { label: status, tone: "muted" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const RISK: Record<string, { label: string; tone: "primary" | "success" | "warning" | "danger" | "muted" }> = {
  excellent: { label: "Excellent", tone: "success" },
  good: { label: "Good", tone: "primary" },
  fair: { label: "Fair", tone: "warning" },
  poor: { label: "Poor", tone: "danger" },
  high_risk: { label: "High Risk", tone: "danger" },
};
export const riskLabel = (band: string | null | undefined) => (band ? (RISK[band]?.label ?? band) : "Not assessed");

export function RiskBadge({ band }: { band: string | null | undefined }) {
  if (!band) return <Pill tone="muted">Not assessed</Pill>;
  const r = RISK[band];
  return <Pill tone={r?.tone}>{r?.label ?? band}</Pill>;
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-5" />
      </div>
      <p className="font-semibold text-navy">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NoAccess({ what = "this section" }: { what?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-destructive-soft text-destructive">
        <Lock className="size-5" />
      </div>
      <h2 className="text-lg font-semibold text-navy">Access restricted</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your role does not have permission to view {what}. Ask an administrator if you need access.</p>
    </div>
  );
}

export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium text-foreground", mono && "tabular")}>{value ?? "—"}</span>
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = "success" }: { value: number; tone?: "success" | "primary" | "danger" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", tone === "success" ? "bg-success" : tone === "danger" ? "bg-destructive" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
