import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, HandCoins, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, LOAN_STATUS_OPTIONS, LoadingRows, LoanStatusBadge, PageHeader, Panel, ProgressBar } from "@/components/app/kit";
import { LoanFormDialog } from "@/components/app/LoanFormDialog";
import { fmtDate, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/loans/")({
  validateSearch: (s: Record<string, unknown>): { status?: string } => (typeof s.status === "string" ? { status: s.status } : {}),
  head: () => ({ meta: [{ title: "Loans — H&M Credit Portal" }] }),
  component: LoansPage,
});

const PAGE = 12;

function LoansPage() {
  const { can } = useMe();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const status = search.status ?? "all";

  const q = useQuery({
    queryKey: ["loans-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loan_summary").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data ?? []).filter((l) => (status === "all" || l.status === status) && (!t || `${l.loan_reference} ${l.first_name} ${l.last_name} ${l.account_number}`.toLowerCase().includes(t)));
  }, [q.data, term, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <>
      <PageHeader title="Loans" subtitle="Manage customer loans and track balances" actions={can("loans.create") && <Button onClick={() => setOpen(true)}><Plus /> New loan</Button>} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by customer, account or loan reference" value={term} onChange={(e) => { setTerm(e.target.value); setPage(0); }} />
          </div>
          <Select value={status} onValueChange={(v) => { setPage(0); navigate({ to: "/loans", search: v === "all" ? {} : { status: v } }); }}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LOAN_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {q.isLoading ? <LoadingRows /> : rows.length === 0 ? (
          <EmptyState icon={HandCoins} title={q.data?.length ? "No loans match" : "No loans yet"} text={q.data?.length ? "Try another filter." : "Record the first loan for a registered customer."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="hidden px-5 py-3 text-right font-medium md:table-cell">Outstanding</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell">Progress</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Next due</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const pct = Number(l.total_repayable) > 0 ? (Number(l.amount_paid) / Number(l.total_repayable)) * 100 : 0;
                  return (
                    <tr key={l.id!} onClick={() => navigate({ to: "/loans/$loanId", params: { loanId: l.id! } })} className="cursor-pointer border-t hover:bg-accent/40">
                      <td className="px-5 py-3.5 font-medium text-primary tabular">{l.loan_reference}</td>
                      <td className="px-5 py-3.5"><span className="font-medium text-navy">{l.first_name} {l.last_name}</span><span className="block text-xs text-muted-foreground">{l.account_number}</span></td>
                      <td className="px-5 py-3.5 text-right tabular">{money(l.principal)}</td>
                      <td className="hidden px-5 py-3.5 text-right font-semibold tabular md:table-cell">{money(l.outstanding_balance)}</td>
                      <td className="hidden w-40 px-5 py-3.5 lg:table-cell"><ProgressBar value={pct} tone={l.status === "overdue" ? "danger" : "success"} /><span className="text-xs text-muted-foreground">{pct.toFixed(0)}% paid</span></td>
                      <td className="hidden px-5 py-3.5 md:table-cell">{l.next_due_date ? fmtDate(l.next_due_date) : "—"}</td>
                      <td className="px-5 py-3.5"><LoanStatusBadge status={l.status!} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
          <span>Showing {rows.length ? page * PAGE + 1 : 0}–{page * PAGE + rows.length} of {filtered.length}</span>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" className="size-8" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
            <Button size="icon" variant="outline" className="size-8" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
          </div>
        </div>
      </Panel>
      <LoanFormDialog open={open} onOpenChange={setOpen} onSaved={(id) => navigate({ to: "/loans/$loanId", params: { loanId: id } })} />
    </>
  );
}
