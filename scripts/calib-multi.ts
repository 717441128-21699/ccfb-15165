/**
 * 多参数自动标定：对每条船联合搜索 gzSlope / rrScale / 球帆增益 / 滑行因子，
 * 使该船对参考极曲线的平均绝对误差最小。网格由粗到细两轮。
 */
import { BOAT_SPECS } from '../src/physics/boat-specs';
import type { BoatSpec } from '../src/physics/types';
import { runPolar } from '../src/vpp/vpp';
import { interpSpeedKn } from './polar-compare';
import { REFERENCE_POLARS, KN_TO_MS } from '../src/vpp/reference-polars';

function boatError(spec: BoatSpec): number {
  const refByTws = REFERENCE_POLARS[spec.id];
  let sum = 0;
  let n = 0;
  // 标定用精简风角网格（对齐参考表风角），显著降低单次极曲线成本
  const twaGrid = [40, 45, 60, 75, 90, 110, 135, 150, 180];
  for (const twsKnStr of Object.keys(refByTws)) {
    const twsKn = Number(twsKnStr);
    const curve = runPolar(spec, twsKn * KN_TO_MS, twaGrid, { allowReef: true });
    for (const [twa, refKn] of refByTws[twsKn]) {
      const simKn = interpSpeedKn(curve, twa);
      if (simKn === null) continue;
      sum += Math.abs(((simKn - refKn) / refKn) * 100);
      n++;
    }
  }
  return sum / Math.max(1, n);
}

// 每个参数的候选网格（坐标下降，两轮）
const SPACE: Record<string, number[]> = {
  gzSlope: [0.8, 1.2, 1.8, 2.6, 3.6, 5.0, 7.0],
  rrScale: [0.4, 0.55, 0.75, 1.0, 1.3, 1.6],
  planingFactor: [0.45, 0.6, 0.78, 0.9, 0.97],
  spinnakerGain: [1.4, 1.8, 2.2, 2.6, 3.0, 3.4],
  maxHeelDeg: [14, 18, 22, 26, 30, 34],
};

for (const baseSpec of BOAT_SPECS) {
  let best: { spec: BoatSpec; err: number } | null = null;
  // 粗网格：逐维轮换搜索（坐标下降），避免全组合爆炸
  let cur: BoatSpec = { ...baseSpec };
  let curErr = boatError(cur);
  for (let round = 0; round < 2; round++) {
    for (const key of Object.keys(SPACE) as (keyof typeof SPACE)[]) {
      let localBest = cur;
      let localErr = curErr;
      for (const val of SPACE[key]) {
        const trial = { ...cur, [key]: val } as BoatSpec;
        const e = boatError(trial);
        if (e < localErr) {
          localErr = e;
          localBest = trial;
        }
      }
      cur = localBest;
      curErr = localErr;
    }
  }
  best = { spec: cur, err: curErr };
  console.log(
    `${baseSpec.id.padEnd(8)} 误差=${best.err.toFixed(2)}%  gz=${best.spec.gzSlope}  rr=${best.spec.rrScale}  planing=${best.spec.planingFactor}  spin=${best.spec.spinnakerGain}`,
  );
}
