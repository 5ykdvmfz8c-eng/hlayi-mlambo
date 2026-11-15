import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  created_at: string;
  read: boolean;
};

export function useNotifications(userId: string | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NotificationItem[]> => {
      const { data: items, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const ids = (items ?? []).map((n) => n.id);
      const { data: reads } = ids.length
        ? await supabase.from("notification_reads").select("notification_id").in("notification_id", ids)
        : { data: [] as { notification_id: string }[] };
      const readSet = new Set((reads ?? []).map((r) => r.notification_id));
      return (items ?? []).map((n) => ({ ...n, read: readSet.has(n.id) }));
    },
  });

  async function markRead(ids: string[]) {
    if (!userId || ids.length === 0) return;
    await supabase.from("notification_reads").upsert(
      ids.map((id) => ({ notification_id: id, user_id: userId })),
      { onConflict: "notification_id,user_id", ignoreDuplicates: true },
    );
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  const items = q.data ?? [];
  return { items, unread: items.filter((i) => !i.read).length, isLoading: q.isLoading, markRead };
}
