import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isValidSaId } from "@/lib/finance";
import { friendlyError } from "@/lib/format";

export const customerSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Surname is required").max(100),
  id_number: z.string().trim().refine((v) => isValidSaId(v), "Enter a valid 13-digit South African ID number"),
  phone: z.string().trim().regex(/^\+?[0-9 ]{9,15}$/, "Enter a valid contact number"),
  email: z.string().trim().email("Enter a valid email").max(255).or(z.literal("")),
  address: z.string().trim().max(500),
  employer: z.string().trim().max(200),
  employment_status: z.string(),
  job_title: z.string().trim().max(100),
  monthly_income: z.coerce.number().min(0, "Income cannot be negative").max(100_000_000),
});

type FormState = Record<keyof z.infer<typeof customerSchema>, string>;
const EMPTY: FormState = { first_name: "", last_name: "", id_number: "", phone: "", email: "", address: "", employer: "", employment_status: "permanent", job_title: "", monthly_income: "" };

export const EMPLOYMENT = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "self_employed", label: "Self-employed" },
  { value: "part_time", label: "Part-time" },
  { value: "unemployed", label: "Unemployed" },
  { value: "pensioner", label: "Pensioner" },
];

export function CustomerFormDialog({
  open, onOpenChange, customer, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: (Partial<FormState> & { id: string }) | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = !!customer?.id;

  useEffect(() => {
    if (open) setForm(customer ? { ...EMPTY, ...Object.fromEntries(Object.entries(customer).map(([k, v]) => [k, v == null ? "" : String(v)])) } as FormState : EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const schema = editing && !form.id_number ? customerSchema.extend({ id_number: z.string() }) : customerSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
    setBusy(true);
    try {
      const payload = { ...parsed.data, id_number: parsed.data.id_number.replace(/\s/g, "") };
      let id = customer?.id ?? "";
      if (editing) {
        const { error } = await supabase.rpc("update_customer", { _id: id, _data: payload });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("create_customer", { _data: payload });
        if (error) throw error;
        id = data as string;
      }
      toast.success(editing ? "Customer updated" : "Customer registered");
      qc.invalidateQueries();
      onOpenChange(false);
      onSaved?.(id);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit customer" : "Register new customer"}</DialogTitle>
          <DialogDescription>Personal information is protected under POPIA. Only capture what is needed for credit decisions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>First name(s) *</Label><Input value={form.first_name} onChange={set("first_name")} /></div>
          <div className="space-y-1.5"><Label>Surname *</Label><Input value={form.last_name} onChange={set("last_name")} /></div>
          <div className="space-y-1.5">
            <Label>South African ID number *</Label>
            <Input inputMode="numeric" maxLength={13} value={form.id_number} onChange={set("id_number")} placeholder={editing ? "Leave blank to keep current" : "13 digits"} />
          </div>
          <div className="space-y-1.5"><Label>Contact number *</Label><Input inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="071 234 5678" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Email address</Label><Input type="email" value={form.email} onChange={set("email")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Residential address</Label><Textarea rows={2} value={form.address} onChange={set("address")} /></div>
          <div className="space-y-1.5"><Label>Employer</Label><Input value={form.employer} onChange={set("employer")} /></div>
          <div className="space-y-1.5"><Label>Job title</Label><Input value={form.job_title} onChange={set("job_title")} /></div>
          <div className="space-y-1.5">
            <Label>Employment status</Label>
            <Select value={form.employment_status} onValueChange={(v) => setForm({ ...form, employment_status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EMPLOYMENT.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Monthly income (R)</Label><Input type="number" min={0} step="0.01" value={form.monthly_income} onChange={set("monthly_income")} /></div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={busy}>{busy && <Loader2 className="animate-spin" />} {editing ? "Save changes" : "Register customer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
