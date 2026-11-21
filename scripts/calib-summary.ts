/** 快速校准汇总：按船 × 风段（近迎风≤52 / 侧顺风 53~110 / 顺风>110）输出平均误差。 */
import { BOAT_SPECS } from '../src/physics/boat-specs';
import { runPolar } from '../src/vpp/vpp';
import { INTERP_TWA, interpSpeedKn } from './polar-compare';
import { REFERENCE_POLARS, KN_TO_MS } from '../src/vpp/reference-polars';

function band(twa: number): string {
  if (twa <= 52) return '近迎风';
  if (twa <= 110) return '侧顺风';
  return '顺风  ';
}

for (const spec of BOAT_SPECS) {
  const refByTws = REFERENCE_POLARS[spec.id];
  console.log(`\n== ${spec.id} ==`);
  for (const twsKnStr of Object.keys(refByTws)) {
    const twsKn = Number(twsKnStr);
    const curve = runPolar(spec, twsKn * KN_TO_MS, INTERP_TWA, { allowReef: true });
    const acc: Record<string, { sum: number; n: number; max: number }> = {};
    for (const [twa, refKn] of refByTws[twsKn]) {
      const simKn = interpSpeedKn(curve, twa)!;
      const pct = ((simKn - refKn) / refKn) * 100;
      const b = band(twa);
      acc[b] ??= { sum: 0, n: 0, max: 0 };
      acc[b].sum += pct;
      acc[b].n += 1;
      acc[b].max = Math.max(acc[b].max, Math.abs(pct));
    }
    const parts = Object.entries(acc).map(([b, s]) => `${b} 均${(s.sum / s.n).toFixed(1)}% 峰${s.max.toFixed(0)}%`);
    console.log(`TWS=${String(twsKn).padStart(2)}kn  ${parts.join(' | ')}`);
  }
}
