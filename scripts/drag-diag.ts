import { BOAT_SPECS } from '../src/physics/boat-specs';
import { KN_TO_MS } from '../src/vpp/reference-polars';
import { hullResistance } from '../src/physics/aero-hydro';

const RHO_WATER = 1025;
const G = 9.81;
const nu = 1.19e-6;
const id = process.argv[2] ?? 'laser';
const spec = BOAT_SPECS.find((b) => b.id === id)!;
const rrArea = spec.rrAreaFactor * spec.lwl ** 2;
console.log(`${id}  rrArea=${rrArea.toFixed(2)}m2  wetted=${spec.wettedArea}m2  planing=${spec.planingFactor}`);
for (const kn of [4, 5.3, 6, 8, 10, 13]) {
  const speed = kn * KN_TO_MS;
  const q = 0.5 * RHO_WATER * speed * speed;
  const rn = (speed * spec.lwl) / nu;
  const cf = 0.075 / Math.pow(Math.log10(rn) - 2, 2);
  const fn = speed / Math.sqrt(G * spec.lwl);
  const total = hullResistance(spec, speed);
  const frictionBare = cf * q * spec.wettedArea * spec.dragShapeFactor;
  const crEquiv = (total - frictionBare) / (q * rrArea);
  console.log(
    `v=${kn}kn Fr=${fn.toFixed(2)} friction~${frictionBare.toFixed(0)}N total=${total.toFixed(0)}N CrEquiv=${crEquiv.toFixed(4)}`,
  );
}
