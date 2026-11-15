import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell, Calculator, ChevronDown, FileText, Gauge, HandCoins, LayoutDashboard, LogOut, Menu, Receipt,
  Search, Settings, ShieldCheck, Users, Wallet, BarChart3, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { useNotifications } from "@/hooks/use-notifications";
import { ROLE_LABELS, type Capability } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoanStatusBadge } from "./kit";

type NavItem = { to: string; label: string; icon: typeof Users; cap?: Capability; badge?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/credit-assessment", label: "Credit Assessment", icon: Gauge, cap: "credit.view" },
  { to: "/loans", label: "Loans", icon: HandCoins },
  { to: "/repayments", label: "Repayments", icon: Wallet },
  { to: "/statements", label: "Statements", icon: FileText },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/notifications", label: "Notifications", icon: Bell, badge: true },
  { to: "/credit-allowance", label: "Credit Allowance", icon: Calculator },
  { to: "/staff", label: "Staff Management", icon: ShieldCheck, cap: "staff.manage" },
  { to: "/settings", label: "Settings", icon: Settings },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await supabase.rpc("log_event", { _action: "logout", _entity_type: "session", _entity_id: "", _summary: "Signed out" });
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

function SidebarNav({ onNavigate, unread }: { onNavigate?: () => void; unread: number }) {
  const { can } = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signOut = useSignOut();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-center px-6 py-7">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.filter((n) => !n.cap || can(n.cap)).map((n) => {
          const active = pathname === n.to || pathname.startsWith(n.to + "/");
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-elevated" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <n.icon className="size-[1.1rem]" />
              <span className="flex-1">{n.label}</span>
              {n.badge && unread > 0 && (
                <span className="rounded-full bg-destructive px-1.5 text-[0.65rem] font-bold text-destructive-foreground">{unread > 99 ? "99+" : unread}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <LogOut className="size-[1.1rem]" /> Logout
        </button>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const q = term.trim();
  const results = useQuery({
    queryKey: ["global-search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const safe = q.replace(/[%,()]/g, " ");
      const [customers, loans] = await Promise.all([
        supabase
          .from("customers")
          .select("id, first_name, last_name, account_number, phone")
          .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,account_number.ilike.%${safe}%,phone.ilike.%${safe}%`)
          .limit(6),
        supabase.from("loan_summary").select("id, loan_reference, first_name, last_name, status").ilike("loan_reference", `%${safe}%`).limit(5),
      ]);
      return { customers: customers.data ?? [], loans: loans.data ?? [] };
    },
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (fn: () => void) => {
    fn();
    setOpen(false);
    setTerm("");
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers, loans, reference numbers…"
        className="h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {open && q.length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border bg-popover shadow-elevated">
          {results.isLoading && <p className="p-4 text-sm text-muted-foreground">Searching…</p>}
          {results.data && results.data.customers.length + results.data.loans.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No matches for “{q}”.</p>
          )}
          {!!results.data?.customers.length && (
            <div className="p-2">
              <p className="px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Customers</p>
              {results.data.customers.map((c) => (
                <button key={c.id} onClick={() => go(() => navigate({ to: "/customers/$customerId", params: { customerId: c.id } }))} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-accent">
                  <span className="font-medium">{c.first_name} {c.last_name}</span>
                  <span className="text-xs text-muted-foreground">{c.account_number}</span>
                </button>
              ))}
            </div>
          )}
          {!!results.data?.loans.length && (
            <div className="border-t p-2">
              <p className="px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Loans</p>
              {results.data.loans.map((l) => (
                <button key={l.id!} onClick={() => go(() => navigate({ to: "/loans/$loanId", params: { loanId: l.id! } }))} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent">
                  <span className="font-medium">{l.loan_reference} <span className="font-normal text-muted-foreground">· {l.first_name} {l.last_name}</span></span>
                  <LoanStatusBadge status={l.status!} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, isLoading } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unread } = useNotifications(me?.id);
  const signOut = useSignOut();
  const qc = useQueryClient();

  useEffect(() => {
    if (!me?.role || !me.is_active) return;
    supabase.rpc("refresh_loan_statuses").then(({ data }) => {
      if (data && data > 0) qc.invalidateQueries();
    });
  }, [me?.id, me?.role, me?.is_active, qc]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading portal…</div>;
  }

  if (!me || !me.role || !me.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex w-fit rounded-xl bg-brand-gradient px-6 py-4"><Logo size="sm" /></div>
          <h1 className="text-lg font-semibold text-navy">Account not active</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your sign-in works, but this account has not been given a staff role or has been deactivated. Please contact an administrator.
          </p>
          <Button className="mt-6" variant="outline" onClick={signOut}><LogOut /> Sign out</Button>
        </div>
      </div>
    );
  }

  const today = new Intl.DateTimeFormat("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date());

  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarNav unread={unread} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-0 p-0 [&>button]:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Close menu"><X className="size-5" /></button>
          <SidebarNav unread={unread} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-accent lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="hidden flex-1 sm:block"><GlobalSearch /></div>
          <div className="flex-1 sm:hidden" />
          <span className="hidden text-sm text-muted-foreground md:block">{today}</span>
          <Link to="/notifications" className="relative rounded-xl p-2 hover:bg-accent" aria-label="Notifications">
            <Bell className="size-5 text-navy" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[0.6rem] font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-accent">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary-gradient text-sm font-semibold text-primary-foreground">{initials(me.full_name)}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-semibold text-navy">{me.full_name}</span>
                <span className="block text-xs text-muted-foreground">{ROLE_LABELS[me.role]}</span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block">{me.full_name}</span>
                <span className="block text-xs font-normal text-muted-foreground">{me.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/settings"><Settings /> Profile & settings</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/credit-allowance"><Receipt /> My credit allowance</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive"><LogOut /> Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="no-print border-b bg-card px-4 py-2 sm:hidden"><GlobalSearch /></div>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
