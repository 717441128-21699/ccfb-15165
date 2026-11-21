/**
 * 自动标定 gzSlope（小横倾扶正力臂斜率）。
 * 对每条船在给定网格上搜索使参考极曲线平均绝对误差最小的值，输出建议参数。
 */
import { BOAT_SPECS } from '../src/physics/boat-specs';
import type { BoatSpec } from '../src/physics/types';
import { runPolar } from '../src/vpp/vpp';
import { INTERP_TWA, interpSpeedKn } from './polar-compare';
import { REFERENCE_POLARS, KN_TO_MS } from '../src/vpp/reference-polars';

const GRID = [0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.6, 4.3, 5.1, 6.0, 7.2];

function boatError(spec: BoatSpec): { mean: number } {
  const refByTws = REFERENCE_POLARS[spec.id];
  let sum = 0;
  let n = 0;
  for (const twsKnStr of Object.keys(refByTws)) {
    const twsKn = Number(twsKnStr);
    const curve = runPolar(spec, twsKn * KN_TO_MS, INTERP_TWA, { allowReef: true });
    for (const [twa, refKn] of refByTws[twsKn]) {
      const simKn = interpSpeedKn(curve, twa);
      if (simKn === null) continue;
      sum += Math.abs(((simKn - refKn) / refKn) * 100);
      n++;
    }
  }
  return { mean: sum / Math.max(1, n) };
}

for (const baseSpec of BOAT_SPECS) {
  let best = { gz: GRID[0], err: Infinity };
  for (const gz of GRID) {
    const spec = { ...baseSpec, gzSlope: gz };
    const { mean } = boatError(spec);
    if (mean < best.err) best = { gz, err: mean };
  }
  console.log(`${baseSpec.id.padEnd(8)} 最佳 gzSlope=${best.gz}  平均误差=${best.err.toFixed(2)}%`);
}
