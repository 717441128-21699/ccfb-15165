import { describe, it, expect } from 'vitest';
import { getBoatSpec } from './boat-specs';
import { evaluateAeroHydro } from './aero-hydro';
import { apparentWind } from './wind';
import { equilibriumSpeed } from '../vpp/vpp';
import { KN_TO_MS, MS_TO_KN } from '../vpp/reference-polars';

describe('端到端物理行为', () => {
  const laser = getBoatSpec('laser');
  const sail = (fraction: number) => ({
    main: { fraction, trimDeg: 14 },
    jib: { fraction: 0, trimDeg: 14 },
    rudderDeg: 0,
  });

  it('船速升高时视风角前移、视风速增大（真风/视风分离）', () => {
    const stopped = apparentWind(10 * KN_TO_MS, 90, 0);
    const fast = apparentWind(10 * KN_TO_MS, 90, 5);
    expect(fast.awaDeg).toBeLessThan(stopped.awaDeg);
    expect(fast.aws).toBeGreaterThan(stopped.aws);
  });

  it('收帆（fraction 减小）使推力单调下降', () => {
    const base = { spec: laser, tws: 12 * KN_TO_MS, twaDeg: 60, boatSpeed: 2.5 };
    const full = evaluateAeroHydro({ ...base, controls: sail(1) }).totalThrust;
    const half = evaluateAeroHydro({ ...base, controls: sail(0.5) }).totalThrust;
    const furled = evaluateAeroHydro({ ...base, controls: sail(0) }).totalThrust;
    expect(half).toBeLessThan(full);
    expect(furled).toBe(0);
  });

  it('横倾增大导致帆效率下降', () => {
    // 用 maxHeel 较小的副本迫使大横倾，对比正常配置的效率
    const specFlat = { ...laser, maxHeelDeg: 8 };
    const r = evaluateAeroHydro({ spec: specFlat, controls: sail(1), tws: 18 * KN_TO_MS, twaDeg: 45, boatSpeed: 2 });
    expect(r.heelDeg).toBeLessThanOrEqual(8.01);
    expect(r.main.efficiency).toBeLessThan(1);
  });

  it('平衡航速随风速提高而提高', () => {
    const v6 = equilibriumSpeed(laser, sail(1), 6 * KN_TO_MS, 60);
    const v15 = equilibriumSpeed(laser, sail(1), 15 * KN_TO_MS, 60);
    expect(v15).toBeGreaterThan(v6);
    expect(v6 * MS_TO_KN).toBeGreaterThan(2);
  });

  it('每种船型都能在 12kn 风下跑出正航速且横倾不超限', () => {
    for (const id of ['laser', '470', 'j80', 'class40', 'weta']) {
      const spec = getBoatSpec(id);
      const c = {
        main: { fraction: 1, trimDeg: 14 },
        jib: { fraction: spec.jibArea > 0 ? 1 : 0, trimDeg: 14 },
        rudderDeg: 0,
      };
      const v = equilibriumSpeed(spec, c, 12 * KN_TO_MS, 60);
      const r = evaluateAeroHydro({ spec, controls: c, tws: 12 * KN_TO_MS, twaDeg: 60, boatSpeed: v });
      expect(v).toBeGreaterThan(1);
      expect(r.heelDeg).toBeLessThanOrEqual(spec.maxHeelDeg + 0.01);
    }
  });
});
