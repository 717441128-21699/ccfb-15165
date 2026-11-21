import { describe, it, expect } from 'vitest';
import { interp1, bisect, clamp, normalize180, smoothstep } from './math-utils';

describe('数学工具', () => {
  it('线性插值：端点外夹取、区间内插值', () => {
    const xs = [0, 10, 20];
    const ys = [0, 100, 300];
    expect(interp1(xs, ys, -5)).toBe(0);
    expect(interp1(xs, ys, 5)).toBe(50);
    expect(interp1(xs, ys, 15)).toBe(200);
    expect(interp1(xs, ys, 25)).toBe(300);
  });

  it('对分求根找到符号变化点', () => {
    const root = bisect((x) => x - 3, 0, 10, 1e-6);
    expect(root).toBeCloseTo(3, 3);
  });

  it('clamp 与角度归一化', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(normalize180(370)).toBeCloseTo(10, 6);
    expect(normalize180(-190)).toBeCloseTo(170, 6);
  });

  it('smoothstep 单调且端点为 0/1', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 15)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5, 6);
  });
});
