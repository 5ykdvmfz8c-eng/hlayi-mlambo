import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPicker } from "./CustomerPicker";
import { useMe } from "@/hooks/use-staff";
import { friendlyError, money, saToday } from "@/lib/format";

export const PAYMENT_METHODS = [
  { value: "eft", label: "EFT / bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "debit_order", label: "Debit order" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export function RepaymentForm({ customerId, loanId, onSaved, onCancel }: { customerId?: string; loanId?: string; onSaved?: () => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const { me } = useMe();
  const [cust, setCust] = useState<string | null>(customerId ?? null);
  const [loan, setLoan] = useState<string>(loanId ?? "");
  const [f, setF] = useState({ amount: "", payment_date: saToday(), payment_method: "eft", transaction_reference: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const loans = useQuery({
    queryKey: ["repayable-loans", cust],
    enabled: !!cust,
    queryFn: async () =>
      (await supabase.from("loan_summary").select("id, loan_reference, outstanding_balance, next_due_amount, next_due_date, status").eq("customer_id", cust!).in("status", ["active", "partially_paid", "overdue"])).data ?? [],
  });
  const selected = loans.data?.find((l) => l.id === loan);

  useEffect(() => {
    if (loans.data && !loanId) setLoan(loans.data.length === 1 ? loans.data[0]!.id! : "");
  }, [loans.data, loanId]);
  useEffect(() => {
    if (selected && !f.amount) setF((p) => ({ ...p, amount: String(Number(selected.next_due_amount ?? 0).toFixed(2)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const dupCheck = useQuery({
    queryKey: ["dup-check", loan, f.amount, f.payment_date],
    enabled: !!loan && Number(f.amount) > 0,
    queryFn: async () =>
      (await supabase.from("repayments").select("id, transaction_reference").eq("loan_id", loan).eq("amount", Number(f.amount)).eq("payment_date", f.payment_date).eq("status", "valid")).data ?? [],
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!loan || !selected) return void toast.error("Select a loan");
    const amount = Math.round(Number(f.amount) * 100) / 100;
    if (!(amount > 0)) return void toast.error("Enter the amount paid");
    if (amount > Number(selected.outstanding_balance) + 0.004) return void toast.error(`Amount exceeds the outstanding balance of ${money(selected.outstanding_balance)}`);
    if (!f.transaction_reference.trim()) return void toast.error("Enter the transaction / reference number");
    if (f.payment_date > saToday()) return void toast.error("Payment date cannot be in the future");
    setBusy(true);
    const { error } = await supabase.from("repayments").insert({
      loan_id: loan,
      customer_id: cust!,
      amount,
      payment_date: f.payment_date,
      payment_method: f.payment_method,
      transaction_reference: f.transaction_reference.trim(),
      notes: f.notes.trim() || null,
    });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success(`Payment of ${money(amount)} saved. Balance updated.`);
    qc.invalidateQueries();
    setF({ amount: "", payment_date: saToday(), payment_method: "eft", transaction_reference: "", notes: "" });
    onSaved?.();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Customer *</Label><CustomerPicker value={cust} onChange={(c) => { setCust(c?.id ?? null); setLoan(""); }} /></div>
      <div className="space-y-1.5">
        <Label>Payment method *</Label>
        <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Loan reference *</Label>
        <Select value={loan} onValueChange={(v) => { setLoan(v); setF((p) => ({ ...p, amount: "" })); }} disabled={!cust}>
          <SelectTrigger><SelectValue placeholder={!cust ? "Select a customer first" : loans.data?.length === 0 ? "No active loans" : "Select loan"} /></SelectTrigger>
          <SelectContent>{(loans.data ?? []).map((l) => <SelectItem key={l.id!} value={l.id!}>{l.loan_reference} · {money(l.outstanding_balance)} outstanding</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Transaction / reference no. *</Label><Input value={f.transaction_reference} onChange={set("transaction_reference")} placeholder="Bank or receipt reference" /></div>
      <div className="space-y-1.5"><Label>Amount paid (R) *</Label><Input type="number" min={0.01} step="0.01" value={f.amount} onChange={set("amount")} /></div>
      <div className="space-y-1.5"><Label>Staff member</Label><Input value={me?.full_name ?? ""} disabled /></div>
      <div className="space-y-1.5"><Label>Payment date *</Label><Input type="date" max={saToday()} value={f.payment_date} onChange={set("payment_date")} /></div>
      <div className="space-y-1.5"><Label>Notes (optional)</Label><Textarea rows={2} value={f.notes} onChange={set("notes")} placeholder="Add notes…" /></div>
      {selected && (
        <div className="rounded-xl bg-secondary px-4 py-3 text-sm sm:col-span-2">
          Outstanding <b className="tabular">{money(selected.outstanding_balance)}</b> · next instalment <b className="tabular">{money(selected.next_due_amount)}</b>
          {Number(f.amount) > 0 && <> · balance after payment <b className="tabular text-success">{money(Number(selected.outstanding_balance) - Number(f.amount))}</b></>}
        </div>
      )}
      {!!dupCheck.data?.length && (
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground sm:col-span-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> A payment of the same amount on this date was already captured (ref {dupCheck.data.map((d) => d.transaction_reference).join(", ")}). Check this isn't a duplicate.
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save payment</Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
