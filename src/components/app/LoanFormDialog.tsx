import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parseISO } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPicker } from "./CustomerPicker";
import { RiskBadge } from "./kit";
import { buildSchedule, computeLoanTerms, type Frequency } from "@/lib/finance";
import { fmtDate, friendlyError, money, saToday } from "@/lib/format";

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

export function LoanFormDialog({ open, onOpenChange, customerId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customerId?: string; onSaved?: (id: string) => void }) {
  const qc = useQueryClient();
  const today = saToday();
  const [cust, setCust] = useState<string | null>(customerId ?? null);
  const [f, setF] = useState({ principal: "", interest_rate: "0", fees: "0", issue_date: today, repayment_frequency: "monthly" as Frequency, number_of_instalments: "6", first_payment_date: format(addMonths(parseISO(today), 1), "yyyy-MM-dd"), purpose: "", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setCust(customerId ?? null); }, [open, customerId]);

  const info = useQuery({
    queryKey: ["loan-form-customer", cust],
    enabled: !!cust,
    queryFn: async () => (await supabase.from("customer_overview").select("monthly_income, latest_risk_band, latest_score, active_loans").eq("id", cust!).maybeSingle()).data,
  });

  const terms = computeLoanTerms({ principal: Number(f.principal), interestRate: Number(f.interest_rate), fees: Number(f.fees), instalments: Number(f.number_of_instalments) });
  const schedule = useMemo(() => (f.first_payment_date && terms.principal > 0 ? buildSchedule(f.first_payment_date, f.repayment_frequency, terms.instalments, terms.instalmentAmount, terms.totalRepayable) : []), [f.first_payment_date, f.repayment_frequency, terms.instalments, terms.instalmentAmount, terms.totalRepayable, terms.principal]);
  const monthlyEquivalent = f.repayment_frequency === "weekly" ? terms.instalmentAmount * 4.33 : f.repayment_frequency === "fortnightly" ? terms.instalmentAmount * 2.17 : terms.instalmentAmount;
  const income = Number(info.data?.monthly_income ?? 0);
  const ratio = income > 0 ? (monthlyEquivalent / income) * 100 : null;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cust) return void toast.error("Select a customer");
    if (!(terms.principal > 0)) return void toast.error("Enter the loan amount");
    if (Number(f.interest_rate) < 0 || Number(f.interest_rate) > 100) return void toast.error("Interest rate must be between 0 and 100%");
    if (f.first_payment_date < f.issue_date) return void toast.error("First payment date cannot be before the issue date");
    setBusy(true);
    const { data, error } = await supabase
      .from("loans")
      .insert({
        customer_id: cust,
        principal: terms.principal,
        interest_rate: Number(f.interest_rate),
        fees: terms.fees,
        issue_date: f.issue_date,
        repayment_frequency: f.repayment_frequency,
        number_of_instalments: terms.instalments,
        first_payment_date: f.first_payment_date,
        purpose: f.purpose.trim() || null,
        notes: f.notes.trim() || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success("Loan recorded — awaiting approval");
    qc.invalidateQueries();
    onOpenChange(false);
    onSaved?.(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record new loan</DialogTitle>
          <DialogDescription>New loans start as Pending. A supervisor approves and disburses them before repayments can be captured.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-6 md:grid-cols-[1fr_17rem]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Customer *</Label><CustomerPicker value={cust} onChange={(c) => setCust(c?.id ?? null)} /></div>
            {cust && info.data && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs sm:col-span-2">
                Credit risk: <RiskBadge band={info.data.latest_risk_band} />
                <span className="text-muted-foreground">Income {money(info.data.monthly_income)} · {info.data.active_loans} active loan(s)</span>
                {!info.data.latest_risk_band && <span className="flex items-center gap-1 text-warning-foreground"><AlertTriangle className="size-3.5" /> No completed credit assessment</span>}
              </div>
            )}
            <div className="space-y-1.5"><Label>Loan amount (R) *</Label><Input type="number" min={1} step="0.01" value={f.principal} onChange={set("principal")} /></div>
            <div className="space-y-1.5"><Label>Interest rate (% flat)</Label><Input type="number" min={0} max={100} step="0.01" value={f.interest_rate} onChange={set("interest_rate")} /></div>
            <div className="space-y-1.5"><Label>Fees (R)</Label><Input type="number" min={0} step="0.01" value={f.fees} onChange={set("fees")} /></div>
            <div className="space-y-1.5"><Label>Issue date *</Label><Input type="date" value={f.issue_date} onChange={set("issue_date")} /></div>
            <div className="space-y-1.5">
              <Label>Repayment frequency</Label>
              <Select value={f.repayment_frequency} onValueChange={(v) => setF({ ...f, repayment_frequency: v as Frequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Number of instalments *</Label><Input type="number" min={1} max={360} value={f.number_of_instalments} onChange={set("number_of_instalments")} /></div>
            <div className="space-y-1.5"><Label>First payment date *</Label><Input type="date" value={f.first_payment_date} onChange={set("first_payment_date")} /></div>
            <div className="space-y-1.5"><Label>Purpose</Label><Input value={f.purpose} onChange={set("purpose")} placeholder="e.g. School fees" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={set("notes")} /></div>
          </div>
          <aside className="space-y-3 rounded-2xl bg-secondary p-4 text-sm">
            <p className="font-semibold text-navy">Loan summary</p>
            <Row k="Principal" v={money(terms.principal)} />
            <Row k="Interest" v={money(terms.interestAmount)} />
            <Row k="Fees" v={money(terms.fees)} />
            <div className="border-t pt-2"><Row k="Total repayable" v={<span className="text-base font-semibold text-navy">{money(terms.totalRepayable)}</span>} /></div>
            <Row k="Instalment" v={`${money(terms.instalmentAmount)} × ${terms.instalments}`} />
            <Row k="Final payment" v={schedule.length ? fmtDate(schedule[schedule.length - 1]!.dueDate) : "—"} />
            {ratio != null && (
              <div className={`rounded-lg px-3 py-2 text-xs ${ratio > 40 ? "bg-destructive-soft text-destructive" : ratio > 25 ? "bg-warning-soft text-warning-foreground" : "bg-success-soft text-success"}`}>
                Instalment is about {ratio.toFixed(0)}% of monthly income.
              </div>
            )}
            <Button className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save loan</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          </aside>
        </form>
        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{k}</span><span className="tabular font-medium">{v}</span></div>;
}
