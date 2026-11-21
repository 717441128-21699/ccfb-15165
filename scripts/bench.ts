/**
 * 性能基准：测量单帧 evaluateAeroHydro 与一次完整极曲线扫描的耗时。
 * 验收：单帧物理 P95 < 1000 μs。
 */
import { BOAT_SPECS } from '../src/physics/boat-specs';
import { evaluateAeroHydro } from '../src/physics/aero-hydro';
import { runPolar } from '../src/vpp/vpp';
import { KN_TO_MS } from '../src/vpp/reference-polars';

const N = 2000;
const controls = {
  main: { fraction: 1, trimDeg: 14 },
  jib: { fraction: 1, trimDeg: 14 },
  rudderDeg: 0,
};

console.log('== 单帧 evaluateAeroHydro 耗时 ==');
let allPass = true;
for (const spec of BOAT_SPECS) {
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const twa = 30 + (i % 150);
    const speed = 2 + (i % 50) * 0.1;
    const t0 = performance.now();
    evaluateAeroHydro({
      spec,
      controls: { ...controls, jib: { fraction: spec.jibArea > 0 ? 1 : 0, trimDeg: 14 } },
      tws: 12 * KN_TO_MS,
      twaDeg: twa,
      boatSpeed: speed,
    });
    samples.push((performance.now() - t0) * 1000);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p50 = samples[Math.floor(N * 0.5)];
  const p95 = samples[Math.floor(N * 0.95)];
  const p99 = samples[Math.floor(N * 0.99)];
  const ok = p95 < 1000;
  if (!ok) allPass = false;
  console.log(
    `${spec.id.padEnd(8)} 均值=${mean.toFixed(1)}μs P50=${p50.toFixed(1)} P95=${p95.toFixed(1)} P99=${p99.toFixed(1)} ${ok ? '✔' : '✘ >1000μs'}`,
  );
}

console.log('\n== 极曲线扫描耗时（16 个风角 × 全调帆优化）==');
for (const spec of BOAT_SPECS) {
  const t0 = performance.now();
  const curve = runPolar(spec, 12 * KN_TO_MS);
  const ms = performance.now() - t0;
  console.log(`${spec.id.padEnd(8)} ${curve.points.length} 点，耗时 ${ms.toFixed(1)} ms（约 ${(ms / curve.points.length).toFixed(1)} ms/点）`);
}

console.log(allPass ? '\n性能 PASS ✔ 单帧 P95 < 1ms' : '\n性能 FAIL ✘');
process.exit(allPass ? 0 : 1);
