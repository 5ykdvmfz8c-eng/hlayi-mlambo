import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type PickedCustomer = { id: string; first_name: string; last_name: string; account_number: string };

export function CustomerPicker({ value, onChange, placeholder = "Select customer" }: { value: string | null; onChange: (c: PickedCustomer | null) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = useQuery({
    queryKey: ["customer-mini", value],
    enabled: !!value,
    queryFn: async () => (await supabase.from("customers").select("id, first_name, last_name, account_number").eq("id", value!).maybeSingle()).data,
  });
  const list = useQuery({
    queryKey: ["customer-pick", term],
    enabled: open,
    queryFn: async () => {
      const safe = term.trim().replace(/[%,()]/g, " ");
      let q = supabase.from("customers").select("id, first_name, last_name, account_number").order("first_name").limit(20);
      if (safe) q = q.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,account_number.ilike.%${safe}%`);
      return (await q).data ?? [];
    },
  });
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const s = selected.data;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm">
        <span className={cn(!s && "text-muted-foreground")}>{s ? `${s.first_name} ${s.last_name} · ${s.account_number}` : placeholder}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-elevated">
          <div className="relative border-b">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name or account no." className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none" />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {list.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
            {list.data?.length === 0 && <p className="p-3 text-sm text-muted-foreground">No customers found.</p>}
            {list.data?.map((c) => (
              <button type="button" key={c.id} onClick={() => { onChange(c); setOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{c.first_name} {c.last_name} <span className="text-xs text-muted-foreground">{c.account_number}</span></span>
                {c.id === value && <Check className="size-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
