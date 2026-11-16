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
import { COMPANY, addressLines, statementAmount } from "@/lib/company";
import { withRunningBalance } from "@/lib/finance";
import { buildStatementPdf, footerText, type StatementData } from "@/lib/statement-pdf";
import { fmtDate, fmtDateTime, friendlyError, money, saToday } from "@/lib/format";

type Search = { customer?: string; loan?: string; statement?: string };

export const Route = createFileRoute("/_authenticated/statements")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof s["customer"] === "string") out.customer = s["customer"];
    if (typeof s["loan"] === "string") out.loan = s["loan"];
    if (typeof s["statement"] === "string") out.statement = s["statement"];
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
    if (!customerId) return void toast.error("Select a customer");
    if (to < from) return void toast.error("The end date must be after the start date");
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_statement", { _customer_id: customerId, _loan_id: (loanSel === "all" ? null : loanSel) as string, _start: from, _end: to });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
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
            <Select value={loanSel} onValueChange={(v) => navigate({ to: "/statements", search: { ...(customerId ? { customer: customerId } : {}), ...(v === "all" ? {} : { loan: v }) } })} disabled={!customerId}>
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
        id: s.id,
        scope: s.loan_id ? `Loan ${(loansRes.data ?? [])[0]?.loan_reference ?? ""}` : "All loans",
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

  const footer = footerText(d);
  const amt = statementAmount;
  const companyLines = [COMPANY.name, ...COMPANY.addressLines, ...(COMPANY.phone ? [`Tel: ${COMPANY.phone}`] : [])];
  const personal = [d.customer.name, ...addressLines(d.customer.address), d.customer.phone].filter(Boolean);

  return (
    <section>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-5 py-3 shadow-card">
        <span className="text-sm font-semibold text-navy">Statement preview</span>
        <span className={`text-xs ${reconciled ? "text-success" : "text-destructive"}`}>{reconciled ? "✓ Reconciled with recorded transactions" : "Balance mismatch — contact an administrator"}</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={download} disabled={downloading}>{downloading ? <Loader2 className="animate-spin" /> : <Download />} Download PDF</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <article className="mx-auto min-w-[720px] max-w-[860px] border bg-card p-10 text-[13px] leading-snug text-foreground shadow-card print:min-w-0 print:max-w-none print:border-0 print:p-0 print:shadow-none">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm">{COMPANY.tagline}</p>
              <h2 className="mt-2 text-2xl font-bold">Loan Account Statement</h2>
            </div>
            <Logo tone="dark" />
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-6">
            <div className="self-end font-bold">{companyLines.map((l) => <p key={l}>{l}</p>)}</div>
            <div className="w-52 border-2 border-foreground px-3 py-3 text-center">
              <p>H&amp;M Consulting &amp; Tech</p>
              <p className="mt-1 text-base">{fmtDate(d.generated_at)}</p>
              <p className="text-base">Ref: {d.statement_number}</p>
              <p className="text-base">{d.scope}</p>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold">Account Summary</p>
                <p className="text-xs">Outstanding balance</p>
                <p className="text-xs tabular">R {amt(d.closing_balance)}</p>
              </div>
              <dl className="grid grid-cols-[auto_auto] justify-end gap-x-3 font-bold">
                <dt className="text-right">From Date:</dt><dd className="tabular">{fmtDate(d.period_start)}</dd>
                <dt className="text-right">To Date:</dt><dd className="tabular">{fmtDate(d.period_end)}</dd>
                <dt className="text-right">Print Date:</dt><dd className="tabular">{fmtDate(new Date())}</dd>
              </dl>
            </div>
          </div>

          <div className="mt-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-[15px] font-bold">Personal Details</p>
              {personal.map((l, i) => <p key={i}>{l}</p>)}
            </div>
            <p className="mt-5 flex gap-6"><span>Account Number</span><span className="tabular">{d.customer.account_number}</span></p>
          </div>

          {d.loans.length > 0 && (
            <table className="mt-6 w-full text-xs">
              <thead className="text-left font-bold"><tr><th className="py-1 pr-2">Loan Reference</th><th className="py-1 pr-2">Issue Date</th><th className="py-1 text-right">Borrowed (R)</th><th className="py-1 text-right">Interest (R)</th><th className="py-1 text-right">Fees (R)</th><th className="py-1 text-right">Total Repayable (R)</th><th className="py-1 text-right">Paid (R)</th><th className="py-1 text-right">Outstanding (R)</th></tr></thead>
              <tbody>{d.loans.map((l) => (
                <tr key={l.loan_reference}><td className="py-0.5 pr-2">{l.loan_reference}</td><td className="py-0.5 pr-2 tabular">{fmtDate(l.issue_date)}</td><td className="text-right tabular">{amt(l.principal)}</td><td className="text-right tabular">{amt(l.interest_amount)}</td><td className="text-right tabular">{amt(l.fees)}</td><td className="text-right tabular">{amt(l.total_repayable)}</td><td className="text-right tabular">{amt(l.amount_paid)}</td><td className="text-right tabular">{amt(l.outstanding_balance)}</td></tr>
              ))}</tbody>
            </table>
          )}

          <table className="mt-6 w-full text-xs">
            <thead className="text-left align-bottom font-bold"><tr><th className="w-24 py-1">Posting Date</th><th className="w-24 py-1">Transaction Date</th><th className="py-1">Description</th><th className="w-28 py-1 text-right">Money In (R)</th><th className="w-28 py-1 text-right">Money Out (R)</th><th className="w-28 py-1 text-right">Balance (R)</th></tr></thead>
            <tbody className="align-top">
              <tr><td className="py-0.5 tabular">{fmtDate(d.period_start)}</td><td className="tabular">{fmtDate(d.period_start)}</td><td>Opening Balance</td><td /><td /><td className="text-right tabular">{amt(d.opening_balance)}</td></tr>
              {d.rows.map((r, i) => (
                <tr key={i}><td className="py-0.5 tabular">{fmtDate(r.created_at)}</td><td className="tabular">{fmtDate(r.txn_date)}</td><td className="pr-3">{r.description}</td><td className="text-right tabular">{r.credit ? amt(r.credit) : ""}</td><td className="text-right tabular">{r.debit ? amt(r.debit) : ""}</td><td className="text-right tabular">{amt(r.balance)}</td></tr>
              ))}
              {!d.rows.length && <tr><td colSpan={6} className="py-3 text-center text-muted-foreground">No transactions in this period.</td></tr>}
            </tbody>
            <tfoot className="border-t border-foreground font-bold"><tr><td /><td /><td className="py-1">Totals / Closing Balance</td><td className="text-right tabular">{amt(d.total_credits)}</td><td className="text-right tabular">{amt(d.total_debits)}</td><td className="text-right tabular">{amt(d.closing_balance)}</td></tr></tfoot>
          </table>

          <footer className="mt-10 text-center text-[11px]">
            <p>{footer.line1}</p>
            <p>{footer.line2}</p>
          </footer>
        </article>
      </div>
    </section>
  );
}
