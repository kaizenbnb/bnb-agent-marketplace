import type { HealthFactorGaugeData } from "@/lib/agents";

export default function HealthFactorGauge({ before, after, threshold }: HealthFactorGaugeData) {
  const min = Math.min(before, after, threshold) - 0.25;
  const max = Math.max(before, after, threshold) + 0.25;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const beforePct = pct(before);
  const afterPct = pct(after);
  const thresholdPct = pct(threshold);
  const linePct = { left: Math.min(beforePct, afterPct), width: Math.abs(afterPct - beforePct) };

  return (
    <div className="rounded-lg border border-bnb-line bg-bnb-card p-5">
      <div className="flex items-center justify-between text-xs text-bnb-muted">
        <span className="font-semibold uppercase tracking-wide">Health Factor</span>
        <span>Threshold {threshold.toFixed(2)}</span>
      </div>

      <div className="relative mt-8 h-1.5 rounded-full bg-bnb-carbon">
        {/* connecting line from before -> after, under the dots */}
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-red-500 to-emerald-400"
          style={{ left: `${linePct.left}%`, width: `${linePct.width}%` }}
        />

        {/* threshold tick */}
        <div
          className="absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-bnb-muted"
          style={{ left: `${thresholdPct}%` }}
        />
        <span
          className="absolute top-4 -translate-x-1/2 text-[10px] text-bnb-muted"
          style={{ left: `${thresholdPct}%` }}
        >
          1.0
        </span>

        {/* before marker */}
        <div
          className="absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bnb-card bg-red-500"
          style={{ left: `${beforePct}%` }}
        />
        {/* after marker */}
        <div
          className="absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bnb-card bg-emerald-400"
          style={{ left: `${afterPct}%` }}
        />
      </div>

      <div className="mt-7 flex items-center justify-between">
        <div>
          <div className="font-mono text-lg font-semibold text-red-400">{before.toFixed(4)}</div>
          <div className="text-xs text-bnb-muted">Before — at risk</div>
        </div>
        <span className="text-xl text-bnb-gold">&rarr;</span>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold text-emerald-400">{after.toFixed(4)}</div>
          <div className="text-xs text-bnb-muted">After — rescued</div>
        </div>
      </div>
    </div>
  );
}
