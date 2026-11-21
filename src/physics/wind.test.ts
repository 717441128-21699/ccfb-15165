import { describe, it, expect } from 'vitest';
import { apparentWind, trueWindFromApparent } from './wind';
import { KN_TO_MS, MS_TO_KN } from '../vpp/reference-polars';

describe('视风/真风变换', () => {
  it('零船速时视风等于真风', () => {
    const t = apparentWind(10, 90, 0);
    expect(t.aws).toBeCloseTo(10, 6);
    expect(t.awaDeg).toBeCloseTo(90, 6);
  });

  it('正顶风时视风速=真风速+船速、视风角保持 0', () => {
    const t = apparentWind(8, 0, 3);
    expect(t.aws).toBeCloseTo(11, 6);
    expect(t.awaDeg).toBeCloseTo(0, 6);
  });

  it('船速上来后视风前移（视风角小于真风角）', () => {
    const still = apparentWind(10, 90, 0);
    const moving = apparentWind(10, 90, 5);
    expect(moving.awaDeg).toBeLessThan(still.awaDeg);
    expect(moving.awaDeg).toBeCloseTo(63.4, 0); // atan2(10,5)≈63.4
    expect(moving.aws).toBeGreaterThan(10);
  });

  it('正顺风时视风速=真风速−船速', () => {
    const t = apparentWind(8, 180, 3);
    expect(t.aws).toBeCloseTo(5, 6);
    expect(t.awaDeg).toBeCloseTo(180, 6);
  });

  it('真风与视风互为逆变换', () => {
    const tri = apparentWind(9, 75, 4);
    const back = trueWindFromApparent(tri.aws, tri.awaDeg, 4);
    expect(back.tws).toBeCloseTo(9, 5);
    expect(back.twaDeg).toBeCloseTo(75, 5);
  });

  it('节与米/秒换算正确', () => {
    expect(KN_TO_MS * MS_TO_KN).toBeCloseTo(1, 9);
    expect(10 * KN_TO_MS).toBeCloseTo(5.14444, 4);
  });
});
