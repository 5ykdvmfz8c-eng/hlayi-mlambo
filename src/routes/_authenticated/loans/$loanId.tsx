import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Ban, BadgeCheck, Banknote, FileText, Plus, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Field, LoadingRows, LoanStatusBadge, NoAccess, PageHeader, Panel, Pill, ProgressBar, StatCard } from "@/components/app/kit";
import { RepaymentForm } from "@/components/app/RepaymentForm";
import { buildSchedule, withRunningBalance, type Frequency } from "@/lib/finance";
import { fmtDate, fmtDateTime, friendlyError, money, saToday, titleCase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/loans/$loanId")({
  head: () => ({ meta: [{ title: "Loan details — H&M Credit Portal" }] }),
  component: LoanDetails,
});

function LoanDetails() {
  const { loanId } = Route.useParams();
  const { can } = useMe();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [action, setAction] = useState<null | "approve" | "disburse" | "cancel">(null);
  const [reverse, setReverse] = useState<null | { id: string; ref: string; amount: number }>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loan = useQuery({
    queryKey: ["loan", loanId],
    queryFn: async () => (await supabase.from("loan_summary").select("*").eq("id", loanId).maybeSingle()).data,
  });
  const repayments = useQuery({
    queryKey: ["loan-repayments", loanId],
    queryFn: async () => (await supabase.from("repayments").select("*").eq("loan_id", loanId).order("payment_date", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });
  const ledger = useQuery({
    queryKey: ["loan-ledger", loanId],
    queryFn: async () => (await supabase.from("loan_transactions").select("*").eq("loan_id", loanId)).data ?? [],
  });
  const staff = useQuery({
    queryKey: ["staff-names"],
    queryFn: async () => Object.fromEntries(((await supabase.from("profiles").select("id, full_name")).data ?? []).map((p) => [p.id, p.full_name])),
  });

  if (loan.isLoading) return <LoadingRows rows={6} />;
  const l = loan.data;
  if (!l) return <NoAccess what="this loan" />;
  const names = staff.data ?? {};
  const paidPct = Number(l.total_repayable) > 0 ? (Number(l.amount_paid) / Number(l.total_repayable)) * 100 : 0;
  const schedule = buildSchedule(l.first_payment_date!, l.repayment_frequency as Frequency, l.number_of_instalments!, Number(l.instalment_amount), Number(l.total_repayable));
  const active = ["active", "partially_paid", "overdue"].includes(l.status!);
  const today = saToday();
  let cumulative = 0;
  const ledgerRows = withRunningBalance((ledger.data ?? []).map((t) => ({ ...t, debit: Number(t.debit), credit: Number(t.credit) })));

  async function runAction() {
    if (!action) return;
    if (action === "cancel" && !reason.trim()) return void toast.error("Enter a reason");
    setBusy(true);
    const { error } = await supabase.rpc("change_loan_status", { _loan_id: loanId, _action: action, ...(reason.trim() ? { _reason: reason.trim() } : {}) });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success(action === "approve" ? "Loan approved" : action === "disburse" ? "Loan disbursed — now active" : "Loan cancelled");
    setAction(null);
    setReason("");
    qc.invalidateQueries();
  }

  async function runReverse() {
    if (!reverse) return;
    if (!reason.trim()) return void toast.error("Enter a reason for the reversal");
    setBusy(true);
    const { error } = await supabase.rpc("reverse_repayment", { _repayment_id: reverse.id, _reason: reason.trim() });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success("Payment reversed and balance recalculated");
    setReverse(null);
    setReason("");
    qc.invalidateQueries();
  }

  return (
    <>
      <Link to="/loans" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Loans</Link>
      <PageHeader
        title={`Loan ${l.loan_reference}`}
        subtitle={`${l.first_name} ${l.last_name} · ${l.account_number}`}
        actions={
          <>
            <LoanStatusBadge status={l.status!} />
            {can("loans.manage") && l.status === "pending" && <Button onClick={() => setAction("approve")}><BadgeCheck /> Approve</Button>}
            {can("loans.manage") && l.status === "approved" && <Button onClick={() => setAction("disburse")}><Banknote /> Mark as disbursed</Button>}
            {can("loans.manage") && (l.status === "pending" || l.status === "approved") && <Button variant="outline" onClick={() => setAction("cancel")}><Ban /> Cancel</Button>}
            {can("repayments.record") && active && <Button variant="success" onClick={() => setPayOpen(true)}><Plus /> Add repayment</Button>}
            <Button variant="outline" asChild><Link to="/statements" search={{ customer: l.customer_id!, loan: l.id! }}><FileText /> Generate statement</Link></Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Original loan amount" value={money(l.principal)} hint={`Issued ${fmtDate(l.issue_date)}`} />
        <StatCard icon={FileText} tone="navy" label="Total repayable" value={money(l.total_repayable)} hint={`Interest ${money(l.interest_amount)} · fees ${money(l.fees)}`} />
        <StatCard icon={Wallet} tone="success" label="Amount paid" value={money(l.amount_paid)} />
        <StatCard icon={Wallet} tone={l.status === "overdue" ? "danger" : "warning"} label="Outstanding balance" value={money(l.outstanding_balance)} hint={Number(l.arrears_amount) > 0 ? `${money(l.arrears_amount)} in arrears` : l.next_due_date ? `Next ${money(l.next_due_amount)} on ${fmtDate(l.next_due_date)}` : undefined} />
      </div>

      <Panel className="mt-6">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold text-navy">Repayment progress</span><span className="tabular text-muted-foreground">{paidPct.toFixed(1)}%</span></div>
        <ProgressBar value={paidPct} tone={l.status === "overdue" ? "danger" : "success"} />
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Loan terms">
          <div className="divide-y">
            <Field label="Interest rate" value={`${Number(l.interest_rate)}% flat`} />
            <Field label="Fees" value={money(l.fees)} mono />
            <Field label="Repayment frequency" value={titleCase(l.repayment_frequency)} />
            <Field label="Instalment amount" value={money(l.instalment_amount)} mono />
            <Field label="Loan duration" value={`${l.number_of_instalments} instalments`} />
            <Field label="First payment" value={fmtDate(l.first_payment_date)} />
            <Field label="Final payment" value={fmtDate(l.maturity_date)} />
            <Field label="Purpose" value={l.purpose} />
            <Field label="Recorded by" value={`${names[l.created_by!] ?? "—"} · ${fmtDate(l.created_at)}`} />
            {l.approved_by && <Field label="Approved by" value={`${names[l.approved_by] ?? "—"} · ${fmtDate(l.approved_at)}`} />}
            {l.disbursed_by && <Field label="Disbursed by" value={`${names[l.disbursed_by] ?? "—"} · ${fmtDate(l.disbursed_at)}`} />}
            {l.cancel_reason && <Field label="Cancelled" value={l.cancel_reason} />}
          </div>
        </Panel>

        <Panel title="Repayment schedule" className="xl:col-span-2" bodyClassName="p-0">
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">#</th><th className="px-5 py-3">Due date</th><th className="px-5 py-3 text-right">Instalment</th><th className="px-5 py-3">Status</th></tr></thead>
              <tbody>
                {schedule.map((s) => {
                  cumulative += s.amount;
                  const covered = Number(l.amount_paid) + 0.004 >= cumulative;
                  const late = !covered && s.dueDate < today && active;
                  return (
                    <tr key={s.number} className="border-t">
                      <td className="px-5 py-2.5 tabular text-muted-foreground">{s.number}</td>
                      <td className="px-5 py-2.5">{fmtDate(s.dueDate)}</td>
                      <td className="px-5 py-2.5 text-right tabular">{money(s.amount)}</td>
                      <td className="px-5 py-2.5">{!active && !["fully_paid"].includes(l.status!) ? <Pill tone="muted">Not started</Pill> : covered ? <Pill tone="success">Paid</Pill> : late ? <Pill tone="danger">Overdue</Pill> : <Pill tone="muted">Upcoming</Pill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Repayment history" className="mt-6" bodyClassName="p-0">
        {!repayments.data?.length ? <EmptyState icon={Wallet} title="No repayments yet" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Method</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Captured by</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th></tr></thead>
            <tbody>{repayments.data.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-5 py-3">{fmtDate(r.payment_date)}</td>
                <td className="px-5 py-3 tabular">{r.transaction_reference}{r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}</td>
                <td className="px-5 py-3">{titleCase(r.payment_method)}</td>
                <td className={`px-5 py-3 text-right font-semibold tabular ${r.status === "reversed" ? "text-muted-foreground line-through" : "text-success"}`}>{money(r.amount)}</td>
                <td className="px-5 py-3">{names[r.captured_by] ?? "—"}<p className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</p></td>
                <td className="px-5 py-3">{r.status === "reversed" ? <><Pill tone="danger">Reversed</Pill><p className="mt-1 max-w-[14rem] text-xs text-muted-foreground">{r.reversal_reason} — {names[r.reversed_by ?? ""] ?? ""}</p></> : <Pill tone="success">Valid</Pill>}</td>
                <td className="px-5 py-3 text-right">{can("repayments.reverse") && r.status === "valid" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setReverse({ id: r.id, ref: r.transaction_reference, amount: Number(r.amount) })}><RotateCcw /> Reverse</Button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>

      <Panel title="Ledger" className="mt-6" bodyClassName="p-0">
        {!ledgerRows.length ? <p className="p-5 text-sm text-muted-foreground">Ledger entries are created when the loan is disbursed.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Description</th><th className="px-5 py-3 text-right">Debit</th><th className="px-5 py-3 text-right">Credit</th><th className="px-5 py-3 text-right">Balance</th></tr></thead>
            <tbody>{ledgerRows.map((t) => (
              <tr key={t.id} className="border-t"><td className="px-5 py-2.5">{fmtDate(t.txn_date)}</td><td className="px-5 py-2.5">{t.description}</td><td className="px-5 py-2.5 text-right tabular">{t.debit ? money(t.debit) : "-"}</td><td className="px-5 py-2.5 text-right tabular text-success">{t.credit ? money(t.credit) : "-"}</td><td className="px-5 py-2.5 text-right font-semibold tabular">{money(t.balance)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Record repayment</DialogTitle><DialogDescription>The balance, schedule and statement update automatically once saved.</DialogDescription></DialogHeader>
          <RepaymentForm customerId={l.customer_id!} loanId={l.id!} onSaved={() => setPayOpen(false)} onCancel={() => setPayOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "approve" ? "Approve loan" : action === "disburse" ? "Confirm disbursement" : "Cancel loan"}</DialogTitle>
            <DialogDescription>
              {action === "approve" && `Approve ${money(l.principal)} for ${l.first_name} ${l.last_name}.`}
              {action === "disburse" && `Confirm the money has been paid out. This posts ${money(l.total_repayable)} to the customer's account and the loan becomes active. Terms can no longer be edited.`}
              {action === "cancel" && "Cancelled loans stay on record for audit purposes."}
            </DialogDescription>
          </DialogHeader>
          {action === "cancel" && <Textarea placeholder="Reason for cancellation" value={reason} onChange={(e) => setReason(e.target.value)} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Back</Button>
            <Button variant={action === "cancel" ? "destructive" : "default"} disabled={busy} onClick={runAction}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reverse} onOpenChange={(o) => { if (!o) { setReverse(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse payment {reverse?.ref}</DialogTitle>
            <DialogDescription>This adds a reversal of {money(reverse?.amount ?? 0)} to the ledger and recalculates the balance. The original entry stays on record. Capture the corrected payment separately if needed.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason (e.g. captured twice, bounced EFT)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverse(null)}>Back</Button>
            <Button variant="destructive" disabled={busy} onClick={runReverse}>Reverse payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
