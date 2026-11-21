import { BOAT_SPECS } from '../src/physics/boat-specs';
import { optimizeTrim } from '../src/vpp/vpp';
import { evaluateAeroHydro, hullResistance } from '../src/physics/aero-hydro';
import { MS_TO_KN, KN_TO_MS } from '../src/vpp/reference-polars';

const id = process.argv[2] ?? 'laser';
const twsKn = Number(process.argv[3] ?? 15);
const spec = BOAT_SPECS.find((b) => b.id === id)!;

for (const twa of [45, 75, 90, 135]) {
  const { controls, speed } = optimizeTrim(spec, twsKn * KN_TO_MS, twa);
  const r = evaluateAeroHydro({ spec, controls, tws: twsKn * KN_TO_MS, twaDeg: twa, boatSpeed: speed });
  const bare = hullResistance(spec, speed);
  console.log(
    `TWA=${twa} v=${(speed * MS_TO_KN).toFixed(2)}kn heel=${r.heelDeg.toFixed(1)}° reefM=${controls.main.fraction} reefJ=${controls.jib.fraction} trim=${controls.main.trimDeg.toFixed(0)}/${controls.jib.trimDeg.toFixed(0)} AWA=${r.apparentWindAngleDeg.toFixed(0)}° aoa=${r.main.aoaDeg.toFixed(0)}° T=${r.totalThrust.toFixed(0)}N R=${r.hullResistance.toFixed(0)}N (bare=${bare.toFixed(0)}) leeway=${r.leewayDeg.toFixed(1)}°`,
  );
}
console.log('hullSpeed=', (spec.hullSpeedCoef * Math.sqrt(spec.lwl) * MS_TO_KN).toFixed(2), 'kn');
