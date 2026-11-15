import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, LoadingRows, PageHeader, Panel, Pill, RiskBadge } from "@/components/app/kit";
import { CustomerFormDialog } from "@/components/app/CustomerFormDialog";
import { fmtDate, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({ meta: [{ title: "Customers — H&M Credit Portal" }] }),
  component: CustomersPage,
});

const PAGE = 12;

function CustomersPage() {
  const { can } = useMe();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["customers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_overview").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data ?? []).filter((c) => {
      if (t && !`${c.first_name} ${c.last_name} ${c.account_number} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(t)) return false;
      if (status === "overdue") return (c.overdue_loans ?? 0) > 0;
      if (status === "active") return (c.active_loans ?? 0) > 0;
      if (status === "none") return (c.active_loans ?? 0) === 0;
      if (status === "unassessed") return !c.latest_risk_band;
      return true;
    });
  }, [q.data, term, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Manage your customer database"
        actions={can("customers.edit") && <Button onClick={() => setOpen(true)}><Plus /> Add customer</Button>}
      />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, account number, phone or email" value={term} onChange={(e) => { setTerm(e.target.value); setPage(0); }} />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              <SelectItem value="active">With active loans</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="none">No active loans</SelectItem>
              {can("credit.view") && <SelectItem value="unassessed">Awaiting assessment</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        {q.isLoading ? <LoadingRows /> : rows.length === 0 ? (
          <EmptyState icon={Users} title={q.data?.length ? "No customers match" : "No customers yet"} text={q.data?.length ? "Try a different search or filter." : "Register your first customer to get started."} action={!q.data?.length && can("customers.edit") ? <Button onClick={() => setOpen(true)}><Plus /> Add customer</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Account no.</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Phone</th>
                  {can("credit.view") && <th className="hidden px-5 py-3 font-medium lg:table-cell">Credit risk</th>}
                  <th className="hidden px-5 py-3 text-right font-medium md:table-cell">Outstanding</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="hidden px-5 py-3 font-medium xl:table-cell">Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id!} onClick={() => navigate({ to: "/customers/$customerId", params: { customerId: c.id! } })} className="cursor-pointer border-t transition-colors hover:bg-accent/40">
                    <td className="px-5 py-3.5 font-medium text-navy">{c.first_name} {c.last_name}</td>
                    <td className="px-5 py-3.5 tabular text-muted-foreground">{c.account_number}</td>
                    <td className="hidden px-5 py-3.5 md:table-cell">{c.phone}</td>
                    {can("credit.view") && <td className="hidden px-5 py-3.5 lg:table-cell"><RiskBadge band={c.latest_risk_band} /></td>}
                    <td className="hidden px-5 py-3.5 text-right tabular md:table-cell">{money(c.outstanding_balance)}</td>
                    <td className="px-5 py-3.5">
                      {(c.overdue_loans ?? 0) > 0 ? <Pill tone="danger">Overdue</Pill> : (c.active_loans ?? 0) > 0 ? <Pill tone="success">Active</Pill> : <Pill tone="muted">No active loan</Pill>}
                    </td>
                    <td className="hidden px-5 py-3.5 text-muted-foreground xl:table-cell">{fmtDate(c.created_at)}</td>
                  </tr>
                ))}
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
      <CustomerFormDialog open={open} onOpenChange={setOpen} onSaved={(id) => navigate({ to: "/customers/$customerId", params: { customerId: id } })} />
    </>
  );
}
