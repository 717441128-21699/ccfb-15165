import { describe, it, expect } from 'vitest';
import { evaluateAeroHydro, hullResistance } from './aero-hydro';
import { BOAT_SPECS, getBoatSpec } from './boat-specs';
import { KN_TO_MS } from '../vpp/reference-polars';
import { equilibriumSpeed, optimizeTrim, runPolar } from '../vpp/vpp';

const laser = getBoatSpec('laser');
const fullSail = {
  main: { fraction: 1, trimDeg: 12 },
  jib: { fraction: 0, trimDeg: 12 },
  rudderDeg: 0,
};

describe('气水动力联合解算', () => {
  it('收帆比例为零时帆力为零、船不能自航', () => {
    const r = evaluateAeroHydro({
      spec: laser,
      controls: { main: { fraction: 0, trimDeg: 10 }, jib: { fraction: 0, trimDeg: 10 }, rudderDeg: 0 },
      tws: 10 * KN_TO_MS,
      twaDeg: 60,
      boatSpeed: 2,
    });
    expect(r.totalThrust).toBe(0);
    expect(r.netLongitudinal).toBeLessThan(0);
  });

  it('正常风况产生正推力、正横倾、正侧滑', () => {
    const r = evaluateAeroHydro({
      spec: laser,
      controls: fullSail,
      tws: 8 * KN_TO_MS,
      twaDeg: 60,
      boatSpeed: 2,
    });
    expect(r.totalThrust).toBeGreaterThan(0);
    expect(r.totalSideForce).toBeGreaterThan(0);
    expect(r.heelDeg).toBeGreaterThan(0);
    expect(r.heelDeg).toBeLessThanOrEqual(laser.maxHeelDeg + 0.01);
    expect(r.leewayDeg).toBeGreaterThan(0);
  });

  it('横倾角永远不超过该船最大可持续值', () => {
    for (const spec of BOAT_SPECS) {
      const r = evaluateAeroHydro({
        spec,
        controls: {
          main: { fraction: 1, trimDeg: 15 },
          jib: { fraction: spec.jibArea > 0 ? 1 : 0, trimDeg: 15 },
          rudderDeg: 0,
        },
        tws: 25 * KN_TO_MS,
        twaDeg: 45,
        boatSpeed: 1,
      });
      expect(r.heelDeg).toBeLessThanOrEqual(spec.maxHeelDeg + 0.01);
    }
  });

  it('船体阻力随航速单调增长且为正', () => {
    const r1 = hullResistance(laser, 1);
    const r2 = hullResistance(laser, 3);
    const r3 = hullResistance(laser, 6);
    expect(r1).toBeGreaterThan(0);
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2);
  });

  it('平衡航速处净纵向力近似为零', () => {
    const v = equilibriumSpeed(laser, fullSail, 10 * KN_TO_MS, 60);
    const r = evaluateAeroHydro({ spec: laser, controls: fullSail, tws: 10 * KN_TO_MS, twaDeg: 60, boatSpeed: v });
    expect(Math.abs(r.netLongitudinal)).toBeLessThan(30);
    expect(v).toBeGreaterThan(0);
  });

  it('优化调帆比任意糟糕调帆更快', () => {
    const good = optimizeTrim(laser, 10 * KN_TO_MS, 60).speed;
    const bad = equilibriumSpeed(
      laser,
      { main: { fraction: 1, trimDeg: 2 }, jib: { fraction: 0, trimDeg: 2 }, rudderDeg: 0 },
      10 * KN_TO_MS,
      60,
    );
    expect(good).toBeGreaterThan(bad);
  });

  it('极曲线扫描覆盖迎风到顺风且速度为正', () => {
    const curve = runPolar(laser, 10 * KN_TO_MS);
    expect(curve.points.length).toBeGreaterThan(10);
    expect(curve.points[0].twaDeg).toBeLessThan(45);
    expect(curve.points[curve.points.length - 1].twaDeg).toBe(180);
    for (const p of curve.points) expect(p.boatSpeed).toBeGreaterThan(0);
  });
});
