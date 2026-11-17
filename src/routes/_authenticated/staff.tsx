import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, Plus, RefreshCw, Search, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { listStaff, createStaff, updateStaff, resetStaffPassword } from "@/lib/staff.functions";
import { ROLE_LABELS, assignableRoles, canAssignRole, type AppRole } from "@/lib/permissions";
import { fmtDate, fmtDateTime, friendlyError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, LoadingRows, NoAccess, PageHeader, Panel, Pill, StatCard } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "Staff management — H&M Credit Portal" },
      { name: "description", content: "Add staff, assign roles, activate or deactivate accounts and reset access." },
    ],
  }),
  component: StaffPage,
});

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  role: AppRole | null;
  last_sign_in_at: string | null;
};

const ROLE_TONE: Record<AppRole, "navy" | "primary" | "success" | "warning" | "muted"> = {
  super_admin: "navy",
  admin: "navy",
  supervisor: "primary",
  credit_officer: "success",
  finance_officer: "warning",
};

function RoleBadge({ role }: { role: AppRole | null }) {
  if (!role) return <Pill tone="muted">No role</Pill>;
  return <Pill tone={ROLE_TONE[role]}>{ROLE_LABELS[role]}</Pill>;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? <Pill tone="success">Active</Pill> : <Pill tone="danger">Deactivated</Pill>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Readable temporary password: no look-alike characters, always 12 long. */
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));
}

function StaffPage() {
  const { me, can, isLoading } = useMe();
  const list = useServerFn(listStaff);
  const allowed = can("staff.manage");
  const q = useQuery({ queryKey: ["staff"], enabled: allowed, queryFn: () => list() as Promise<StaffRow[]> });

  const [term, setTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data ?? []).filter((s) => {
      if (t && !`${s.full_name} ${s.email} ${s.phone ?? ""}`.toLowerCase().includes(t)) return false;
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      return true;
    });
  }, [q.data, term, roleFilter, statusFilter]);

  if (isLoading) return <LoadingRows />;
  if (!allowed) return <NoAccess what="staff management" />;

  const all = q.data ?? [];
  const selected = all.find((s) => s.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Staff management"
        subtitle="Add staff, assign roles, activate or deactivate accounts and reset access."
        actions={<Button onClick={() => setAdding(true)}><Plus /> Add staff member</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total staff" value={all.length} icon={Users} tone="navy" />
        <StatCard label="Active" value={all.filter((s) => s.is_active).length} icon={UserCheck} tone="success" />
        <StatCard label="Deactivated" value={all.filter((s) => !s.is_active).length} icon={UserX} tone="danger" />
        <StatCard label="Administrators" value={all.filter((s) => s.role === "admin" || s.role === "super_admin").length} icon={ShieldCheck} tone="primary" />
      </div>

      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, email or phone" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Deactivated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {q.isLoading ? <LoadingRows /> : q.isError ? (
          <EmptyState icon={Users} title="Could not load staff" text={friendlyError(q.error)} action={<Button variant="outline" onClick={() => void q.refetch()}>Try again</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No staff match" text="Try a different search or filter." />
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="divide-y md:hidden">
              {rows.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setSelectedId(s.id)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/50">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-navy">{initials(s.full_name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-navy">{s.full_name}{s.id === me?.id && <span className="text-muted-foreground"> (you)</span>}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
                      <span className="mt-2 flex flex-wrap gap-1.5"><RoleBadge role={s.role} /><StatusBadge active={s.is_active} /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {/* Larger screens: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Staff member</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">Last sign-in</th>
                    <th className="px-5 py-3 font-medium">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((s) => (
                    <tr key={s.id} onClick={() => setSelectedId(s.id)} className="cursor-pointer hover:bg-muted/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-navy">{initials(s.full_name)}</span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-navy">{s.full_name}{s.id === me?.id && <span className="font-normal text-muted-foreground"> (you)</span>}</p>
                            <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><RoleBadge role={s.role} /></td>
                      <td className="px-5 py-3"><StatusBadge active={s.is_active} /></td>
                      <td className="px-5 py-3 tabular">{s.phone || "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{s.last_sign_in_at ? fmtDateTime(s.last_sign_in_at) : "Never"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{fmtDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <AddStaffDialog open={adding} onOpenChange={setAdding} myRole={me?.role ?? null} />
      <ManageStaffDialog staff={selected} onClose={() => setSelectedId(null)} myRole={me?.role ?? null} myId={me?.id ?? ""} />
    </>
  );
}

const addSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the staff member's full name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().regex(/^(\+?[0-9 ]{9,15})?$/, "Enter a valid contact number"),
  password: z.string().min(10, "Temporary password must be at least 10 characters").max(72),
});

function AddStaffDialog({ open, onOpenChange, myRole }: { open: boolean; onOpenChange: (o: boolean) => void; myRole: AppRole | null }) {
  const qc = useQueryClient();
  const create = useServerFn(createStaff);
  const roles = assignableRoles(myRole);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [role, setRole] = useState<AppRole>("credit_officer");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ full_name: "", email: "", phone: "", password: generatePassword() });
      setRole("credit_officer");
      setDone(null);
    }
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = addSchema.safeParse(form);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
    setBusy(true);
    try {
      await create({ data: { ...parsed.data, role } });
      await qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success(`${parsed.data.full_name} has been added`);
      setDone({ email: parsed.data.email, password: parsed.data.password });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Staff member added</DialogTitle>
              <DialogDescription>Share these sign-in details privately. Ask them to change the password under Settings after signing in.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-xl border bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Email</span><span className="truncate font-medium">{done.email}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Temporary password</span>
                <span className="flex items-center gap-1 font-mono font-medium">{done.password}
                  <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => copy(done.password)} aria-label="Copy password"><Copy className="size-3.5" /></Button>
                </span>
              </div>
            </div>
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add staff member</DialogTitle>
              <DialogDescription>They will sign in with this email and the temporary password below.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5"><Label htmlFor="s-name">Full name</Label><Input id="s-name" value={form.full_name} onChange={set("full_name")} autoComplete="off" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="s-email">Email</Label><Input id="s-email" type="email" value={form.email} onChange={set("email")} autoComplete="off" /></div>
              <div className="space-y-1.5"><Label htmlFor="s-phone">Phone (optional)</Label><Input id="s-phone" value={form.phone} onChange={set("phone")} placeholder="e.g. 082 123 4567" /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
              {myRole !== "super_admin" && <p className="text-xs text-muted-foreground">Only a Super Administrator can add administrators.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-pass">Temporary password</Label>
              <div className="flex gap-2">
                <Input id="s-pass" className="font-mono" value={form.password} onChange={set("password")} autoComplete="new-password" />
                <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, password: generatePassword() })} aria-label="Generate new password"><RefreshCw /></Button>
                <Button type="button" variant="outline" size="icon" onClick={() => copy(form.password)} aria-label="Copy password"><Copy /></Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Add staff member</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManageStaffDialog({ staff, onClose, myRole, myId }: { staff: StaffRow | null; onClose: () => void; myRole: AppRole | null; myId: string }) {
  const qc = useQueryClient();
  const update = useServerFn(updateStaff);
  const reset = useServerFn(resetStaffPassword);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AppRole | "">("");
  const [busy, setBusy] = useState<"save" | "status" | "reset" | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  useEffect(() => {
    if (staff) {
      setFullName(staff.full_name);
      setPhone(staff.phone ?? "");
      setRole(staff.role ?? "");
      setNewPassword(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.id]);

  const activity = useQuery({
    queryKey: ["staff-activity", staff?.id],
    enabled: !!staff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, summary, created_at")
        .eq("actor_id", staff!.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  if (!staff) return null;
  const isSelf = staff.id === myId;
  const canManage = !staff.role || canAssignRole(myRole, staff.role);
  const roles = assignableRoles(myRole);

  async function run(kind: "save" | "status" | "reset", fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(ok);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const name = fullName.trim();
    if (name.length < 2) return void toast.error("Enter the staff member's full name");
    if (phone.trim() && !/^\+?[0-9 ]{9,15}$/.test(phone.trim())) return void toast.error("Enter a valid contact number");
    const s = staff!;
    void run("save", () => update({
      data: {
        user_id: s.id,
        ...(name !== s.full_name ? { full_name: name } : {}),
        ...(phone.trim() !== (s.phone ?? "") ? { phone: phone.trim() } : {}),
        ...(role && role !== s.role && !isSelf ? { role } : {}),
      },
    }), "Changes saved");
  }

  function toggleActive(next: boolean) {
    const s = staff!;
    void run("status", () => update({ data: { user_id: s.id, is_active: next } }), next ? `${s.full_name} can sign in again` : `${s.full_name} can no longer sign in`);
  }

  function resetPassword() {
    const s = staff!;
    const pw = generatePassword();
    void run("reset", async () => {
      await reset({ data: { user_id: s.id, password: pw } });
      setNewPassword(pw);
    }, "Temporary password issued");
  }

  return (
    <Dialog open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{staff.full_name}{isSelf && <span className="text-sm font-normal text-muted-foreground">(you)</span>}</DialogTitle>
          <DialogDescription>{staff.email}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5"><RoleBadge role={staff.role} /><StatusBadge active={staff.is_active} /></div>
        <p className="text-xs text-muted-foreground">Added {fmtDate(staff.created_at)} · Last sign-in {staff.last_sign_in_at ? fmtDateTime(staff.last_sign_in_at) : "never"}</p>

        {!canManage ? (
          <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">Only a Super Administrator can change administrator accounts.</p>
        ) : (
          <>
            <section className="space-y-3 rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-navy">Details & role</h3>
              <div className="space-y-1.5"><Label htmlFor="m-name">Full name</Label><Input id="m-name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="m-phone">Phone</Label><Input id="m-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)} disabled={isSelf}>
                  <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
                  <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
                {isSelf && <p className="text-xs text-muted-foreground">You cannot change your own role.</p>}
              </div>
              <div className="flex justify-end">
                <Button onClick={save} disabled={busy !== null}>{busy === "save" && <Loader2 className="animate-spin" />} Save changes</Button>
              </div>
            </section>

            <section className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div>
                <h3 className="text-sm font-semibold text-navy">Account active</h3>
                <p className="text-xs text-muted-foreground">{isSelf ? "You cannot deactivate your own account." : "Deactivated staff cannot sign in. Their history is kept."}</p>
              </div>
              <Switch checked={staff.is_active} disabled={isSelf || busy !== null} onCheckedChange={toggleActive} aria-label="Account active" />
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-navy">Reset access</h3>
                  <p className="text-xs text-muted-foreground">Issue a new temporary password. The old one stops working.</p>
                </div>
                <Button variant="outline" onClick={resetPassword} disabled={busy !== null}>{busy === "reset" ? <Loader2 className="animate-spin" /> : <KeyRound />} Reset</Button>
              </div>
              {newPassword && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">New password</span>
                  <span className="flex items-center gap-1 font-mono font-medium">{newPassword}
                    <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => copy(newPassword)} aria-label="Copy password"><Copy className="size-3.5" /></Button>
                  </span>
                </div>
              )}
            </section>
          </>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-navy">Recent activity</h3>
          {activity.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !activity.data?.length ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border text-sm">
              {activity.data.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">{a.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
