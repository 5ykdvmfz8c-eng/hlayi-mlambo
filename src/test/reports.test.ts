import { describe, expect, it } from "vitest";
import { dayAfter, periodRange } from "@/lib/report-period";
import { moneyTotals } from "@/lib/report-export";

describe("report periods", () => {
  it("daily covers just that day", () => {
    expect(periodRange("daily", "2026-11-17")).toEqual({ start: "2026-11-17", end: "2026-11-17" });
  });
  it("weekly runs Monday to Sunday", () => {
    expect(periodRange("weekly", "2026-11-17")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });
  it("monthly covers the whole calendar month", () => {
    expect(periodRange("monthly", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
  it("custom end before start collapses to the start day", () => {
    expect(periodRange("custom", "2026-11-17", "2026-11-01")).toEqual({ start: "2026-11-17", end: "2026-11-17" });
  });
  it("dayAfter rolls over month end", () => {
    expect(dayAfter("2026-11-30")).toBe("2026-12-01");
  });
});

describe("report totals", () => {
  it("sums only money columns, to the cent", () => {
    const cols = [{ key: "ref", label: "Ref" }, { key: "amount", label: "Amount", kind: "money" as const }];
    expect(moneyTotals(cols, [{ ref: "A", amount: 100.1 }, { ref: "B", amount: 200.2 }])).toEqual({ amount: 300.3 });
  });
});
