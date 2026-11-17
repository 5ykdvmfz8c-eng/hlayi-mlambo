import { addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";

export type PeriodKind = "daily" | "weekly" | "monthly" | "custom";

/** Date range (YYYY-MM-DD, inclusive) for a report period. Weeks run Monday to Sunday. */
export function periodRange(kind: PeriodKind, anchor: string, customEnd?: string): { start: string; end: string } {
  const d = parseISO(anchor);
  const f = (x: Date) => format(x, "yyyy-MM-dd");
  switch (kind) {
    case "daily":
      return { start: anchor, end: anchor };
    case "weekly":
      return { start: f(startOfWeek(d, { weekStartsOn: 1 })), end: f(endOfWeek(d, { weekStartsOn: 1 })) };
    case "monthly":
      return { start: f(startOfMonth(d)), end: f(endOfMonth(d)) };
    case "custom": {
      const end = customEnd && customEnd >= anchor ? customEnd : anchor;
      return { start: anchor, end };
    }
  }
}

/** Exclusive upper bound for timestamp filters: the day after `end`. */
export function dayAfter(end: string): string {
  return format(addDays(parseISO(end), 1), "yyyy-MM-dd");
}
