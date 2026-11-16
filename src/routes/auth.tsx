import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/app/Logo";
import { createFirstAdmin, getSetupStatus } from "@/lib/staff.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in — H&M Credit Portal" },
      { name: "description", content: "Sign in to the H&M Consulting & Tech staff credit portal." },
      { property: "og:title", content: "Staff sign in — H&M Credit Portal" },
      { property: "og:description", content: "Sign in to the H&M Consulting & Tech staff credit portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "forgot" | "setup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const setup = useQuery({ queryKey: ["setup-status"], queryFn: () => getSetupStatus() });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (setup.data?.needsSetup) setMode("setup");
  }, [setup.data?.needsSetup]);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-gradient p-12 text-navy-foreground lg:flex lg:flex-col">
        <Logo size="lg" className="self-start" />
        <p className="mt-3 text-sm text-navy-muted">Your Growth. Our Expertise.</p>
        <div className="mt-auto max-w-md pb-24">
          <h1 className="text-4xl font-semibold leading-tight">Smart solutions for a brighter financial future</h1>
          <p className="mt-4 text-navy-muted">
            Manage customers, record loans, capture repayments and issue statements — all in one secure staff portal.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-navy-muted">
            <ShieldCheck className="size-4 text-success" /> Authorised staff only · POPIA aware
          </div>
        </div>
        <svg className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 800 220" preserveAspectRatio="none" aria-hidden>
          <path d="M0 120 C 200 40, 400 200, 800 90 L800 220 L0 220 Z" className="fill-primary/30" />
          <path d="M0 160 C 250 90, 500 230, 800 140 L800 220 L0 220 Z" className="fill-primary/40" />
          <path d="M0 190 C 300 140, 520 240, 800 180 L800 220 L0 220 Z" className="fill-primary/60" />
        </svg>
      </aside>

      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center rounded-2xl bg-brand-gradient py-6 lg:hidden">
            <Logo />
          </div>
          {mode === "login" && <LoginForm onForgot={() => setMode("forgot")} needsSetup={!!setup.data?.needsSetup} onSetup={() => setMode("setup")} />}
          {mode === "forgot" && <ForgotForm onBack={() => setMode("login")} />}
          {mode === "setup" && <SetupForm onDone={() => { setup.refetch(); setMode("login"); }} onBack={() => setMode("login")} />}
          <p className="mt-10 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} H&amp;M Consulting &amp; Tech. Access is monitored and logged.
          </p>
        </div>
      </main>
    </div>
  );
}

function LoginForm({ onForgot, needsSetup, onSetup }: { onForgot: () => void; needsSetup: boolean; onSetup: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("banned") ? "This account has been deactivated." : "Incorrect email or password.");
      return;
    }
    await supabase.rpc("log_event", { _action: "login", _entity_type: "session", _entity_id: "", _summary: "Signed in" });
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Welcome back</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your staff account</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@hmconsulting.co.za" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} /> Remember me
        </label>
        <button type="button" onClick={onForgot} className="font-medium text-primary hover:underline">Forgot password?</button>
      </div>
      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Login
      </Button>
      {needsSetup && (
        <>
          <div className="text-center text-xs text-muted-foreground">or</div>
          <Button type="button" variant="outline" className="h-11 w-full border-primary text-primary" onClick={onSetup}>
            Create New Administrator Account
          </Button>
        </>
      )}
      {!needsSetup && (
        <p className="text-center text-xs text-muted-foreground">New staff accounts are created by an administrator.</p>
      )}
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    setSent(true);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Reset your password</h2>
        <p className="mt-1 text-sm text-muted-foreground">We'll email you a secure link. Your administrator can also issue a temporary password.</p>
      </div>
      {sent ? (
        <div className="rounded-xl bg-success-soft p-4 text-sm text-foreground">If that address belongs to a staff account, a reset link is on its way.</div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="fp-email">Email address</Label>
          <Input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      {!sent && <Button className="h-11 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Send reset link</Button>}
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>Back to sign in</Button>
    </form>
  );
}

const setupSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name").max(100),
    email: z.string().trim().email("Enter a valid email").max(255),
    password: z.string().min(10, "Use at least 10 characters").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

function SetupForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = setupSchema.safeParse(form);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
    setBusy(true);
    try {
      await createFirstAdmin({ data: { full_name: form.full_name, email: form.email, password: form.password } });
      const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (error) throw error;
      toast.success("Administrator account created");
      window.location.assign("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the account");
      onDone();
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Set up the portal</h2>
        <p className="mt-1 text-sm text-muted-foreground">Create the first Super Administrator. This option disappears once the portal has an administrator.</p>
      </div>
      <div className="space-y-2"><Label>Full name</Label><Input value={form.full_name} onChange={set("full_name")} required /></div>
      <div className="space-y-2"><Label>Email address</Label><Input type="email" value={form.email} onChange={set("email")} required /></div>
      <div className="space-y-2"><Label>Password</Label><Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required /></div>
      <div className="space-y-2"><Label>Confirm password</Label><Input type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} required /></div>
      <Button className="h-11 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create administrator account</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>Back to sign in</Button>
    </form>
  );
}
