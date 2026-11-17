import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, LoadingRows, PageHeader, Panel, riskLabel } from "@/components/app/kit";
import { useMe } from "@/hooks/use-staff";
import { cellText, exportReportExcel, exportReportPdf, moneyTotals, type Report, type ReportColumn, type ReportRow } from "@/lib/report-export";
import { dayAfter, periodRange, type PeriodKind } from "@/lib/report-period";
import { fmtDate, friendlyError, saToday, titleCase } from "@/lib/format";
import { statementAmount } from "@/lib/company";

type ReportType = "loans_issued" | "repayments" | "loan_book" | "arrears" | "assessments" | "new_customers";

const REPORT_TYPES: { value: ReportType; label: string; hint: string }[] = [
  { value: "loans_issued", label: "Loans issued", hint: "Loans paid out to customers in the period" },
  { value: "repayments", label: "Repayments collected", hint: "Payments received in the period, including reversals" },
  { value: "loan_book", label: "Outstanding loan book", hint: "Open loans issued up to the end date, with today's balances" },
  { value: "arrears", label: "Arrears & overdue", hint: "Open loans with missed payments, as at today" },
  { value: "assessments", label: "Credit assessments", hint: "Credit checks completed in the period" },
  { value: "new_customers", label: "New customers", hint: "Customers registered in the period" },
];

/** Same amount style as statements: "R 1 000.00". */
const rand = (n: number | undefined) => `R ${statementAmount(n ?? 0)}`;

const OPEN = ["active", "partially_paid", "overdue"] as const;
const name = (r: { first_name: string | null; last_name: string | null } | null | undefined) => (r ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() : "");

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports & analytics — H&M Credit Portal" },
      { name: "description", content: "Daily, weekly and monthly loan, repayment and credit reports with PDF and Excel export." },
      { property: "og:title", content: "Reports & analytics — H&M Credit Portal" },
      { property: "og:description", content: "Daily, weekly and monthly loan, repayment and credit reports with PDF and Excel export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

async function buildReport(type: ReportType, start: string, end: string): Promise<Report> {
  const title = REPORT_TYPES.find((t) => t.value === type)!.label;
  const base = { title, periodStart: start, periodEnd: end };
  const endExcl = dayAfter(end);

  if (type === "loans_issued" || type === "loan_book" || type === "arrears") {
    let q = supabase.from("loan_summary").select("*");
    if (type === "loans_issued") q = q.gte("issue_date", start).lte("issue_date", end).not("status", "in", "(pending,approved,cancelled)");
    else q = q.lte("issue_date", end).in("status", [...OPEN]);
    const { data, error } = await q.order("issue_date");
    if (error) throw error;
    let loans = data ?? [];
    if (type === "arrears") loans = loans.filter((l) => l.status === "overdue" || Number(l.arrears_amount ?? 0) > 0);

    if (type === "loans_issued") {
      const columns: ReportColumn[] = [
        { key: "issue_date", label: "Issue Date", kind: "date" }, { key: "ref", label: "Loan Ref" }, { key: "customer", label: "Customer" },
        { key: "principal", label: "Borrowed", kind: "money" }, { key: "interest", label: "Interest", kind: "money" }, { key: "fees", label: "Fees", kind: "money" },
        { key: "total", label: "Total Repayable", kind: "money" }, { key: "status", label: "Status" },
      ];
      const rows: ReportRow[] = loans.map((l) => ({ issue_date: l.issue_date, ref: l.loan_reference, customer: name(l), principal: Number(l.principal), interest: Number(l.interest_amount), fees: Number(l.fees), total: Number(l.total_repayable), status: titleCase(l.status) }));
      const totals = moneyTotals(columns, rows);
      return { ...base, columns, rows, totals, summary: [
        { label: "Loans issued", value: String(rows.length) },
        { label: "Amount lent", value: rand(totals["principal"]) },
        { label: "Interest & fees", value: rand((totals["interest"] ?? 0) + (totals["fees"] ?? 0)) },
        { label: "Total repayable", value: rand(totals["total"]) },
      ] };
    }

    const columns: ReportColumn[] = [
      { key: "ref", label: "Loan Ref" }, { key: "customer", label: "Customer" }, { key: "issue_date", label: "Issue Date", kind: "date" },
      { key: "total", label: "Total Repayable", kind: "money" }, { key: "paid", label: "Paid", kind: "money" }, { key: "outstanding", label: "Outstanding", kind: "money" },
      { key: "arrears", label: "Arrears", kind: "money" }, { key: "next_due", label: "Next Due", kind: "date" }, { key: "status", label: "Status" },
    ];
    const rows: ReportRow[] = loans.map((l) => ({ ref: l.loan_reference, customer: name(l), issue_date: l.issue_date, total: Number(l.total_repayable), paid: Number(l.amount_paid), outstanding: Number(l.outstanding_balance), arrears: Number(l.arrears_amount ?? 0), next_due: l.next_due_date, status: titleCase(l.status) }));
    const totals = moneyTotals(columns, rows);
    return { ...base, columns, rows, totals, summary: [
      { label: type === "arrears" ? "Loans in arrears" : "Open loans", value: String(rows.length) },
      { label: "Outstanding", value: rand(totals["outstanding"]) },
      { label: "In arrears", value: rand(totals["arrears"]) },
      { label: "Collected so far", value: rand(totals["paid"]) },
    ] };
  }

  if (type === "repayments") {
    const { data, error } = await supabase.from("repayments").select("*, customers(first_name, last_name), loans(loan_reference)").gte("payment_date", start).lte("payment_date", end).order("payment_date");
    if (error) throw error;
    const columns: ReportColumn[] = [
      { key: "date", label: "Payment Date", kind: "date" }, { key: "reference", label: "Transaction Ref" }, { key: "customer", label: "Customer" },
      { key: "loan", label: "Loan Ref" }, { key: "method", label: "Method" }, { key: "amount", label: "Amount", kind: "money" }, { key: "reversed", label: "Reversed", kind: "money" },
    ];
    const rows: ReportRow[] = (data ?? []).map((r) => {
      const isRev = r.status === "reversed";
      return { date: r.payment_date, reference: r.transaction_reference, customer: name(r.customers as { first_name: string; last_name: string } | null), loan: (r.loans as { loan_reference: string } | null)?.loan_reference ?? "", method: titleCase(r.payment_method), amount: isRev ? 0 : Number(r.amount), reversed: isRev ? Number(r.amount) : 0 };
    });
    const totals = moneyTotals(columns, rows);
    const valid = rows.filter((r) => Number(r["amount"]) > 0).length;
    return { ...base, columns, rows, totals, summary: [
      { label: "Payments received", value: String(valid) },
      { label: "Total collected", value: rand(totals["amount"]) },
      { label: "Reversed", value: rand(totals["reversed"]) },
      { label: "Average payment", value: rand(valid ? (totals["amount"] ?? 0) / valid : 0) },
    ] };
  }

  if (type === "assessments") {
    const { data, error } = await supabase.from("credit_assessments").select("*, customers(first_name, last_name, account_number)").gte("assessment_date", start).lte("assessment_date", end).order("assessment_date");
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((a) => a.assessed_by))];
    const { data: staff } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    const staffName = new Map((staff ?? []).map((p) => [p.id, p.full_name]));
    const columns: ReportColumn[] = [
      { key: "date", label: "Date", kind: "date" }, { key: "customer", label: "Customer" }, { key: "account", label: "Account" }, { key: "bureau", label: "Bureau" },
      { key: "score", label: "Score" }, { key: "band", label: "Risk Band" }, { key: "status", label: "Status" }, { key: "by", label: "Assessed By" },
    ];
    const list = data ?? [];
    const rows: ReportRow[] = list.map((a) => {
      const c = a.customers as { first_name: string; last_name: string; account_number: string } | null;
      return { date: a.assessment_date, customer: name(c), account: c?.account_number ?? "", bureau: a.bureau_name ?? "", score: a.credit_score, band: a.risk_band ? riskLabel(a.risk_band) : "", status: titleCase(a.status), by: staffName.get(a.assessed_by) ?? "" };
    });
    const scored = list.filter((a) => a.credit_score != null);
    const avg = scored.length ? Math.round(scored.reduce((s, a) => s + Number(a.credit_score), 0) / scored.length) : 0;
    const highRisk = list.filter((a) => a.risk_band === "poor" || a.risk_band === "high_risk").length;
    return { ...base, columns, rows, summary: [
      { label: "Assessments", value: String(rows.length) },
      { label: "Completed", value: String(list.filter((a) => a.status === "completed").length) },
      { label: "Average score", value: scored.length ? String(avg) : "—" },
      { label: "Poor / high risk", value: String(highRisk) },
    ] };
  }

  const { data, error } = await supabase.from("customer_overview").select("*").gte("created_at", start).lt("created_at", endExcl).order("created_at");
  if (error) throw error;
  const columns: ReportColumn[] = [
    { key: "date", label: "Registered", kind: "date" }, { key: "account", label: "Account" }, { key: "customer", label: "Customer" }, { key: "phone", label: "Phone" },
    { key: "employment", label: "Employment" }, { key: "income", label: "Monthly Income", kind: "money" }, { key: "loans", label: "Loans" },
  ];
  const rows: ReportRow[] = (data ?? []).map((c) => ({ date: (c.created_at ?? "").slice(0, 10), account: c.account_number, customer: name(c), phone: c.phone, employment: titleCase(c.employment_status), income: Number(c.monthly_income ?? 0), loans: c.loan_count ?? 0 }));
  return { ...base, columns, rows, summary: [
    { label: "New customers", value: String(rows.length) },
    { label: "With a loan", value: String(rows.filter((r) => Number(r["loans"]) > 0).length) },
    { label: "Average income", value: rand(rows.length ? rows.reduce((s, r) => s + Number(r["income"]), 0) / rows.length : 0) },
  ] };
}

function ReportsPage() {
  const { me } = useMe();
  const [type, setType] = useState<ReportType>("loans_issued");
  const [kind, setKind] = useState<PeriodKind>("monthly");
  const [anchor, setAnchor] = useState(saToday());
  const [customEnd, setCustomEnd] = useState(saToday());
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const { start, end } = periodRange(kind, anchor, customEnd);

  const report = useQuery({ queryKey: ["report", type, start, end], queryFn: () => buildReport(type, start, end) });
  const r = report.data;

  async function doExport(fmt: "pdf" | "xlsx") {
    if (!r) return;
    setExporting(fmt);
    try {
      if (fmt === "pdf") await exportReportPdf(r, me?.full_name ?? "staff member");
      else await exportReportExcel(r);
      await supabase.rpc("log_event", { _action: "export", _entity_type: "report", _entity_id: type, _summary: `Exported ${r.title} (${fmtDate(start)} - ${fmtDate(end)}) as ${fmt.toUpperCase()}` });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setExporting(null);
    }
  }

  const hint = REPORT_TYPES.find((t) => t.value === type)?.hint;

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        subtitle="Daily, weekly and monthly reports with PDF and Excel export"
        actions={<>
          <Button variant="outline" onClick={() => doExport("xlsx")} disabled={!r || !!exporting}>{exporting === "xlsx" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel</Button>
          <Button onClick={() => doExport("pdf")} disabled={!r || !!exporting}>{exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} PDF</Button>
        </>}
      />

      <Panel className="mb-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_auto_1fr] lg:items-end">
          <div className="space-y-1.5">
            <Label>Report</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
              <SelectTrigger aria-label="Report"><SelectValue /></SelectTrigger>
              <SelectContent>{REPORT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Period</Label>
            <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && setKind(v as PeriodKind)}>
              <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
              <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
              <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
              <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rep-from">{kind === "custom" ? "From" : kind === "daily" ? "Day" : kind === "weekly" ? "Any day in the week" : "Any day in the month"}</Label>
              <Input id="rep-from" type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="w-44" />
            </div>
            {kind === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="rep-to">To</Label>
                <Input id="rep-to" type="date" value={customEnd} min={anchor} onChange={(e) => e.target.value && setCustomEnd(e.target.value)} className="w-44" />
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="font-semibold text-navy">{fmtDate(start)} – {fmtDate(end)}</span> · {hint}
        </p>
      </Panel>

      {report.isLoading ? <Panel><LoadingRows rows={5} /></Panel> : report.error ? (
        <Panel><EmptyState icon={BarChart3} title="Could not load this report" text={friendlyError(report.error)} /></Panel>
      ) : r && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {r.summary.map((s) => (
              <div key={s.label} className="rounded-2xl border bg-card p-5 shadow-card">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-xl font-semibold text-navy tabular sm:text-2xl">{s.value}</p>
              </div>
            ))}
          </div>
          <Panel title={`${r.title} · ${r.rows.length} ${r.rows.length === 1 ? "row" : "rows"}`} bodyClassName="p-0">
            {!r.rows.length ? <EmptyState icon={BarChart3} title="Nothing in this period" text="Try a different date or a longer period." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>{r.columns.map((c) => <th key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.kind === "money" ? "text-right" : ""}`}>{c.label}{c.kind === "money" ? " (R)" : ""}</th>)}</tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {r.columns.map((c) => <td key={c.key} className={`whitespace-nowrap px-4 py-2.5 ${c.kind === "money" ? "text-right tabular" : c.kind === "date" ? "tabular" : ""}`}>{cellText(c, row[c.key]) || (c.kind === "money" ? "" : "—")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  {r.totals && (
                    <tfoot className="border-t-2 border-foreground/20 font-semibold text-navy">
                      <tr>{r.columns.map((c, i) => <td key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.kind === "money" ? "text-right tabular" : ""}`}>{i === 0 ? "Totals" : c.kind === "money" ? cellText(c, r.totals?.[c.key] ?? 0) : ""}</td>)}</tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
