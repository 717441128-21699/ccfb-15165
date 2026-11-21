import { BOAT_SPECS } from '../src/physics/boat-specs';
import { KN_TO_MS } from '../src/vpp/reference-polars';
import { evaluateAeroHydro } from '../src/physics/aero-hydro';

const G = 9.81;
for (const id of ['laser', 'j80', 'class40']) {
  const spec = BOAT_SPECS.find((b) => b.id === id)!;
  // 全展、固定 trim，逐风速测零航速帆力（此时 boatSpeed 小、无泄力干扰需看 HM vs maxRM）
  console.log(`\n== ${id} ==`);
  const base = spec.rmCoef * spec.mass * G * spec.lwl;
  const rmMax = base * Math.sin((spec.maxHeelDeg * Math.PI) / 180);
  console.log(`RM@${spec.maxHeelDeg}°=${rmMax.toFixed(0)}Nm  对应限侧力=${(rmMax / spec.sailCEHeight).toFixed(0)}N`);
  for (const twsKn of [6, 12, 20]) {
    const controls = {
      main: { fraction: 1, trimDeg: 15 },
      jib: { fraction: 1, trimDeg: 15 },
      rudderDeg: 0,
    };
    const r = evaluateAeroHydro({ spec, controls, tws: twsKn * KN_TO_MS, twaDeg: 45, boatSpeed: 0.1 });
    console.log(
      `TWS=${String(twsKn).padStart(2)} AWA=${r.apparentWindAngleDeg.toFixed(0)}° 原始侧力≈${(r.totalSideForce / Math.max(0.01, r.main.efficiency)).toFixed(0)}N 报告侧力=${r.totalSideForce.toFixed(0)} heel=${r.heelDeg.toFixed(1)}° 主帆eff=${r.main.efficiency.toFixed(2)}`,
    );
  }
}
