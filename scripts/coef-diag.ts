import { sailCoefs } from '../src/physics/sail-coefs';
import { apparentWind } from '../src/physics/wind';
import { KN_TO_MS } from '../src/vpp/reference-polars';

// 激光 zero speed, TWS 6, TWA 45 → 优化器给的 trim
for (const [twa, trim] of [[45, 19], [90, 53], [45, 12]] as const) {
  const tri = apparentWind(6 * KN_TO_MS, twa, 0.1);
  const alpha = tri.awaDeg - trim;
  const c = sailCoefs(alpha, tri.awaDeg);
  console.log(`TWA=${twa} trim=${trim} AWA=${tri.awaDeg.toFixed(1)} alpha=${alpha.toFixed(1)} cl=${c.cl.toFixed(3)} cd=${c.cd.toFixed(3)} luffing=${c.luffing}`);
}
