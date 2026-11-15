import { riskBandFor } from "@/lib/finance";
import { riskLabel } from "./kit";

const BAND_COLOR: Record<string, string> = {
  excellent: "var(--color-success)", good: "var(--color-primary)", fair: "var(--color-warning)", poor: "var(--color-chart-4)", high_risk: "var(--color-destructive)",
};

/** Semicircle gauge from 300 to 850 (scores outside clamp to the ends). */
export function ScoreGauge({ score }: { score: number | null | undefined }) {
  const min = 300, max = 850;
  const pct = score == null ? 0 : Math.max(0, Math.min(1, (score - min) / (max - min)));
  const band = riskBandFor(score ?? null);
  const r = 80, cx = 100, cy = 95;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - to);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  const segs: [number, number, string][] = [
    [0, 0.364, BAND_COLOR.high_risk], [0.364, 0.545, BAND_COLOR.poor], [0.545, 0.727, BAND_COLOR.fair], [0.727, 0.909, BAND_COLOR.good], [0.909, 1, BAND_COLOR.excellent],
  ];
  const needle = Math.PI * (1 - pct);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-56" role="img" aria-label={score == null ? "No score recorded" : `Credit score ${score}`}>
        {segs.map(([a, b, c], i) => <path key={i} d={arc(a + 0.004, b - 0.004)} stroke={c} strokeWidth={14} fill="none" strokeLinecap="butt" opacity={score == null ? 0.25 : 1} />)}
        {score != null && <line x1={cx} y1={cy} x2={cx + (r - 22) * Math.cos(needle)} y2={cy - (r - 22) * Math.sin(needle)} stroke="var(--color-navy)" strokeWidth={3} strokeLinecap="round" />}
        <circle cx={cx} cy={cy} r={5} fill="var(--color-navy)" />
      </svg>
      <p className="-mt-2 font-display text-4xl font-semibold text-navy tabular">{score ?? "—"}</p>
      <p className="text-sm font-semibold" style={{ color: band ? BAND_COLOR[band] : undefined }}>{score == null ? "No score recorded" : riskLabel(band)}</p>
    </div>
  );
}
