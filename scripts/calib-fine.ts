/**
 * 细化标定：只针对指定船，在当前最优点附近做局部加密网格 + 坐标下降。
 * 用法：node calib-fine.js laser 470 weta
 */
import { BOAT_SPECS } from '../src/physics/boat-specs';
import type { BoatSpec } from '../src/physics/types';
import { runPolar } from '../src/vpp/vpp';
import { interpSpeedKn } from './polar-compare';
import { REFERENCE_POLARS, KN_TO_MS } from '../src/vpp/reference-polars';

const TARGETS = process.argv.slice(2);
const TWA_GRID = [40, 45, 52, 60, 75, 90, 110, 135, 150, 180];

function boatError(spec: BoatSpec): number {
  const refByTws = REFERENCE_POLARS[spec.id];
  let sum = 0;
  let n = 0;
  for (const twsKnStr of Object.keys(refByTws)) {
    const twsKn = Number(twsKnStr);
    const curve = runPolar(spec, twsKn * KN_TO_MS, TWA_GRID, { allowReef: true });
    for (const [twa, refKn] of refByTws[twsKn]) {
      const simKn = interpSpeedKn(curve, twa);
      if (simKn === null) continue;
      sum += Math.abs(((simKn - refKn) / refKn) * 100);
      n++;
    }
  }
  return sum / Math.max(1, n);
}

// 在当前值附近构造局部网格
const around = (v: number, fracs: number[]): number[] => fracs.map((f) => Number((v * f).toFixed(3)));

for (const id of TARGETS) {
  const base = BOAT_SPECS.find((b) => b.id === id)!;
  let cur: BoatSpec = { ...base };
  let curErr = boatError(cur);
  const SPACE: Record<string, number[]> = {
    gzSlope: around(base.gzSlope, [0.55, 0.75, 1, 1.35, 1.8, 2.4]),
    rrScale: around(base.rrScale, [0.65, 0.82, 1, 1.22]),
    spinnakerGain: around(base.spinnakerGain, [0.75, 0.9, 1, 1.12, 1.28]),
    maxHeelDeg: [base.maxHeelDeg - 5, base.maxHeelDeg - 2, base.maxHeelDeg, base.maxHeelDeg + 4],
  };
  for (let round = 0; round < 3; round++) {
    for (const key of Object.keys(SPACE) as (keyof typeof SPACE)[]) {
      let bestSpec = cur;
      let bestErr = curErr;
      for (const val of SPACE[key]) {
        const trial = { ...cur, [key]: val } as BoatSpec;
        const e = boatError(trial);
        if (e < bestErr) {
          bestErr = e;
          bestSpec = trial;
        }
      }
      cur = bestSpec;
      curErr = bestErr;
    }
  }
  console.log(
    `${id.padEnd(8)} 误差=${curErr.toFixed(2)}%  gz=${cur.gzSlope}  rr=${cur.rrScale}  spin=${cur.spinnakerGain}  maxHeel=${cur.maxHeelDeg}`,
  );
}
