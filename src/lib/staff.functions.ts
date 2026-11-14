import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["super_admin", "admin", "supervisor", "credit_officer", "finance_officer"]);
type Role = z.infer<typeof roleEnum>;
const password = z.string().min(10, "Password must be at least 10 characters").max(72);

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Public: only reveals whether the portal still needs its first administrator. */
export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sa = await adminClient();
  const { count, error } = await sa.from("profiles").select("id", { count: "exact", head: true });
  if (error) throw new Error("Could not check setup status");
  return { needsSetup: (count ?? 0) === 0 };
});

/** Public, but only works while no staff exist: creates the first Super Administrator. */
export const createFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(100),
        email: z.string().trim().email().max(255),
        password,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sa = await adminClient();
    const { count } = await sa.from("profiles").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("The portal has already been set up. Ask an administrator for access.");
    const { data: created, error } = await sa.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");
    const uid = created.user.id;
    await sa.from("profiles").insert({ id: uid, full_name: data.full_name, email: data.email });
    await sa.from("user_roles").insert({ user_id: uid, role: "super_admin" });
    await sa.from("audit_log").insert({
      actor_id: uid,
      action: "setup",
      entity_type: "staff",
      entity_id: uid,
      summary: "Portal set up with first Super Administrator",
    });
    return { ok: true };
  });

async function callerRole(ctx: { supabase: any; userId: string }): Promise<Role | null> {
  const { data: isAdmin } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
  if (!isAdmin) return null;
  const { data: isSuper } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  return isSuper ? "super_admin" : "admin";
}

function canAssign(caller: Role, target: Role) {
  return caller === "super_admin" || !["super_admin", "admin"].includes(target);
}

async function targetRole(sa: any, userId: string): Promise<Role | null> {
  const { data } = await sa.from("user_roles").select("role").eq("user_id", userId);
  const order: Role[] = ["super_admin", "admin", "supervisor", "credit_officer", "finance_officer"];
  return ((data ?? []) as { role: Role }[]).map((r) => r.role).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? null;
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await callerRole(context);
    if (!role) throw new Error("Only administrators can manage staff");
    const sa = await adminClient();
    const [{ data: profiles }, { data: roles }, { data: users }] = await Promise.all([
      sa.from("profiles").select("*").order("full_name"),
      sa.from("user_roles").select("user_id, role"),
      sa.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const lastSignIn = new Map((users?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
    return (profiles ?? []).map((p) => ({
      ...p,
      role: ((roles ?? []).find((r) => r.user_id === p.id)?.role ?? null) as Role | null,
      last_sign_in_at: lastSignIn.get(p.id) ?? null,
    }));
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(100),
        email: z.string().trim().email().max(255),
        phone: z.string().trim().max(20).optional().or(z.literal("")),
        role: roleEnum,
        password,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await callerRole(context);
    if (!role) throw new Error("Only administrators can add staff");
    if (!canAssign(role, data.role)) throw new Error("Only a Super Administrator can assign this role");
    const sa = await adminClient();
    const { data: created, error } = await sa.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");
    const uid = created.user.id;
    const { error: pErr } = await sa
      .from("profiles")
      .insert({ id: uid, full_name: data.full_name, email: data.email, phone: data.phone || null });
    if (pErr) throw new Error(pErr.message);
    await sa.from("user_roles").insert({ user_id: uid, role: data.role });
    await sa.from("audit_log").insert({
      actor_id: context.userId,
      action: "create",
      entity_type: "staff",
      entity_id: uid,
      summary: `Added staff member ${data.full_name} as ${data.role}`,
    });
    return { ok: true };
  });

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: roleEnum.optional(),
        is_active: z.boolean().optional(),
        full_name: z.string().trim().min(2).max(100).optional(),
        phone: z.string().trim().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await callerRole(context);
    if (!role) throw new Error("Only administrators can manage staff");
    if (data.user_id === context.userId && (data.role || data.is_active === false))
      throw new Error("You cannot change your own role or deactivate your own account");
    const sa = await adminClient();
    const current = await targetRole(sa, data.user_id);
    if (current && !canAssign(role, current)) throw new Error("Only a Super Administrator can modify this account");
    if (data.role && !canAssign(role, data.role)) throw new Error("Only a Super Administrator can assign this role");

    if (current === "super_admin" && ((data.role && data.role !== "super_admin") || data.is_active === false)) {
      const { data: supers } = await sa.from("user_roles").select("user_id").eq("role", "super_admin");
      const ids = (supers ?? []).map((s) => s.user_id).filter((id) => id !== data.user_id);
      const { count } = ids.length
        ? await sa.from("profiles").select("id", { count: "exact", head: true }).in("id", ids).eq("is_active", true)
        : { count: 0 };
      if (!count) throw new Error("At least one active Super Administrator must remain");
    }

    const changes: string[] = [];
    const profilePatch: Record<string, unknown> = {};
    if (data.full_name) profilePatch.full_name = data.full_name;
    if (data.phone !== undefined) profilePatch.phone = data.phone || null;
    if (data.is_active !== undefined) {
      profilePatch.is_active = data.is_active;
      await sa.auth.admin.updateUserById(data.user_id, { ban_duration: data.is_active ? "none" : "876000h" });
      changes.push(data.is_active ? "activated" : "deactivated");
    }
    if (Object.keys(profilePatch).length) {
      const { error } = await sa.from("profiles").update(profilePatch).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }
    if (data.role && data.role !== current) {
      await sa.from("user_roles").delete().eq("user_id", data.user_id);
      await sa.from("user_roles").insert({ user_id: data.user_id, role: data.role });
      changes.push(`role changed to ${data.role}`);
    }
    await sa.from("audit_log").insert({
      actor_id: context.userId,
      action: "update",
      entity_type: "staff",
      entity_id: data.user_id,
      summary: `Staff account updated${changes.length ? `: ${changes.join(", ")}` : ""}`,
    });
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), password }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await callerRole(context);
    if (!role) throw new Error("Only administrators can reset access");
    const sa = await adminClient();
    const current = await targetRole(sa, data.user_id);
    if (current && !canAssign(role, current)) throw new Error("Only a Super Administrator can reset this account");
    const { error } = await sa.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    await sa.from("audit_log").insert({
      actor_id: context.userId,
      action: "reset_access",
      entity_type: "staff",
      entity_id: data.user_id,
      summary: "Temporary password issued",
    });
    return { ok: true };
  });
