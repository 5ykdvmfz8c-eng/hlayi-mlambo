import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Eye, FileText, Gauge, HandCoins, Pencil, Plus, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Field, LoadingRows, LoanStatusBadge, NoAccess, PageHeader, Panel, Pill, RiskBadge, StatCard } from "@/components/app/kit";
import { CustomerFormDialog, EMPLOYMENT } from "@/components/app/CustomerFormDialog";
import { LoanFormDialog } from "@/components/app/LoanFormDialog";
import { fmtDate, fmtDateTime, maskId, money, titleCase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer profile — H&M Credit Portal" }] }),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { customerId } = Route.useParams();
  const { can } = useMe();
  const [edit, setEdit] = useState(false);
  const [newLoan, setNewLoan] = useState(false);
  const [showId, setShowId] = useState(false);

  const c = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_overview").select("*").eq("id", customerId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const idNo = useQuery({
    queryKey: ["customer-id", customerId],
    enabled: can("idnumber.view"),
    queryFn: async () => (await supabase.from("customer_private").select("id_number").eq("customer_id", customerId).maybeSingle()).data?.id_number ?? null,
  });
  const loans = useQuery({
    queryKey: ["customer-loans", customerId],
    queryFn: async () => (await supabase.from("loan_summary").select("*").eq("customer_id", customerId).order("created_at", { ascending: false })).data ?? [],
  });
  const repayments = useQuery({
    queryKey: ["customer-repayments", customerId],
    queryFn: async () => (await supabase.from("repayments").select("*, loans(loan_reference)").eq("customer_id", customerId).order("payment_date", { ascending: false })).data ?? [],
  });
  const assessments = useQuery({
    queryKey: ["customer-assessments", customerId],
    enabled: can("credit.view"),
    queryFn: async () => (await supabase.from("credit_assessments").select("*").eq("customer_id", customerId).order("created_at", { ascending: false })).data ?? [],
  });
  const statements = useQuery({
    queryKey: ["customer-statements", customerId],
    queryFn: async () => (await supabase.from("statements").select("*, loans(loan_reference)").eq("customer_id", customerId).order("generated_at", { ascending: false })).data ?? [],
  });
  const staff = useQuery({
    queryKey: ["staff-names"],
    queryFn: async () => Object.fromEntries(((await supabase.from("profiles").select("id, full_name")).data ?? []).map((p) => [p.id, p.full_name])),
  });
  const activity = useQuery({
    queryKey: ["customer-activity", customerId, loans.data?.length],
    enabled: !!loans.data,
    queryFn: async () => {
      const ids = [customerId, ...(loans.data ?? []).map((l) => l.id!)];
      return (await supabase.from("audit_log").select("*").in("entity_id", ids).order("created_at", { ascending: false }).limit(100)).data ?? [];
    },
  });

  if (c.isLoading) return <LoadingRows rows={6} />;
  if (!c.data) return <NoAccess what="this customer" />;
  const cu = c.data;
  const names = staff.data ?? {};
  const totalBorrowed = (loans.data ?? []).filter((l) => !["pending", "approved", "cancelled"].includes(l.status!)).reduce((a, l) => a + Number(l.principal), 0);
  const totalPaid = (repayments.data ?? []).filter((r) => r.status === "valid").reduce((a, r) => a + Number(r.amount), 0);

  return (
    <>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Customers</Link>
      <PageHeader
        title={`${cu.first_name} ${cu.last_name}`}
        subtitle={`Account ${cu.account_number} · registered ${fmtDate(cu.created_at)}`}
        actions={
          <>
            {can("customers.edit") && <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Edit</Button>}
            {can("credit.assess") && <Button variant="soft" asChild><Link to="/credit-assessment" search={{ customer: customerId }}><Gauge /> Credit check</Link></Button>}
            {can("loans.create") && <Button onClick={() => setNewLoan(true)}><Plus /> New loan</Button>}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={HandCoins} label="Total borrowed" value={money(totalBorrowed)} hint={`${cu.loan_count} loan(s)`} />
        <StatCard icon={Wallet} tone="success" label="Total repaid" value={money(totalPaid)} />
        <StatCard icon={FileText} tone={cu.overdue_loans ? "danger" : "warning"} label="Outstanding balance" value={money(cu.outstanding_balance)} hint={cu.overdue_loans ? `${cu.overdue_loans} overdue` : `${cu.active_loans} active`} />
        <StatCard icon={Gauge} tone="navy" label="Credit risk" value={can("credit.view") ? (cu.latest_score ?? "—") : "Restricted"} hint={can("credit.view") ? <RiskBadge band={cu.latest_risk_band} /> : undefined} />
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="h-auto flex-wrap justify-start bg-card shadow-card">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {can("credit.view") && <TabsTrigger value="credit">Credit Profile</TabsTrigger>}
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="repayments">Repayments</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="activity">Activity History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Personal details">
              <div className="divide-y">
                <Field label="Full name" value={`${cu.first_name} ${cu.last_name}`} />
                <Field label="SA ID number" value={can("idnumber.view") ? (
                  <span className="inline-flex items-center gap-2 tabular">{showId ? idNo.data : maskId(idNo.data)}
                    <button onClick={() => setShowId((s) => !s)} className="text-primary" aria-label="Reveal ID number"><Eye className="size-3.5" /></button></span>
                ) : <span className="text-muted-foreground">Restricted</span>} />
                <Field label="Contact number" value={cu.phone} />
                <Field label="Email" value={cu.email} />
                <Field label="Residential address" value={cu.address} />
                <Field label="Account number" value={cu.account_number} mono />
              </div>
            </Panel>
            <Panel title="Employment & income">
              <div className="divide-y">
                <Field label="Employer" value={cu.employer} />
                <Field label="Job title" value={cu.job_title} />
                <Field label="Employment status" value={EMPLOYMENT.find((e) => e.value === cu.employment_status)?.label ?? titleCase(cu.employment_status)} />
                <Field label="Monthly income" value={money(cu.monthly_income)} mono />
                <Field label="Date registered" value={fmtDate(cu.created_at)} />
                <Field label="Registered by" value={names[cu.created_by ?? ""] ?? "—"} />
              </div>
            </Panel>
          </div>
        </TabsContent>

        {can("credit.view") && (
          <TabsContent value="credit" className="mt-4">
            <Panel title="Credit assessments" bodyClassName="p-0" action={can("credit.assess") && <Button size="sm" asChild><Link to="/credit-assessment" search={{ customer: customerId }}><Plus /> New assessment</Link></Button>}>
              {!assessments.data?.length ? <EmptyState icon={Gauge} title="No assessments yet" text="Run a credit assessment with the customer's consent." /> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Score</th><th className="px-5 py-3">Risk</th><th className="px-5 py-3">Bureau / ref</th><th className="px-5 py-3 text-right">Existing debt</th><th className="px-5 py-3">Assessed by</th></tr></thead>
                  <tbody>{assessments.data.map((a) => (
                    <tr key={a.id} className="border-t align-top">
                      <td className="px-5 py-3">{fmtDate(a.assessment_date)}</td>
                      <td className="px-5 py-3">{a.status === "completed" ? <Pill tone="success">Completed</Pill> : <Pill tone="warning">Pending</Pill>}</td>
                      <td className="px-5 py-3 font-semibold tabular">{a.credit_score ?? "—"}</td>
                      <td className="px-5 py-3"><RiskBadge band={a.risk_band} /></td>
                      <td className="px-5 py-3 text-muted-foreground">{a.bureau_name ?? "—"}{a.bureau_reference ? ` · ${a.bureau_reference}` : ""}</td>
                      <td className="px-5 py-3 text-right tabular">{money(a.existing_debt)}</td>
                      <td className="px-5 py-3">{names[a.assessed_by] ?? "—"}{a.notes && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{a.notes}</p>}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Panel>
          </TabsContent>
        )}

        <TabsContent value="loans" className="mt-4">
          <Panel title="Loans" bodyClassName="p-0" action={can("loans.create") && <Button size="sm" onClick={() => setNewLoan(true)}><Plus /> New loan</Button>}>
            {!loans.data?.length ? <EmptyState icon={HandCoins} title="No loans" /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Issued</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Repayable</th><th className="px-5 py-3 text-right">Outstanding</th><th className="px-5 py-3">Status</th></tr></thead>
                <tbody>{loans.data.map((l) => (
                  <tr key={l.id!} className="border-t">
                    <td className="px-5 py-3 font-medium"><Link to="/loans/$loanId" params={{ loanId: l.id! }} className="text-primary hover:underline">{l.loan_reference}</Link></td>
                    <td className="px-5 py-3">{fmtDate(l.issue_date)}</td>
                    <td className="px-5 py-3 text-right tabular">{money(l.principal)}</td>
                    <td className="px-5 py-3 text-right tabular">{money(l.total_repayable)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular">{money(l.outstanding_balance)}</td>
                    <td className="px-5 py-3"><LoanStatusBadge status={l.status!} /></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="repayments" className="mt-4">
          <Panel title="Payment history" bodyClassName="p-0" action={can("repayments.record") && <Button size="sm" asChild><Link to="/repayments" search={{ customer: customerId }}><Plus /> Record payment</Link></Button>}>
            {!repayments.data?.length ? <EmptyState icon={Wallet} title="No payments recorded" /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Loan</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Captured by</th><th className="px-5 py-3">Status</th></tr></thead>
                <tbody>{repayments.data.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-5 py-3">{fmtDate(r.payment_date)}</td>
                    <td className="px-5 py-3">{(r.loans as { loan_reference: string } | null)?.loan_reference}</td>
                    <td className="px-5 py-3">{titleCase(r.payment_method)}</td>
                    <td className="px-5 py-3 tabular">{r.transaction_reference}</td>
                    <td className={`px-5 py-3 text-right font-semibold tabular ${r.status === "reversed" ? "text-muted-foreground line-through" : "text-success"}`}>{money(r.amount)}</td>
                    <td className="px-5 py-3">{names[r.captured_by] ?? "—"}</td>
                    <td className="px-5 py-3">{r.status === "reversed" ? <Pill tone="danger">Reversed</Pill> : <Pill tone="success">Valid</Pill>}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="statements" className="mt-4">
          <Panel title="Statements" bodyClassName="p-0" action={<Button size="sm" asChild><Link to="/statements" search={{ customer: customerId }}><FileText /> Generate statement</Link></Button>}>
            {!statements.data?.length ? <EmptyState icon={FileText} title="No statements generated yet" /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Statement</th><th className="px-5 py-3">Loan</th><th className="px-5 py-3">Period</th><th className="px-5 py-3 text-right">Closing balance</th><th className="px-5 py-3">Generated</th><th className="px-5 py-3"></th></tr></thead>
                <tbody>{statements.data.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-5 py-3 tabular">{s.statement_number}</td>
                    <td className="px-5 py-3">{(s.loans as { loan_reference: string } | null)?.loan_reference ?? "All loans"}</td>
                    <td className="px-5 py-3">{fmtDate(s.period_start)} – {fmtDate(s.period_end)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular">{money(s.closing_balance)}</td>
                    <td className="px-5 py-3">{fmtDateTime(s.generated_at)}</td>
                    <td className="px-5 py-3"><Link to="/statements" search={{ statement: s.id }} className="text-xs font-semibold text-primary">Open</Link></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Panel title="Activity history" bodyClassName="p-0">
            {!activity.data?.length ? <EmptyState icon={FileText} title="No activity visible" text="Activity history is visible to supervisors and administrators." /> : (
              <ul>{activity.data.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 border-t px-5 py-3 text-sm first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
                  <span><Pill tone="primary">{titleCase(a.action)}</Pill> <span className="ml-2">{titleCase(a.entity_type)}</span>{a.summary && <span className="text-muted-foreground"> — {a.summary}</span>}</span>
                  <span className="text-xs text-muted-foreground">{names[a.actor_id ?? ""] ?? "System"} · {fmtDateTime(a.created_at)}</span>
                </li>))}</ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <CustomerFormDialog open={edit} onOpenChange={setEdit} customer={{ id: customerId, first_name: cu.first_name ?? "", last_name: cu.last_name ?? "", phone: cu.phone ?? "", email: cu.email ?? "", address: cu.address ?? "", employer: cu.employer ?? "", employment_status: cu.employment_status ?? "permanent", job_title: cu.job_title ?? "", monthly_income: String(cu.monthly_income ?? 0), id_number: "" }} />
      <LoanFormDialog open={newLoan} onOpenChange={setNewLoan} customerId={customerId} />
    </>
  );
}
