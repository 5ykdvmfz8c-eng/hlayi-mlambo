import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Download, Eye, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/app/Logo";
import { SignaturePad } from "@/components/app/SignaturePad";
import { getSigningLinkInfo, openSigningLink, signViaLink } from "@/lib/agreement.functions";
import { DECLARATIONS, FREQUENCY_LABEL, type AgreementDoc } from "@/lib/agreement";
import { agreementFileName, buildAgreementPdf } from "@/lib/agreement-pdf";
import { fmtDate, fmtDateTime, friendlyError, money } from "@/lib/format";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({
    meta: [
      { title: "Sign your loan agreement — H&M Consulting & Tech" },
      { name: "description", content: "Read and sign your H&M Consulting & Tech loan agreement securely." },
      { property: "og:title", content: "Sign your loan agreement — H&M Consulting & Tech" },
      { property: "og:description", content: "Read and sign your H&M Consulting & Tech loan agreement securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SignPage,
});

function SignPage() {
  const { token } = Route.useParams();
  const info = useQuery({ queryKey: ["sign-info", token], retry: false, queryFn: () => getSigningLinkInfo({ data: { token } }) });
  const [code, setCode] = useState("");
  const [doc, setDoc] = useState<AgreementDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function open() {
    if (!/^\d{4}$/.test(code)) return void toast.error("Enter 4 digits");
    setBusy(true);
    try {
      const d = await openSigningLink({ data: { token, code } });
      setDoc(d);
      setName(d.details.full_name ?? "");
      setPlace(d.details.signing_place ?? "");
    } catch (e) {
      toast.error(friendlyError(e));
      void info.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    if (!image) return void toast.error("Please sign in the box");
    if (!accepted) return void toast.error("Please tick the box to accept the agreement");
    setBusy(true);
    try {
      const d = await signViaLink({ data: { token, code, name, place, signature: image, accepted: true } });
      setDoc(d);
      toast.success("Thank you — your agreement is signed");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function pdf(view: boolean) {
    if (!doc) return;
    const file = await buildAgreementPdf(doc);
    if (view) window.open(String(file.output("bloburl")), "_blank");
    else file.save(agreementFileName(doc));
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-brand-gradient px-5 py-5"><div className="mx-auto max-w-2xl"><Logo tone="light" /></div></header>
      <main className="mx-auto max-w-2xl px-5 py-8">
        {info.isLoading ? (
          <p className="text-sm text-muted-foreground">Opening your agreement…</p>
        ) : info.isError ? (
          <Card icon={Lock} title="Link not available" text={friendlyError(info.error)} />
        ) : !doc ? (
          info.data?.locked ? (
            <Card icon={Lock} title="Link locked" text="Too many incorrect attempts. Please contact H&M Consulting & Tech for a new link." />
          ) : (
            <section className="rounded-2xl border bg-card p-6 shadow-card">
              <ShieldCheck className="mb-3 size-8 text-primary" />
              <h1 className="text-xl font-semibold text-navy">Your loan agreement {info.data?.agreement_number}</h1>
              <p className="mt-2 text-sm text-muted-foreground">To keep your information private, enter {info.data?.prompt}.</p>
              <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); void open(); }}>
                <Input inputMode="numeric" maxLength={4} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••" className="max-w-32 text-center text-lg tracking-[0.5em]" aria-label="Last 4 digits" />
                <Button type="submit" disabled={busy}>Continue</Button>
              </form>
            </section>
          )
        ) : doc.customer ? (
          <section className="rounded-2xl border bg-card p-6 text-center shadow-card">
            <CheckCircle2 className="mx-auto mb-3 size-10 text-success" />
            <h1 className="text-xl font-semibold text-navy">Agreement signed</h1>
            <p className="mt-2 text-sm text-muted-foreground">Signed by {doc.customer.name} on {fmtDateTime(doc.customer.at)}. Please download and keep a copy for your records.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => pdf(true)}><Eye /> View</Button>
              <Button onClick={() => pdf(false)}><Download /> Download my copy</Button>
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border bg-card p-6 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan agreement {doc.agreement_number}</p>
              <h1 className="mt-1 text-xl font-semibold text-navy">Hello {doc.details.full_name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">Please read the full agreement before you sign. You can open it or download it below.</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Loan amount", money(doc.terms.principal)],
                  ["Interest", money(doc.terms.interest_amount)],
                  ["Fees", money(doc.terms.fees)],
                  ["Total to repay", money(doc.terms.total_repayable)],
                  ["Instalments", `${doc.terms.number_of_instalments} × ${money(doc.terms.instalment_amount)} (${FREQUENCY_LABEL[doc.terms.repayment_frequency]})`],
                  ["First / last payment", `${fmtDate(doc.terms.first_payment_date)} – ${fmtDate(doc.terms.maturity_date)}`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-muted px-3 py-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold tabular text-navy">{v}</dd></div>
                ))}
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => pdf(true)}><Eye /> Read full agreement</Button>
                <Button variant="outline" onClick={() => pdf(false)}><Download /> Download</Button>
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-6 shadow-card">
              <h2 className="text-lg font-semibold text-navy">Declaration</h2>
              <p className="mt-1 text-sm">I, <strong>{name || "—"}</strong>, declare that:</p>
              <ol className="mt-2 list-[lower-alpha] space-y-1.5 pl-5 text-sm text-muted-foreground">{DECLARATIONS.map((x) => <li key={x}>{x}</li>)}</ol>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div><Label className="mb-1.5 block text-xs">Full names and surname</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label className="mb-1.5 block text-xs">Where are you signing? (town)</Label><Input value={place} onChange={(e) => setPlace(e.target.value)} /></div>
              </div>
              <div className="mt-4"><SignaturePad onChange={setImage} /></div>
              <label className="mt-2 flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" /> I have read and accept this loan agreement and the declaration above. I agree that my electronic signature is binding.</label>
              <Button className="mt-5 w-full" size="lg" disabled={busy} onClick={sign}>Sign agreement</Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">The date, time and your device's internet address are recorded with your signature.</p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Card({ icon: Icon, title, text }: { icon: typeof Lock; title: string; text: string }) {
  return (
    <section className="rounded-2xl border bg-card p-6 text-center shadow-card">
      <Icon className="mx-auto mb-3 size-8 text-destructive" />
      <h1 className="text-xl font-semibold text-navy">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </section>
  );
}
