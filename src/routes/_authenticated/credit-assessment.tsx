import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Loader2, PlugZap, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPicker } from "@/components/app/CustomerPicker";
import { ScoreGauge } from "@/components/app/ScoreGauge";
import { EmptyState, Field, NoAccess, PageHeader, Panel, Pill, RiskBadge } from "@/components/app/kit";
import { RISK_BANDS, riskBandFor } from "@/lib/finance";
import { fmtDate, friendlyError, maskId, money, titleCase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/credit-assessment")({
  validateSearch: (s: Record<string, unknown>): { customer?: string } => (typeof s["customer"] === "string" ? { customer: s["customer"] } : {}),
  head: () => ({ meta: [{ title: "Credit assessment — H&M Credit Portal" }] }),
  component: CreditAssessmentPage,
});

const BUREAUS = ["TransUnion", "Experian", "XDS", "Compuscan (Experian)", "Other registered bureau"];

function CreditAssessmentPage() {
  const { can } = useMe();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customerId = search.customer ?? null;

  const credits = useQuery({
    queryKey: ["my-credits"],
    queryFn: async () => (await supabase.rpc("my_credit_status")).data as { allowance: number; used: number; remaining: number } | null,
  });
  const customer = useQuery({
    queryKey: ["ca-customer", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("customer_overview").select("*").eq("id", customerId!).maybeSingle(),
        supabase.from("customer_private").select("id_number").eq("customer_id", customerId!).maybeSingle(),
      ]);
      return c ? { ...c, id_number: p?.id_number ?? null } : null;
    },
  });
  const history = useQuery({
    queryKey: ["ca-history", customerId],
    enabled: !!customerId,
    queryFn: async () => (await supabase.from("credit_assessments").select("*").eq("customer_id", customerId!).order("created_at", { ascending: false })).data ?? [],
  });
  const pendingAll = useQuery({
    queryKey: ["ca-pending"],
    queryFn: async () => (await supabase.from("credit_assessments").select("id, customer_id, created_at, customers(first_name, last_name, account_number)").eq("status", "pending").order("created_at")).data ?? [],
  });
  const staff = useQuery({
    queryKey: ["staff-names"],
    queryFn: async () => Object.fromEntries(((await supabase.from("profiles").select("id, full_name")).data ?? []).map((p) => [p.id, p.full_name])),
  });

  if (!can("credit.view")) return <NoAccess what="credit assessments" />;

  const latest = history.data?.find((a) => a.status === "completed");
  const pending = history.data?.find((a) => a.status === "pending");
  const cu = customer.data;

  return (
    <>
      <PageHeader title="Credit assessment" subtitle="Check customer credit information and risk profile" />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm">
        <PlugZap className="mt-0.5 size-5 shrink-0 text-warning" />
        <div>
          <p className="font-semibold text-navy">No live credit bureau connected</p>
          <p className="text-muted-foreground">Scores must be taken from an authorised bureau report you have obtained with the customer's consent. A live bureau integration (e.g. TransUnion, Experian, XDS) requires a registered bureau agreement and API credentials. Each assessment uses one of your daily credits.</p>
        </div>
      </div>

      <Panel className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Search customer</Label>
            <CustomerPicker value={customerId} onChange={(c) => navigate({ to: "/credit-assessment", search: c ? { customer: c.id } : {} })} placeholder="Search by name or account number" />
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-2 text-sm">
            <Gauge className="size-4 text-primary" />
            Credits today: <b className="tabular">{credits.data ? `${credits.data.remaining} of ${credits.data.allowance}` : "…"}</b> remaining
          </div>
        </div>
      </Panel>

      {!customerId ? (
        <Panel>
          <EmptyState icon={User} title="Select a customer to begin" text="Search for an existing customer above, then capture their consent and bureau report." />
          {!!pendingAll.data?.length && (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-semibold text-navy">Assessments awaiting a bureau report</p>
              <ul className="space-y-2">{pendingAll.data.map((p) => {
                const c = p.customers as { first_name: string; last_name: string; account_number: string } | null;
                return (
                  <li key={p.id}><Link to="/credit-assessment" search={{ customer: p.customer_id }} className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm hover:bg-accent">
                    <span>{c?.first_name} {c?.last_name} <span className="text-xs text-muted-foreground">{c?.account_number}</span></span>
                    <span className="text-xs text-muted-foreground">Started {fmtDate(p.created_at)}</span>
                  </Link></li>
                );
              })}</ul>
            </div>
          )}
        </Panel>
      ) : !cu ? (
        <Panel><p className="text-sm text-muted-foreground">Loading customer…</p></Panel>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Customer details">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary"><User className="size-5" /></div>
                <div><p className="font-semibold text-navy">{cu.first_name} {cu.last_name}</p><p className="text-xs text-muted-foreground">{cu.account_number}</p></div>
              </div>
              <div className="divide-y">
                <Field label="ID number" value={maskId(cu.id_number)} mono />
                <Field label="Phone" value={cu.phone} />
                <Field label="Email" value={cu.email} />
                <Field label="Monthly income" value={money(cu.monthly_income)} mono />
                <Field label="Employment" value={titleCase(cu.employment_status)} />
                <Field label="Outstanding with us" value={money(cu.outstanding_balance)} mono />
              </div>
              <Button variant="link" className="mt-2 px-0" asChild><Link to="/customers/$customerId" params={{ customerId: cu.id! }}>Open full profile →</Link></Button>
            </Panel>

            <Panel title="Credit score">
              <ScoreGauge score={latest?.credit_score ?? null} />
              <ul className="mt-4 space-y-1 text-xs">
                {RISK_BANDS.map((b) => (
                  <li key={b.band} className="flex items-center justify-between"><RiskBadge band={b.band} /><span className="tabular text-muted-foreground">{b.band === "high_risk" ? "below 500" : `${b.min}–${b.band === "excellent" ? "850+" : b.max}`}</span></li>
                ))}
              </ul>
            </Panel>

            <Panel title="Latest assessment">
              {!latest ? <p className="text-sm text-muted-foreground">No completed assessment on file.</p> : (
                <div className="divide-y">
                  <Field label="Status" value={<Pill tone="success">Completed</Pill>} />
                  <Field label="Assessment date" value={fmtDate(latest.assessment_date)} />
                  <Field label="Staff member" value={staff.data?.[latest.assessed_by] ?? "—"} />
                  <Field label="Bureau" value={latest.bureau_name} />
                  <Field label="Report reference" value={latest.bureau_reference} mono />
                  <Field label="Existing debt" value={money(latest.existing_debt)} mono />
                  <Field label="Monthly obligations" value={money(latest.monthly_debt_obligations)} mono />
                  <Field label="Consent" value={`${titleCase(latest.consent_method)} · ${fmtDate(latest.consent_date)}`} />
                  {latest.payment_history && <div className="py-2 text-sm"><p className="text-muted-foreground">Payment history</p><p>{latest.payment_history}</p></div>}
                  {latest.notes && <div className="py-2 text-sm"><p className="text-muted-foreground">Notes</p><p>{latest.notes}</p></div>}
                </div>
              )}
            </Panel>
          </div>

          {can("credit.assess") && (
            <AssessmentForm
              key={pending?.id ?? "new"}
              customerId={cu.id!}
              pending={pending ?? null}
              remaining={credits.data?.remaining ?? 0}
              onSaved={() => { qc.invalidateQueries(); }}
            />
          )}

          <Panel title="Assessment history" className="mt-6" bodyClassName="p-0">
            {!history.data?.length ? <p className="p-5 text-sm text-muted-foreground">No assessments yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Score</th><th className="px-5 py-3">Risk</th><th className="px-5 py-3">Bureau</th><th className="px-5 py-3">Staff</th></tr></thead>
                <tbody>{history.data.map((a) => (
                  <tr key={a.id} className="border-t"><td className="px-5 py-3">{fmtDate(a.assessment_date)}</td><td className="px-5 py-3">{a.status === "completed" ? <Pill tone="success">Completed</Pill> : <Pill tone="warning">Pending</Pill>}</td><td className="px-5 py-3 tabular">{a.credit_score ?? "—"}</td><td className="px-5 py-3"><RiskBadge band={a.risk_band} /></td><td className="px-5 py-3">{a.bureau_name ?? "—"}</td><td className="px-5 py-3">{staff.data?.[a.assessed_by] ?? "—"}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

type Pending = { id: string; consent_method: string; bureau_name: string | null; bureau_reference: string | null; credit_score: number | null; existing_debt: number; monthly_debt_obligations: number; payment_history: string | null; notes: string | null };

function AssessmentForm({ customerId, pending, remaining, onSaved }: { customerId: string; pending: Pending | null; remaining: number; onSaved: () => void }) {
  const [consent, setConsent] = useState(!!pending);
  const [f, setF] = useState({
    consent_method: pending?.consent_method ?? "signed_form",
    bureau_name: pending?.bureau_name ?? "",
    bureau_reference: pending?.bureau_reference ?? "",
    credit_score: pending?.credit_score?.toString() ?? "",
    existing_debt: pending?.existing_debt?.toString() ?? "0",
    monthly_debt_obligations: pending?.monthly_debt_obligations?.toString() ?? "0",
    payment_history: pending?.payment_history ?? "",
    notes: pending?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (pending) setConsent(true); }, [pending]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const score = f.credit_score === "" ? null : Number(f.credit_score);
  const band = riskBandFor(score);

  async function save(complete: boolean) {
    if (!consent) return void toast.error("Confirm that the customer has given consent first");
    if (!pending && remaining <= 0) return void toast.error("You have no credits left today. Ask an administrator to adjust your allowance.");
    if (complete) {
      if (score == null || Number.isNaN(score) || score < 0 || score > 999) return void toast.error("Enter the score from the bureau report (0–999)");
      if (!f.bureau_name || !f.bureau_reference.trim()) return void toast.error("Select the bureau and enter the report reference");
    }
    const payload = {
      status: complete ? "completed" : "pending",
      bureau_name: f.bureau_name || null,
      bureau_reference: f.bureau_reference.trim() || null,
      credit_score: score,
      existing_debt: Number(f.existing_debt) || 0,
      monthly_debt_obligations: Number(f.monthly_debt_obligations) || 0,
      payment_history: f.payment_history.trim() || null,
      notes: f.notes.trim() || null,
    };
    setBusy(true);
    const { error } = pending
      ? await supabase.from("credit_assessments").update(payload).eq("id", pending.id)
      : await supabase.from("credit_assessments").insert({ ...payload, customer_id: customerId, consent_given: true, consent_method: f.consent_method });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success(complete ? "Assessment completed" : "Assessment saved as pending");
    onSaved();
  }

  return (
    <Panel title={pending ? "Complete pending assessment" : "New credit assessment"} className="mt-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-secondary p-4 md:col-span-2 lg:col-span-3">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={consent} disabled={!!pending} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
            <span><b className="text-navy">Customer consent obtained.</b> I confirm the customer has authorised H&amp;M Consulting &amp; Tech to obtain and use their credit information for this assessment, as required by the National Credit Act and POPIA.</span>
          </label>
          <div className="mt-3 max-w-xs">
            <Select value={f.consent_method} disabled={!!pending} onValueChange={(v) => setF({ ...f, consent_method: v })}>
              <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="signed_form">Signed consent form</SelectItem>
                <SelectItem value="digital">Digital consent</SelectItem>
                <SelectItem value="verbal_recorded">Recorded verbal consent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Credit bureau</Label>
          <Select value={f.bureau_name} onValueChange={(v) => setF({ ...f, bureau_name: v })}>
            <SelectTrigger><SelectValue placeholder="Select bureau" /></SelectTrigger>
            <SelectContent>{BUREAUS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Bureau report reference</Label><Input value={f.bureau_reference} onChange={set("bureau_reference")} placeholder="Enquiry / report number" /></div>
        <div className="space-y-1.5">
          <Label>Credit score (from report)</Label>
          <div className="flex items-center gap-2"><Input type="number" min={0} max={999} value={f.credit_score} onChange={set("credit_score")} />{band && <RiskBadge band={band} />}</div>
        </div>
        <div className="space-y-1.5"><Label>Existing debt (R)</Label><Input type="number" min={0} step="0.01" value={f.existing_debt} onChange={set("existing_debt")} /></div>
        <div className="space-y-1.5"><Label>Monthly debt obligations (R)</Label><Input type="number" min={0} step="0.01" value={f.monthly_debt_obligations} onChange={set("monthly_debt_obligations")} /></div>
        <div className="space-y-1.5 md:col-span-2 lg:col-span-1"><Label>Payment history (where available)</Label><Textarea rows={2} value={f.payment_history} onChange={set("payment_history")} placeholder="e.g. No defaults in 24 months" /></div>
        <div className="space-y-1.5 md:col-span-2 lg:col-span-3"><Label>Assessment notes</Label><Textarea rows={2} value={f.notes} onChange={set("notes")} /></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => save(true)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Complete assessment</Button>
        <Button variant="outline" onClick={() => save(false)} disabled={busy}>Save as pending</Button>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {pending ? <><ShieldCheck className="size-3.5" /> Credit already used when this assessment was started</> : remaining > 0 ? <><ShieldCheck className="size-3.5" /> Uses 1 credit · {remaining} left today</> : <><AlertTriangle className="size-3.5 text-destructive" /> Daily credit allowance reached</>}
        </span>
      </div>
    </Panel>
  );
}
