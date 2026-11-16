import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, LoadingRows, PageHeader, Panel, Pill } from "@/components/app/kit";
import { RepaymentForm } from "@/components/app/RepaymentForm";
import { fmtDate, money, titleCase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/repayments")({
  validateSearch: (s: Record<string, unknown>): { customer?: string } => (typeof s["customer"] === "string" ? { customer: s["customer"] } : {}),
  head: () => ({ meta: [{ title: "Repayments — H&M Credit Portal" }] }),
  component: RepaymentsPage,
});

function RepaymentsPage() {
  const { can } = useMe();
  const search = Route.useSearch();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const list = useQuery({
    queryKey: ["repayments-list"],
    queryFn: async () => (await supabase.from("repayments").select("*, loans(loan_reference), customers(first_name, last_name, account_number)").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });
  const staff = useQuery({
    queryKey: ["staff-names"],
    queryFn: async () => Object.fromEntries(((await supabase.from("profiles").select("id, full_name")).data ?? []).map((p) => [p.id, p.full_name])),
  });
  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (list.data ?? []).filter((r) => {
      const c = r.customers as { first_name: string; last_name: string; account_number: string } | null;
      const lr = (r.loans as { loan_reference: string } | null)?.loan_reference ?? "";
      if (status !== "all" && r.status !== status) return false;
      return !t || `${c?.first_name} ${c?.last_name} ${c?.account_number} ${lr} ${r.transaction_reference}`.toLowerCase().includes(t);
    });
  }, [list.data, term, status]);

  return (
    <>
      <PageHeader title="Repayments" subtitle="Capture customer payments and update loan balances" />
      {can("repayments.record") ? (
        <Panel title="Record repayment" className="mb-6">
          <RepaymentForm key={search.customer ?? "none"} {...(search.customer ? { customerId: search.customer } : {})} />
        </Panel>
      ) : (
        <div className="mb-6 rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-card">Your role can view repayments but not record them.</div>
      )}

      <Panel title="Recent repayments" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search customer, loan or transaction reference" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="valid">Valid</SelectItem><SelectItem value="reversed">Reversed</SelectItem></SelectContent>
          </Select>
        </div>
        {list.isLoading ? <LoadingRows /> : !rows.length ? <EmptyState icon={Wallet} title="No repayments found" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Loan</th><th className="hidden px-5 py-3 md:table-cell">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3 text-right">Amount</th><th className="hidden px-5 py-3 lg:table-cell">Captured by</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody>{rows.map((r) => {
              const c = r.customers as { first_name: string; last_name: string } | null;
              return (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap px-5 py-3">{fmtDate(r.payment_date)}</td>
                  <td className="px-5 py-3 font-medium text-navy">{c?.first_name} {c?.last_name}</td>
                  <td className="px-5 py-3"><Link to="/loans/$loanId" params={{ loanId: r.loan_id }} className="text-primary hover:underline">{(r.loans as { loan_reference: string } | null)?.loan_reference}</Link></td>
                  <td className="hidden px-5 py-3 md:table-cell">{titleCase(r.payment_method)}</td>
                  <td className="px-5 py-3 tabular">{r.transaction_reference}</td>
                  <td className={`px-5 py-3 text-right font-semibold tabular ${r.status === "reversed" ? "text-muted-foreground line-through" : "text-success"}`}>{money(r.amount)}</td>
                  <td className="hidden px-5 py-3 lg:table-cell">{staff.data?.[r.captured_by] ?? "—"}</td>
                  <td className="px-5 py-3">{r.status === "reversed" ? <Pill tone="danger">Reversed</Pill> : <Pill tone="success">Valid</Pill>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
