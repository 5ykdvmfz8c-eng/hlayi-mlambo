import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPicker } from "@/components/app/CustomerPicker";
import { EmptyState, LoadingRows, PageHeader, Panel } from "@/components/app/kit";
import { Logo } from "@/components/app/Logo";
import { withRunningBalance } from "@/lib/finance";
import { buildStatementPdf, type StatementData } from "@/lib/statement-pdf";
import { fmtDate, fmtDateTime, friendlyError, money, saToday } from "@/lib/format";

type Search = { customer?: string; loan?: string; statement?: string };

export const Route = createFileRoute("/_authenticated/statements")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof s.customer === "string") out.customer = s.customer;
    if (typeof s.loan === "string") out.loan = s.loan;
    if (typeof s.statement === "string") out.statement = s.statement;
    return out;
  },
  head: () => ({ meta: [{ title: "Statements — H&M Credit Portal" }] }),
  component: StatementsPage,
});

function StatementsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [from, setFrom] = useState(format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"));
  const [to, setTo] = useState(saToday());
  const [busy, setBusy] = useState(false);
  const customerId = search.customer ?? null;
  const loanSel = search.loan ?? "all";

  const loans = useQuery({
    queryKey: ["stmt-loans", customerId],
    enabled: !!customerId,
    queryFn: async () => (await supabase.from("loans").select("id, loan_reference, status, issue_date").eq("customer_id", customerId!).order("created_at")).data ?? [],
  });
  const previous = useQuery({
    queryKey: ["statements-list", customerId],
    queryFn: async () => {
      let q = supabase.from("statements").select("*, customers(first_name, last_name, account_number), loans(loan_reference)").order("generated_at", { ascending: false }).limit(50);
      if (customerId) q = q.eq("customer_id", customerId);
      return (await q).data ?? [];
    },
  });

  async function generate() {
    if (!customerId) return toast.error("Select a customer");
    if (to < from) return toast.error("The end date must be after the start date");
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_statement", { _customer_id: customerId, _loan_id: (loanSel === "all" ? null : loanSel) as string, _start: from, _end: to });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Statement generated");
    qc.invalidateQueries({ queryKey: ["statements-list"] });
    navigate({ to: "/statements", search: { ...search, statement: data as string } });
  }

  return (
    <>
      <PageHeader title="Customer statements" subtitle="Generate, download and print customer statements" />
      <Panel className="no-print mb-6">
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto] md:items-end">
          <div className="space-y-1.5"><Label>Customer *</Label><CustomerPicker value={customerId} onChange={(c) => navigate({ to: "/statements", search: c ? { customer: c.id } : {} })} /></div>
          <div className="space-y-1.5">
            <Label>Loan</Label>
            <Select value={loanSel} onValueChange={(v) => navigate({ to: "/statements", search: { customer: customerId ?? undefined, loan: v === "all" ? undefined : v } })} disabled={!customerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All loans</SelectItem>{(loans.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.loan_reference}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button onClick={generate} disabled={busy || !customerId}>{busy ? <Loader2 className="animate-spin" /> : <FileText />} Generate statement</Button>
        </div>
      </Panel>

      {search.statement && <StatementView id={search.statement} />}

      <Panel title={customerId ? "Previous statements for this customer" : "Recently generated statements"} className="no-print mt-6" bodyClassName="p-0">
        {previous.isLoading ? <LoadingRows rows={3} /> : !previous.data?.length ? <EmptyState icon={FileText} title="No statements yet" text="Select a customer and date range, then generate a statement." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Statement</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Loan</th><th className="px-5 py-3">Period</th><th className="px-5 py-3 text-right">Closing</th><th className="px-5 py-3">Generated</th><th></th></tr></thead>
            <tbody>{previous.data.map((s) => {
              const c = s.customers as { first_name: string; last_name: string; account_number: string } | null;
              return (
                <tr key={s.id} className={`border-t ${s.id === search.statement ? "bg-primary-soft/50" : ""}`}>
                  <td className="px-5 py-3 tabular">{s.statement_number}</td>
                  <td className="px-5 py-3">{c?.first_name} {c?.last_name}</td>
                  <td className="px-5 py-3">{(s.loans as { loan_reference: string } | null)?.loan_reference ?? "All loans"}</td>
                  <td className="px-5 py-3">{fmtDate(s.period_start)} – {fmtDate(s.period_end)}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular">{money(s.closing_balance)}</td>
                  <td className="px-5 py-3">{fmtDateTime(s.generated_at)}</td>
                  <td className="px-5 py-3"><Link to="/statements" search={{ customer: s.customer_id, statement: s.id }} className="text-xs font-semibold text-primary">View</Link></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}

function StatementView({ id }: { id: string }) {
  const [downloading, setDownloading] = useState(false);
  const q = useQuery({
    queryKey: ["statement", id],
    queryFn: async (): Promise<StatementData | null> => {
      const { data: s } = await supabase.from("statements").select("*").eq("id", id).maybeSingle();
      if (!s) return null;
      const [{ data: c }, loansRes, txRes, { data: by }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", s.customer_id).single(),
        s.loan_id ? supabase.from("loans").select("*").eq("id", s.loan_id) : supabase.from("loans").select("*").eq("customer_id", s.customer_id).not("status", "in", "(pending,approved,cancelled)").order("issue_date"),
        (() => {
          let t = supabase.from("loan_transactions").select("*").eq("customer_id", s.customer_id).gte("txn_date", s.period_start).lte("txn_date", s.period_end);
          if (s.loan_id) t = t.eq("loan_id", s.loan_id);
          return t;
        })(),
        supabase.from("profiles").select("full_name").eq("id", s.generated_by).maybeSingle(),
      ]);
      const rows = withRunningBalance((txRes.data ?? []).map((t) => ({ ...t, debit: Number(t.debit), credit: Number(t.credit) })), Number(s.opening_balance));
      return {
        statement_number: s.statement_number,
        generated_at: s.generated_at,
        period_start: s.period_start,
        period_end: s.period_end,
        opening_balance: Number(s.opening_balance),
        closing_balance: Number(s.closing_balance),
        total_debits: Number(s.total_debits),
        total_credits: Number(s.total_credits),
        customer: { name: `${c!.first_name} ${c!.last_name}`, account_number: c!.account_number, phone: c!.phone, email: c!.email, address: c!.address },
        loans: (loansRes.data ?? []).map((l) => ({ loan_reference: l.loan_reference, principal: Number(l.principal), interest_amount: Number(l.interest_amount), fees: Number(l.fees), total_repayable: Number(l.total_repayable), amount_paid: Number(l.amount_paid), outstanding_balance: Number(l.outstanding_balance), issue_date: l.issue_date, status: l.status })),
        rows,
        generatedBy: by?.full_name ?? "staff member",
      };
    },
  });

  if (q.isLoading) return <LoadingRows rows={6} />;
  const d = q.data;
  if (!d) return null;
  const reconciled = Math.abs((d.rows.at(-1)?.balance ?? d.opening_balance) - d.closing_balance) < 0.01;

  async function download() {
    setDownloading(true);
    try {
      const doc = await buildStatementPdf(d!);
      doc.save(`${d!.customer.account_number}-${d!.statement_number}.pdf`);
      await supabase.rpc("log_event", { _action: "download", _entity_type: "statement", _entity_id: id, _summary: `Downloaded statement ${d!.statement_number}` });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card shadow-card print:border-0 print:shadow-none">
      <div className="no-print flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <span className="text-sm font-semibold text-navy">Statement preview</span>
        <span className={`text-xs ${reconciled ? "text-success" : "text-destructive"}`}>{reconciled ? "✓ Reconciled with recorded transactions" : "Balance mismatch — contact an administrator"}</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={download} disabled={downloading}>{downloading ? <Loader2 className="animate-spin" /> : <Download />} Download PDF</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
        </div>
      </div>
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 rounded-xl bg-brand-gradient p-6 sm:flex-row sm:items-center sm:justify-between print:rounded-none">
          <Logo />
          <div className="text-left text-navy-foreground sm:text-right">
            <p className="font-display text-xl font-semibold">Customer Statement</p>
            <p className="text-xs text-navy-muted">{d.statement_number}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
          <dl className="space-y-1.5">
            <Row k="Customer" v={d.customer.name} /><Row k="Account no." v={d.customer.account_number} /><Row k="Contact" v={d.customer.phone} /><Row k="Address" v={d.customer.address ?? "—"} />
          </dl>
          <dl className="space-y-1.5">
            <Row k="Statement date" v={fmtDate(d.generated_at)} /><Row k="Period" v={`${fmtDate(d.period_start)} – ${fmtDate(d.period_end)}`} />
            <Row k="Opening balance" v={money(d.opening_balance)} /><Row k="Outstanding balance" v={<b className="text-navy">{money(d.closing_balance)}</b>} />
          </dl>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Loan ref</th><th className="px-3 py-2 text-right">Borrowed</th><th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2 text-right">Fees</th><th className="px-3 py-2 text-right">Total repayable</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Outstanding</th></tr></thead>
            <tbody>{d.loans.map((l) => (
              <tr key={l.loan_reference} className="border-t"><td className="px-3 py-2">{l.loan_reference}</td><td className="px-3 py-2 text-right tabular">{money(l.principal)}</td><td className="px-3 py-2 text-right tabular">{money(l.interest_amount)}</td><td className="px-3 py-2 text-right tabular">{money(l.fees)}</td><td className="px-3 py-2 text-right tabular">{money(l.total_repayable)}</td><td className="px-3 py-2 text-right tabular">{money(l.amount_paid)}</td><td className="px-3 py-2 text-right font-semibold tabular">{money(l.outstanding_balance)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <h3 className="mt-6 text-sm font-semibold text-navy">Transactions</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-left text-xs text-navy-foreground"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
            <tbody>
              <tr className="border-t"><td className="px-3 py-2">{fmtDate(d.period_start)}</td><td className="px-3 py-2 text-muted-foreground">Opening balance</td><td /><td /><td className="px-3 py-2 text-right tabular">{money(d.opening_balance)}</td></tr>
              {d.rows.map((r, i) => (
                <tr key={i} className="border-t"><td className="px-3 py-2">{fmtDate(r.txn_date)}</td><td className="px-3 py-2">{r.description}</td><td className="px-3 py-2 text-right tabular">{r.debit ? money(r.debit) : "-"}</td><td className="px-3 py-2 text-right tabular text-success">{r.credit ? money(r.credit) : "-"}</td><td className="px-3 py-2 text-right font-semibold tabular">{money(r.balance)}</td></tr>
              ))}
              {!d.rows.length && <tr className="border-t"><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No transactions in this period.</td></tr>}
            </tbody>
            <tfoot className="bg-secondary font-semibold"><tr><td /><td className="px-3 py-2">Totals / closing balance</td><td className="px-3 py-2 text-right tabular">{money(d.total_debits)}</td><td className="px-3 py-2 text-right tabular">{money(d.total_credits)}</td><td className="px-3 py-2 text-right tabular">{money(d.closing_balance)}</td></tr></tfoot>
          </table>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Generated {fmtDateTime(d.generated_at)} by {d.generatedBy}. Confidential — contains personal information protected under POPIA.</p>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
}
