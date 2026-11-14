export type Frequency = "weekly" | "fortnightly" | "monthly";
export type RiskBand = "excellent" | "good" | "fair" | "poor" | "high_risk";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mirrors the database calculation: flat interest on principal, plus once-off fees. */
export function computeLoanTerms(input: {
  principal: number;
  interestRate: number;
  fees: number;
  instalments: number;
}) {
  const principal = round2(input.principal || 0);
  const interestAmount = round2((principal * (input.interestRate || 0)) / 100);
  const fees = round2(input.fees || 0);
  const totalRepayable = round2(principal + interestAmount + fees);
  const n = Math.max(1, Math.floor(input.instalments || 1));
  const instalmentAmount = round2(totalRepayable / n);
  return { principal, interestAmount, fees, totalRepayable, instalmentAmount, instalments: n };
}

export function instalmentDueDate(first: string, freq: Frequency, k: number): string {
  const [y, m, d] = first.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (freq === "weekly") base.setUTCDate(base.getUTCDate() + 7 * k);
  else if (freq === "fortnightly") base.setUTCDate(base.getUTCDate() + 14 * k);
  else {
    const target = new Date(Date.UTC(y, m - 1 + k, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
  }
  return base.toISOString().slice(0, 10);
}

export function buildSchedule(first: string, freq: Frequency, n: number, instalment: number, total: number) {
  return Array.from({ length: n }, (_, k) => ({
    number: k + 1,
    dueDate: instalmentDueDate(first, freq, k),
    amount: k === n - 1 ? round2(total - instalment * (n - 1)) : instalment,
  }));
}

export const RISK_BANDS: { band: RiskBand; label: string; min: number; max: number }[] = [
  { band: "excellent", label: "Excellent", min: 800, max: 999 },
  { band: "good", label: "Good", min: 700, max: 799 },
  { band: "fair", label: "Fair", min: 600, max: 699 },
  { band: "poor", label: "Poor", min: 500, max: 599 },
  { band: "high_risk", label: "High Risk", min: 0, max: 499 },
];

/** Mirrors public.compute_risk_band in the database. */
export function riskBandFor(score: number | null | undefined): RiskBand | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 800) return "excellent";
  if (score >= 700) return "good";
  if (score >= 600) return "fair";
  if (score >= 500) return "poor";
  return "high_risk";
}

export type LedgerRow = { txn_date: string; created_at: string; description: string; debit: number; credit: number };

/** Running balance for a statement: opening + debits − credits, in date order. */
export function withRunningBalance<T extends LedgerRow>(rows: T[], opening = 0) {
  const sorted = [...rows].sort((a, b) =>
    a.txn_date === b.txn_date ? a.created_at.localeCompare(b.created_at) : a.txn_date.localeCompare(b.txn_date),
  );
  let balance = opening;
  return sorted.map((r) => {
    balance = round2(balance + Number(r.debit) - Number(r.credit));
    return { ...r, balance };
  });
}

/** Valid South African ID: 13 digits, valid date of birth, Luhn checksum. */
export function isValidSaId(raw: string): boolean {
  const id = raw.replace(/\s/g, "");
  if (!/^\d{13}$/.test(id)) return false;
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = Number(id[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
