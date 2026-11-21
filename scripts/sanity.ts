import { BOAT_SPECS } from '../src/physics/boat-specs';
import { evaluateAeroHydro } from '../src/physics/aero-hydro';
import { equilibriumSpeed } from '../src/vpp/vpp';
import { MS_TO_KN } from '../src/vpp/reference-polars';

const spec = BOAT_SPECS.find((b) => b.id === 'laser')!;
const controls = {
  main: { fraction: 1, trimDeg: 12 },
  jib: { fraction: 0, trimDeg: 12 },
  rudderDeg: 0,
};
for (const twa of [45, 90, 135, 180]) {
  const v = equilibriumSpeed(spec, controls, 10 * 0.514444, twa);
  const r = evaluateAeroHydro({ spec, controls, tws: 10 * 0.514444, twaDeg: twa, boatSpeed: v });
  console.log(
    `TWA=${twa}° v=${(v * MS_TO_KN).toFixed(2)}kn AWA=${r.apparentWindAngleDeg.toFixed(1)}° AWS=${(r.apparentWindSpeed * MS_TO_KN).toFixed(2)}kn heel=${r.heelDeg.toFixed(1)}° leeway=${r.leewayDeg.toFixed(1)}° thrust=${r.totalThrust.toFixed(0)}N R=${r.hullResistance.toFixed(0)}N aoa=${r.main.aoaDeg.toFixed(1)}°`,
  );
}
