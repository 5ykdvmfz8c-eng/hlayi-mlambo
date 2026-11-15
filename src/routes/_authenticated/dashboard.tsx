import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertTriangle, ArrowRight, CalendarClock, Gauge, HandCoins, TrendingUp, Users, Wallet } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { money, moneyShort, fmtDate, saToday } from "@/lib/format";
import { EmptyState, LoadingRows, Panel, PageHeader, StatCard, Pill } from "@/components/app/kit";
import { riskLabel } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — H&M Credit Portal" }] }),
  component: Dashboard,
});

type Stats = {
  total_customers: number; customers_this_month: number; loans_issued_count: number; loans_issued_amount: number;
  outstanding_balance: number; repayments_total: number; overdue_count: number; overdue_arrears: number; overdue_outstanding: number;
  awaiting_assessment: number; pending_assessments: number; pending_loans: number; today_loans_amount: number;
  today_repayments_amount: number; today_repayments_count: number; month_loans_amount: number; month_repayments_amount: number;
  monthly_series: { month: string; issued: number; repaid: number }[];
  status_distribution: Record<string, number>; risk_distribution: Record<string, number>;
};

const STATUS_COLORS: Record<string, string> = {
  active: "var(--color-success)", partially_paid: "var(--color-primary)", fully_paid: "var(--color-navy)",
  overdue: "var(--color-destructive)", pending: "var(--color-warning)", approved: "var(--color-chart-5)", cancelled: "var(--color-muted-foreground)",
};
const RISK_COLORS: Record<string, string> = {
  excellent: "var(--color-success)", good: "var(--color-primary)", fair: "var(--color-warning)", poor: "var(--color-chart-4)", high_risk: "var(--color-destructive)",
};
const tooltipStyle = { borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 };

function Dashboard() {
  const { me, can } = useMe();
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const loans = useQuery({
    queryKey: ["dashboard-loans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_summary")
        .select("id, loan_reference, first_name, last_name, next_due_date, next_due_amount, arrears_amount, outstanding_balance, status")
        .in("status", ["active", "partially_paid", "overdue"])
        .order("next_due_date", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
  const txns = useQuery({
    queryKey: ["dashboard-txns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_transactions")
        .select("id, txn_date, description, debit, credit, txn_type, loan_id, customers(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const s = stats.data;
  const today = saToday();
  const upcoming = (loans.data ?? []).filter((l) => l.next_due_date && l.next_due_date >= today).slice(0, 6);
  const overdue = (loans.data ?? []).filter((l) => l.status === "overdue");
  const series = (s?.monthly_series ?? []).map((m) => ({ ...m, label: format(parseISO(m.month + "-01"), "MMM") }));
  const statusData = Object.entries(s?.status_distribution ?? {}).map(([k, v]) => ({ name: k, value: v }));
  const statusTotal = statusData.reduce((a, b) => a + b.value, 0);
  const riskData = ["excellent", "good", "fair", "poor", "high_risk"].map((b) => ({ band: b, label: riskLabel(b), count: s?.risk_distribution?.[b] ?? 0 }));
  const paidVsOutstanding = [
    { name: "Repaid", value: s?.repayments_total ?? 0, color: "var(--color-success)" },
    { name: "Outstanding", value: s?.outstanding_balance ?? 0, color: "var(--color-primary)" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${me?.full_name.split(" ")[0] ?? ""}. Here's what's happening with the business today.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total customers" value={s ? s.total_customers : "…"} hint={s ? `+${s.customers_this_month} this month` : undefined} />
        <StatCard icon={HandCoins} tone="success" label="Total loans issued" value={s ? money(s.loans_issued_amount) : "…"} hint={s ? `${s.loans_issued_count} loans disbursed` : undefined} />
        <StatCard icon={TrendingUp} tone="warning" label="Outstanding balance" value={s ? money(s.outstanding_balance) : "…"} hint={s ? `${money(s.month_loans_amount)} issued this month` : undefined} />
        <StatCard icon={Wallet} tone="success" label="Repayments received" value={s ? money(s.repayments_total) : "…"} hint={s ? `${money(s.month_repayments_amount)} this month` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={AlertTriangle} tone="danger" label="Overdue payments" value={s ? money(s.overdue_arrears) : "…"} hint={s ? `${s.overdue_count} account${s.overdue_count === 1 ? "" : "s"} in arrears` : undefined} />
        <StatCard icon={Gauge} tone="navy" label="Awaiting credit assessment" value={s ? s.awaiting_assessment : "…"} hint={s ? `${s.pending_assessments} assessments in progress` : undefined} />
        <StatCard icon={CalendarClock} tone="primary" label="Today" value={s ? money(s.today_repayments_amount) : "…"} hint={s ? `${s.today_repayments_count} repayments · ${money(s.today_loans_amount)} lent` : undefined} />
        <StatCard icon={HandCoins} tone="warning" label="Loans awaiting approval" value={s ? s.pending_loans : "…"} hint="Pending or approved, not yet disbursed" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Loans issued vs repayments (12 months)" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gIssued" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRepaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={moneyShort} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="issued" name="Loans issued" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#gIssued)" />
                <Area type="monotone" dataKey="repaid" name="Repayments" stroke="var(--color-success)" strokeWidth={2.5} fill="url(#gRepaid)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Loan status">
          {statusTotal === 0 ? (
            <EmptyState icon={HandCoins} title="No loans yet" text="Loan status distribution appears once loans are recorded." />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-48 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
                      {statusData.map((d) => <Cell key={d.name} fill={STATUS_COLORS[d.name]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-muted-foreground">Total loans</span>
                  <span className="font-display text-2xl font-semibold text-navy">{statusTotal}</span>
                </div>
              </div>
              <ul className="w-full space-y-1.5 text-sm">
                {statusData.map((d) => (
                  <li key={d.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />{d.name.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}</span>
                    <span className="tabular text-muted-foreground">{Math.round((d.value / statusTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Repayment performance">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.slice(-6)} margin={{ left: -10, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={moneyShort} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="repaid" name="Repayments" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Outstanding vs repaid">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paidVsOutstanding} dataKey="value" nameKey="name" outerRadius={80} stroke="none">
                  {paidVsOutstanding.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Customer credit risk">
          {can("credit.view") ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="label" width={72} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Customers" radius={[0, 6, 6, 0]}>
                    {riskData.map((d) => <Cell key={d.band} fill={RISK_COLORS[d.band]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Credit risk information is restricted to credit staff.</p>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Recent transactions" className="xl:col-span-2" bodyClassName="p-0" action={<Link to="/reports" className="text-xs font-semibold text-primary">View reports <ArrowRight className="inline size-3" /></Link>}>
          {txns.isLoading ? <LoadingRows /> : !txns.data?.length ? (
            <EmptyState icon={Wallet} title="No transactions yet" text="Disbursements and repayments will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-5 py-2.5 font-medium">Date</th><th className="px-5 py-2.5 font-medium">Customer</th><th className="px-5 py-2.5 font-medium">Description</th><th className="px-5 py-2.5 text-right font-medium">Amount</th></tr></thead>
                <tbody>
                  {txns.data.map((t) => {
                    const c = t.customers as { first_name: string; last_name: string } | null;
                    return (
                      <tr key={t.id} className="border-t">
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtDate(t.txn_date)}</td>
                        <td className="whitespace-nowrap px-5 py-3 font-medium">{c ? `${c.first_name} ${c.last_name}` : "—"}</td>
                        <td className="px-5 py-3"><Link to="/loans/$loanId" params={{ loanId: t.loan_id }} className="hover:text-primary">{t.description}</Link></td>
                        <td className={`whitespace-nowrap px-5 py-3 text-right font-semibold tabular ${Number(t.credit) > 0 ? "text-success" : "text-navy"}`}>
                          {Number(t.credit) > 0 ? `+${money(t.credit)}` : money(t.debit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Upcoming repayments" bodyClassName="p-0" action={<Link to="/notifications" className="text-xs font-semibold text-primary">View all</Link>}>
            {loans.isLoading ? <LoadingRows rows={3} /> : !upcoming.length ? (
              <p className="p-5 text-sm text-muted-foreground">No upcoming instalments.</p>
            ) : (
              <ul>
                {upcoming.map((l) => (
                  <li key={l.id!} className="flex items-center justify-between border-t px-5 py-3 text-sm first:border-t-0">
                    <Link to="/loans/$loanId" params={{ loanId: l.id! }} className="min-w-0">
                      <p className="truncate font-medium">{l.first_name} {l.last_name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(l.next_due_date)} · {l.loan_reference}</p>
                    </Link>
                    <span className="font-semibold tabular">{money(l.next_due_amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="rounded-2xl border border-destructive/20 bg-destructive-soft p-5 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-destructive text-destructive-foreground"><AlertTriangle className="size-5" /></div>
              <div>
                <p className="text-sm font-semibold text-navy">Overdue accounts</p>
                <p className="text-xs text-destructive">{overdue.length} account{overdue.length === 1 ? "" : "s"}</p>
              </div>
              <p className="ml-auto font-display text-xl font-semibold text-destructive tabular">{money(overdue.reduce((a, l) => a + Number(l.arrears_amount ?? 0), 0))}</p>
            </div>
            {overdue.slice(0, 4).map((l) => (
              <Link key={l.id!} to="/loans/$loanId" params={{ loanId: l.id! }} className="mt-3 flex items-center justify-between rounded-xl bg-card px-3 py-2 text-sm">
                <span>{l.first_name} {l.last_name} <span className="text-xs text-muted-foreground">· {l.loan_reference}</span></span>
                <Pill tone="danger">{money(l.arrears_amount)}</Pill>
              </Link>
            ))}
            <Link to="/loans" search={{ status: "overdue" }} className="mt-3 inline-block text-xs font-semibold text-destructive">View details →</Link>
          </div>
        </div>
      </div>
    </>
  );
}
