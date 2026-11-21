import { BOAT_SPECS } from '../src/physics/boat-specs';
import { optimizeTrim } from '../src/vpp/vpp';
import { evaluateAeroHydro } from '../src/physics/aero-hydro';
import { KN_TO_MS, MS_TO_KN } from '../src/vpp/reference-polars';

const G = 9.81;
function rmOf(spec: (typeof BOAT_SPECS)[number], phiDeg: number): number {
  const disp = spec.mass * G;
  const phi = (phiDeg * Math.PI) / 180;
  if (spec.multihull) {
    const t = Math.min(1, phiDeg / 55);
    return disp * spec.gzSlope * 2.2 * Math.sin(phi) * (1 - 0.25 * t * t);
  }
  const falloff = 1 - 0.006 * Math.max(0, phiDeg - 25) ** 1.6;
  return disp * spec.gzSlope * Math.sin(phi) * falloff;
}

for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['laser', 'j80', 'class40', 'weta']) {
  const spec = BOAT_SPECS.find((b) => b.id === id)!;
  const rmMax = rmOf(spec, spec.maxHeelDeg);
  const maxSide = rmMax / spec.sailCEHeight;
  console.log(`\n== ${id} maxHeel=${spec.maxHeelDeg}° RM@cap=${rmMax.toFixed(0)}Nm 限侧力=${maxSide.toFixed(0)}N ==`);
  for (const twsKn of [6, 10, 15, 20, 25]) {
    if ((id === 'laser' || id === '470') && twsKn > 20) continue;
    const { controls, speed } = optimizeTrim(spec, twsKn * KN_TO_MS, 45);
    const r = evaluateAeroHydro({ spec, controls, tws: twsKn * KN_TO_MS, twaDeg: 45, boatSpeed: speed });
    const dump = r.totalSideForce >= maxSide * 0.999 ? '泄力' : '正常';
    console.log(
      `TWS=${String(twsKn).padStart(2)} v=${(speed * MS_TO_KN).toFixed(1)}kn heel=${r.heelDeg.toFixed(1)}° 侧力=${r.totalSideForce.toFixed(0)}/${maxSide.toFixed(0)} ${dump} reef=${controls.main.fraction}`,
    );
  }
}
