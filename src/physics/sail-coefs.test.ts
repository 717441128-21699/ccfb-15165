import { describe, it, expect } from 'vitest';
import { sailCoefs } from './sail-coefs';

describe('帆升力/阻力系数', () => {
  it('小攻角升力随攻角近似线性增长', () => {
    const c6 = sailCoefs(6, 30);
    const c12 = sailCoefs(12, 30);
    expect(c12.cl).toBeGreaterThan(c6.cl);
    expect(c6.cd).toBeLessThan(0.05);
  });

  it('峰值升力出现在 12~18°，之后失速', () => {
    const peak = sailCoefs(15, 30).cl;
    const stalled = sailCoefs(35, 30).cl;
    expect(peak).toBeGreaterThan(1.6);
    expect(stalled).toBeLessThan(peak);
    expect(sailCoefs(35, 30).cd).toBeGreaterThan(0.4);
  });

  it('90° 攻角只剩阻力、升力归零', () => {
    const c = sailCoefs(90, 90);
    expect(c.cl).toBeCloseTo(0, 1);
    expect(c.cd).toBeGreaterThan(1.0);
  });

  it('负攻角判为飘帆且升力崩掉', () => {
    const c = sailCoefs(-5, 30);
    expect(c.luffing).toBe(true);
    expect(Math.abs(c.cl)).toBeLessThan(0.3);
  });

  it('深顺风采用球帆特性，阻力推进系数更高', () => {
    const up = sailCoefs(90, 60).cd;
    const down = sailCoefs(120, 140).cd;
    expect(down).toBeGreaterThan(up);
  });
});
