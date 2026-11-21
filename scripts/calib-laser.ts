/** 针对激光的多旋钮细搜：rrAreaFactor / rrScale / maxHeel / gz。 */
import { BOAT_SPECS } from '../src/physics/boat-specs';
import type { BoatSpec } from '../src/physics/types';
import { runPolar } from '../src/vpp/vpp';
import { interpSpeedKn } from '../src/vpp/polar-compare';
import { REFERENCE_POLARS, KN_TO_MS } from '../src/vpp/reference-polars';

const TWA_GRID = [40, 42, 45, 52, 60, 75, 90, 110, 135, 150, 180];
function boatError(spec: BoatSpec): number {
  const refByTws = REFERENCE_POLARS[spec.id];
  let sum = 0;
  let n = 0;
  for (const k of Object.keys(refByTws)) {
    const twsKn = Number(k);
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

const base = BOAT_SPECS.find((b) => b.id === 'laser')!;
const SPACE: Record<string, number[]> = {
  rrAreaFactor: [0.22, 0.26, 0.3, 0.32, 0.36],
  rrScale: [0.75, 0.85, 0.92, 1.0],
  maxHeelDeg: [19, 21, 23, 25],
  gzSlope: [2.0, 2.3, 2.6, 3.0],
};
let cur: BoatSpec = { ...base };
let curErr = boatError(cur);
for (let round = 0; round < 3; round++) {
  for (const key of Object.keys(SPACE) as (keyof typeof SPACE)[]) {
    let bs = cur;
    let be = curErr;
    for (const val of SPACE[key]) {
      const trial = { ...cur, [key]: val } as BoatSpec;
      const e = boatError(trial);
      if (e < be) {
        be = e;
        bs = trial;
      }
    }
    cur = bs;
    curErr = be;
  }
}
console.log(
  `laser 误差=${curErr.toFixed(2)}% rrArea=${cur.rrAreaFactor} rrScale=${cur.rrScale} maxHeel=${cur.maxHeelDeg} gz=${cur.gzSlope}`,
);
