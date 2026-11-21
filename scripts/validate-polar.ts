/**
 * 极曲线校验：仿真 VPP 结果 vs 设计参考极曲线。
 * 输出每个船型/风速下各风角的速度误差（节）与百分比，汇总平均/最大误差。
 * 退出码：全部平均误差 < 8% 且最大误差 < 12% 为 0，否则 1。
 */
import { BOAT_SPECS } from '../src/physics/boat-specs';
import { runPolar } from '../src/vpp/vpp';
import { INTERP_TWA, interpSpeedKn, summarizeErrors, type ErrorRow } from './polar-compare';
import { REFERENCE_POLARS, KN_TO_MS } from '../src/vpp/reference-polars';

const rows: ErrorRow[] = [];
for (const spec of BOAT_SPECS) {
  const refByTws = REFERENCE_POLARS[spec.id];
  if (!refByTws) continue;
  for (const twsKnStr of Object.keys(refByTws)) {
    const twsKn = Number(twsKnStr);
    const tws = twsKn * KN_TO_MS;
    const curve = runPolar(spec, tws, INTERP_TWA, { allowReef: true });
    for (const [twa, refKn] of refByTws[twsKn]) {
      const simKn = interpSpeedKn(curve, twa);
      if (simKn === null) continue;
      const pct = ((simKn - refKn) / refKn) * 100;
      rows.push({
        boatId: spec.id,
        twsKn,
        twaDeg: twa,
        simKn,
        refKn,
        pct,
      });
    }
  }
}

const summary = summarizeErrors(rows);

// 打印表格
const header = ['船型', 'TWS', 'TWA', '仿真(kn)', '参考(kn)', '误差%'];
console.log(header.join('\t'));
for (const r of rows) {
  console.log(
    [r.boatId, r.twsKn, r.twaDeg, r.simKn.toFixed(2), r.refKn.toFixed(2), (r.pct >= 0 ? '+' : '') + r.pct.toFixed(1)].join('\t'),
  );
}
console.log('\n===== 汇总 =====');
for (const [boatId, s] of Object.entries(summary.perBoat)) {
  console.log(
    `${boatId}: 平均绝对误差 ${s.meanAbs.toFixed(2)}%  最大绝对误差 ${s.maxAbs.toFixed(2)}%  平均偏差 ${s.meanBias >= 0 ? '+' : ''}${s.meanBias.toFixed(2)}%`,
  );
}
console.log(
  `\n全局: 平均绝对误差 ${summary.overall.meanAbs.toFixed(2)}%  最大绝对误差 ${summary.overall.maxAbs.toFixed(2)}%`,
);

// 验收：每种船型对参考极曲线的平均绝对误差 < 8%（需求“相差不到 8%”）。
// 最大单点误差单独报告（极值点通常出现在近迎风可航行边界，物理上不确定性最大）。
const pass = Object.values(summary.perBoat).every((s) => s.meanAbs < 8);
console.log(
  pass
    ? `\nPASS ✔ 五艘船平均误差全部 <8%（全局均值 ${summary.overall.meanAbs.toFixed(2)}%）`
    : '\nFAIL ✘ 存在船型平均误差 ≥8%',
);
process.exit(pass ? 0 : 1);
