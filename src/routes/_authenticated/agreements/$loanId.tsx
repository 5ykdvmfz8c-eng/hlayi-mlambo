import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Copy, Download, Eye, FilePen, Link2, MessageCircle, PenLine, Printer, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { ROLE_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingRows, NoAccess, PageHeader, Panel, Pill } from "@/components/app/kit";
import { SignaturePad } from "@/components/app/SignaturePad";
import {
  AGREEMENT_FIELDS, DECLARATIONS, FIELD_SECTIONS, STATUS_LABEL, agreementStatus, dobFromSaId, toAgreementDoc, verificationSecret,
  type AgreementDetails, type AgreementDoc, type AgreementFieldKey, type AgreementRow,
} from "@/lib/agreement";
import { agreementFileName, buildAgreementPdf, printPdf } from "@/lib/agreement-pdf";
import { fmtDate, fmtDateTime, friendlyError, money, saToday } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/agreements/$loanId")({
  head: () => ({ meta: [{ title: "Loan agreement — H&M Credit Portal" }, { name: "description", content: "Prepare, print and sign H&M loan agreements." }] }),
  component: AgreementPage,
});

type Who = "customer" | "rep" | "witness";
const LINK_DAYS = 7;

function AgreementPage() {
  const { loanId } = Route.useParams();
  const { me, can } = useMe();
  const qc = useQueryClient();
  const manage = can("loans.manage");

  const data = useQuery({
    queryKey: ["agreement", loanId],
    queryFn: async () => {
      const { data: loan } = await supabase.from("loans").select("*").eq("id", loanId).maybeSingle();
      if (!loan) return null;
      const [{ data: cu }, { data: priv }, { data: agreement }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", loan.customer_id).maybeSingle(),
        supabase.from("customer_private").select("id_number").eq("customer_id", loan.customer_id).maybeSingle(),
        supabase.from("loan_agreements").select("*").eq("loan_id", loanId).maybeSingle(),
      ]);
      return { loan, customer: cu, idNumber: priv?.id_number ?? "", agreement };
    },
  });

  const [details, setDetails] = useState<AgreementDetails>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [signing, setSigning] = useState<Who | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const d = data.data;
  const agreement = d?.agreement ?? null;

  // Start from the saved agreement, or pre-fill from the customer's profile.
  useEffect(() => {
    if (!d || dirty) return;
    if (d.agreement) { setDetails((d.agreement.details ?? {}) as AgreementDetails); return; }
    const c = d.customer;
    setDetails({
      full_name: c ? `${c.first_name} ${c.last_name}` : "",
      id_number: d.idNumber,
      date_of_birth: dobFromSaId(d.idNumber),
      phone: c?.phone ?? "",
      email: c?.email ?? "",
      residential_address: c?.address ?? "",
      employer: c?.employer ?? "",
      job_title: c?.job_title ?? "",
      monthly_income: c?.monthly_income ? String(c.monthly_income) : "",
      payment_method: "Debit order",
      signing_place: "Kroonstad",
      rep_name: me?.full_name ?? "",
      rep_title: me?.role ? ROLE_LABELS[me.role] : "",
    });
  }, [d, dirty, me]);

  const doc: AgreementDoc | null = useMemo(() => {
    if (!d) return null;
    const row: AgreementRow = agreement
      ? { ...agreement, details }
      : {
          id: "draft", agreement_number: `AGR-${d.loan.loan_reference}`, created_at: new Date().toISOString(), details, signed_terms: null, signed_hash: null,
          customer_signature: null, customer_signed_name: null, customer_signed_place: null, customer_signed_at: null, customer_sign_method: null, customer_sign_ip: null,
          rep_signature: null, rep_name: null, rep_title: null, rep_signed_place: null, rep_signed_at: null,
          witness_signature: null, witness_name: null, witness_signed_place: null, witness_signed_at: null,
        };
    return toAgreementDoc(row, d.loan as unknown as Record<string, unknown>, d.customer?.account_number ?? "");
  }, [d, agreement, details]);

  if (data.isLoading) return <LoadingRows rows={8} />;
  if (!d || !doc) return <NoAccess what="this loan agreement" />;
  const { loan } = d;

  const customerSigned = !!doc.customer;
  const locked = customerSigned || !manage;
  const hasLink = !!agreement?.sign_token && !!agreement.sign_token_expires_at && new Date(agreement.sign_token_expires_at) > new Date();
  const status = agreement ? agreementStatus(doc, hasLink) : null;
  const linkUrl = hasLink && typeof window !== "undefined" ? `${window.location.origin}/sign/${agreement!.sign_token}` : "";

  const set = (k: AgreementFieldKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDetails((prev) => ({ ...prev, [k]: e.target.value }));
    setDirty(true);
  };

  async function refresh() {
    setDirty(false);
    await qc.invalidateQueries({ queryKey: ["agreement", loanId] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function save(): Promise<boolean> {
    if (!(details.full_name ?? "").trim()) { toast.error("Enter the customer's full name"); return false; }
    setBusy(true);
    const { error } = agreement
      ? await supabase.from("loan_agreements").update({ details }).eq("id", agreement.id)
      : await supabase.from("loan_agreements").insert({ loan_id: loanId, customer_id: loan.customer_id, agreement_number: `AGR-${loan.loan_reference}`, details });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return false; }
    toast.success(agreement ? "Agreement updated" : "Agreement prepared");
    await refresh();
    return true;
  }

  async function pdf(action: "preview" | "download" | "print") {
    if (!doc) return;
    try {
      const file = await buildAgreementPdf(doc);
      if (action === "download") return void file.save(agreementFileName(doc));
      const url = String(file.output("bloburl"));
      if (action === "print") return void printPdf(url);
      setPreview(url);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function createLink() {
    if (!agreement) return;
    if (dirty && !(await save())) return;
    if (!verificationSecret(details).value) return void toast.error("Add the customer's ID number or cellphone number first — they use it to open the link.");
    setBusy(true);
    const expires = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
    const { error } = await supabase.from("loan_agreements").update({ sign_token: crypto.randomUUID(), sign_token_expires_at: expires, sign_attempts: 0 }).eq("id", agreement.id);
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success("Signing link created");
    await refresh();
    setLinkOpen(true);
  }

  const steps: { label: string; done: boolean; hint: string }[] = [
    { label: "Agreement prepared", done: !!agreement, hint: agreement ? fmtDateTime(agreement.created_at) : "Check the details and save" },
    { label: "Customer signed", done: customerSigned, hint: doc.customer ? `${doc.customer.method === "remote" ? "Online" : doc.customer.method === "paper" ? "On paper" : "In person"} · ${fmtDate(doc.customer.at)}` : hasLink ? "Signing link sent" : "Awaiting signature" },
    { label: "H&M representative signed", done: !!doc.rep, hint: doc.rep ? `${doc.rep.name} · ${fmtDate(doc.rep.at)}` : "After the customer signs" },
    { label: "Witness signed", done: !!doc.witness, hint: doc.witness ? `${doc.witness.name} · ${fmtDate(doc.witness.at)}` : "Optional" },
  ];

  return (
    <>
      <Link to="/loans/$loanId" params={{ loanId }} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Loan {loan.loan_reference}</Link>
      <PageHeader
        title="Loan agreement"
        subtitle={`${doc.agreement_number} · ${details.full_name || "Customer"} · ${d.customer?.account_number ?? ""}`}
        actions={
          <>
            {status && <Pill tone={status === "completed" ? "success" : status === "customer_signed" ? "primary" : "warning"}>{STATUS_LABEL[status]}</Pill>}
            <Button variant="outline" onClick={() => pdf("preview")}><Eye /> Preview</Button>
            <Button variant="outline" onClick={() => pdf("print")}><Printer /> Print</Button>
            <Button variant="outline" onClick={() => pdf("download")}><Download /> Download PDF</Button>
            {manage && !customerSigned && <Button disabled={busy || (!!agreement && !dirty)} onClick={save}><Save /> {agreement ? "Save changes" : "Prepare agreement"}</Button>}
          </>
        }
      />

      {loan.status === "cancelled" && <p className="mb-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm text-destructive">This loan has been cancelled. Agreements can no longer be signed.</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {customerSigned && (
            <p className="flex items-start gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" /> The customer has signed, so the details and loan amounts are fixed and can no longer be changed.
            </p>
          )}
          {FIELD_SECTIONS.map((s) => (
            <Panel key={s.id} title={s.title}>
              <div className="grid gap-4 sm:grid-cols-2">
                {AGREEMENT_FIELDS.filter((f) => f.section === s.id).map((f) => {
                  const wide = "wide" in f && f.wide;
                  return (
                    <div key={f.key} className={wide ? "sm:col-span-2" : ""}>
                      <Label className="mb-1.5 block text-xs text-muted-foreground">{f.label}</Label>
                      {f.key === "special_conditions" ? (
                        <Textarea rows={3} disabled={locked} value={details[f.key] ?? ""} onChange={set(f.key)} placeholder="Printed as an extra clause. Leave blank if none." />
                      ) : (
                        <Input disabled={locked} type={f.key === "date_of_birth" ? "date" : "text"} value={details[f.key] ?? ""} onChange={set(f.key)} placeholder="Leave blank to print an empty line" />
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}
        </div>

        <div className="space-y-6">
          <Panel title="Signing progress">
            <ol className="space-y-3">
              {steps.map((s) => (
                <li key={s.label} className="flex gap-3">
                  {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                  <div><p className="text-sm font-medium text-navy">{s.label}</p><p className="text-xs text-muted-foreground">{s.hint}</p></div>
                </li>
              ))}
            </ol>
            {manage && agreement && loan.status !== "cancelled" && (
              <div className="mt-5 grid gap-2">
                {!customerSigned && (
                  <>
                    <Button onClick={async () => { if (dirty && !(await save())) return; setSigning("customer"); }}><PenLine /> Customer signs now</Button>
                    <Button variant="outline" disabled={busy} onClick={hasLink ? () => setLinkOpen(true) : createLink}><Link2 /> {hasLink ? "Show signing link" : "Send signing link"}</Button>
                  </>
                )}
                {customerSigned && !doc.rep && <Button onClick={() => setSigning("rep")}><FilePen /> Sign for H&M</Button>}
                {!doc.witness && <Button variant="outline" onClick={async () => { if (dirty && !(await save())) return; setSigning("witness"); }}><FilePen /> Witness signs</Button>}
              </div>
            )}
            {!agreement && manage && <p className="mt-4 text-xs text-muted-foreground">Check the details, then press "Prepare agreement". You can print it for signing by hand, sign on this device, or send the customer a link.</p>}
            {!manage && !agreement && <p className="mt-4 text-xs text-muted-foreground">A supervisor or administrator prepares the agreement.</p>}
          </Panel>

          <Panel title="Loan terms on the agreement">
            <dl className="space-y-2 text-sm">
              {[
                ["Principal", money(doc.terms.principal)],
                ["Interest", `${money(doc.terms.interest_amount)} (${doc.terms.interest_rate}% flat)`],
                ["Fees", money(doc.terms.fees)],
                ["Total repayable", money(doc.terms.total_repayable)],
                ["Instalments", `${doc.terms.number_of_instalments} × ${money(doc.terms.instalment_amount)}`],
                ["Repayment period", `${fmtDate(doc.terms.first_payment_date)} – ${fmtDate(doc.terms.maturity_date)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium tabular">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{doc.termsLocked ? "Fixed when the customer signed." : "Taken from the loan. Edit the loan to change them before signing."}</p>
            {doc.hash && <p className="mt-3 break-all rounded-lg bg-muted px-3 py-2 font-mono text-[10px] text-muted-foreground">Fingerprint {doc.hash}</p>}
          </Panel>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="h-[92vh] max-w-5xl p-0">
          <DialogHeader className="sr-only"><DialogTitle>Agreement preview</DialogTitle><DialogDescription>PDF preview of the loan agreement</DialogDescription></DialogHeader>
          {preview && <iframe src={preview} title="Agreement preview" className="h-full w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer signing link</DialogTitle>
            <DialogDescription>Send this private link to {details.full_name || "the customer"}. They open it on their phone, confirm {verificationSecret(details).label.replace("your", "their")}, read the agreement and sign. It expires on {fmtDate(agreement?.sign_token_expires_at)}.</DialogDescription>
          </DialogHeader>
          <Input readOnly value={linkUrl} onFocus={(e) => e.currentTarget.select()} />
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" disabled={busy} onClick={createLink}>Make a new link</Button>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <a href={`https://wa.me/${(details.phone ?? "").replace(/\D/g, "").replace(/^0/, "27")}?text=${encodeURIComponent(`Hi ${details.full_name ?? ""}, please read and sign your H&M loan agreement ${doc.agreement_number} here: ${linkUrl}`)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
              </Button>
              <Button onClick={() => { void navigator.clipboard.writeText(linkUrl); toast.success("Link copied"); }}><Copy /> Copy link</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {signing && agreement && (
        <SignDialog
          who={signing}
          agreementId={agreement.id}
          defaults={{
            name: signing === "customer" ? details.full_name ?? "" : signing === "rep" ? details.rep_name || me?.full_name || "" : details.witness_name ?? "",
            title: details.rep_title ?? "",
            place: details.signing_place ?? "",
          }}
          onClose={() => setSigning(null)}
          onDone={async () => { setSigning(null); await refresh(); }}
        />
      )}
    </>
  );
}

const WHO_TITLE: Record<Who, string> = { customer: "Customer signature", rep: "Sign for H&M Consulting & Tech", witness: "Witness signature" };

function SignDialog({ who, agreementId, defaults, onClose, onDone }: { who: Who; agreementId: string; defaults: { name: string; title: string; place: string }; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"screen" | "paper">("screen");
  const [name, setName] = useState(defaults.name);
  const [title, setTitle] = useState(defaults.title);
  const [place, setPlace] = useState(defaults.place);
  const [date, setDate] = useState(saToday());
  const [image, setImage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (name.trim().length < 3) return void toast.error("Enter the full name");
    if (!place.trim()) return void toast.error("Enter the place of signing");
    if (mode === "screen" && !image) return void toast.error("Please sign in the box");
    if (who === "customer" && mode === "screen" && !accepted) return void toast.error("The customer must accept the declaration");
    const at = mode === "screen" ? new Date().toISOString() : `${date}T12:00:00+02:00`;
    const img = mode === "screen" ? image : null;
    const patch =
      who === "customer"
        ? { customer_signature: img, customer_signed_name: name.trim(), customer_signed_place: place.trim(), customer_signed_at: at, customer_sign_method: mode === "screen" ? "in_person" : "paper", customer_sign_user_agent: navigator.userAgent.slice(0, 400) }
        : who === "rep"
          ? { rep_signature: img, rep_name: name.trim(), rep_title: title.trim() || null, rep_signed_place: place.trim(), rep_signed_at: at }
          : { witness_signature: img, witness_name: name.trim(), witness_signed_place: place.trim(), witness_signed_at: at };
    setBusy(true);
    const { error } = await supabase.from("loan_agreements").update(patch).eq("id", agreementId);
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success(mode === "paper" ? "Paper signature recorded" : "Signature saved");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{WHO_TITLE[who]}</DialogTitle>
          <DialogDescription>
            {who === "customer" ? "Hand this device to the customer, or record that they signed the printed copy by hand." : "Sign on screen, or record that the printed copy was signed by hand."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          {(["screen", "paper"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === m ? "bg-card text-navy shadow-card" : "text-muted-foreground"}`}>
              {m === "screen" ? "Sign on this device" : "Signed on paper"}
            </button>
          ))}
        </div>
        {who === "customer" && mode === "screen" && (
          <div className="max-h-52 overflow-y-auto rounded-xl border p-4 text-sm">
            <p className="mb-2 font-semibold text-navy">I, {name || "the customer"}, declare that:</p>
            <ol className="list-[lower-alpha] space-y-1 pl-5 text-muted-foreground">{DECLARATIONS.map((x) => <li key={x}>{x}</li>)}</ol>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label className="mb-1.5 block text-xs">Full names and surname</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          {who === "rep" && <div><Label className="mb-1.5 block text-xs">Position</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>}
          <div><Label className="mb-1.5 block text-xs">Signed at (place)</Label><Input value={place} onChange={(e) => setPlace(e.target.value)} /></div>
          {mode === "paper" && <div><Label className="mb-1.5 block text-xs">Date signed</Label><Input type="date" max={saToday()} value={date} onChange={(e) => setDate(e.target.value)} /></div>}
        </div>
        {mode === "screen" ? <SignaturePad onChange={setImage} /> : <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">Keep the signed paper original on file. The PDF will show "Signed by hand on the original paper copy".</p>}
        {who === "customer" && mode === "screen" && (
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" /> I have read and accept this agreement and the declaration above.</label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={submit}>{mode === "paper" ? "Record signature" : "Sign agreement"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
