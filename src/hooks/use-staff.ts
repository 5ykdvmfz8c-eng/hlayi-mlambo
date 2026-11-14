import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/permissions";
import { can, type Capability } from "@/lib/permissions";

export type StaffMe = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  role: AppRole | null;
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  staleTime: 60_000,
  queryFn: async (): Promise<StaffMe | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const order: AppRole[] = ["super_admin", "admin", "supervisor", "credit_officer", "finance_officer"];
    const role = (roles ?? []).map((r) => r.role as AppRole).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? null;
    return {
      id: user.id,
      email: profile?.email || user.email || "",
      full_name: profile?.full_name || user.email || "Staff member",
      phone: profile?.phone ?? null,
      is_active: profile?.is_active ?? false,
      role: profile ? role : null,
    };
  },
});

export function useMe() {
  const q = useQuery(meQuery);
  const me = q.data ?? null;
  return { me, isLoading: q.isLoading, can: (cap: Capability) => can(me?.role, cap) };
}
