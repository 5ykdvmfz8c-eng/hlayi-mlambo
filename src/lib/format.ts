import { format, parseISO } from "date-fns";

const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return zar.format(Number.isFinite(n) ? n : 0).replace("ZAR", "R");
}

export function moneyShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `R${(value / 1_000).toFixed(0)}k`;
  return `R${value.toFixed(0)}`;
}

export function toDate(value: string | Date): Date {
  return typeof value === "string" ? (value.length <= 10 ? parseISO(value) : new Date(value)) : value;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(toDate(value), "dd/MM/yyyy");
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(toDate(value), "dd/MM/yyyy HH:mm");
}

/** Today's date in South Africa as YYYY-MM-DD. */
export function saToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
}

export function maskId(id: string | null | undefined): string {
  if (!id) return "••••••••••••";
  return `${id.slice(0, 6)} •••• ${id.slice(-3)}`;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function friendlyError(err: unknown): string {
  const msg =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
  if (msg.includes("repayments_reference_uniq")) return "This transaction reference has already been recorded.";
  if (msg.includes("customer_private_id_number_key")) return "A customer with this ID number is already registered.";
  if (msg.includes("row-level security")) return "You do not have permission to perform this action.";
  if (msg.includes("permission denied")) return "You do not have permission to perform this action.";
  return msg;
}
