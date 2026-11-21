/**
 * Velocity Prediction Program：给定真风，求平衡航速与最优调帆。
 *
 * - equilibriumSpeed：固定调帆下，对分求净纵向力为零的航速；
 * - optimizeTrim：粗网格 + 局部细分搜索主帆/前帆调帆角（与可选收帆比例）；
 * - runPolar：扫描真风角 30°~180°，输出极曲线点（含 VMG、横倾、侧滑、视风）。
 */

import type { BoatSpec, SailingControls } from '../physics/types';
import { evaluateAeroHydro } from '../physics/aero-hydro';
import { bisect, clamp, gridMaximize } from '../physics/math-utils';

export interface PolarPoint {
  twaDeg: number;
  tws: number;
  boatSpeed: number;
  vmg: number;
  aws: number;
  awaDeg: number;
  heelDeg: number;
  leewayDeg: number;
  mainTrimDeg: number;
  jibTrimDeg: number;
  mainFraction: number;
  jibFraction: number;
  thrust: number;
  resistance: number;
}

export interface PolarCurve {
  boatId: string;
  tws: number;
  points: PolarPoint[];
}

export interface OptimizeOptions {
  /** 粗网格步数（每帆） */
  coarse?: number;
  /** 局部细分级数 */
  refine?: number;
  /** 是否允许自动收帆（大风时） */
  allowReef?: boolean;
}

/** 固定调帆下的平衡航速：推力=阻力的解。 */
export function equilibriumSpeed(
  spec: BoatSpec,
  controls: SailingControls,
  tws: number,
  twaDeg: number,
  maxSpeed = 40,
): number {
  const f = (v: number) =>
    evaluateAeroHydro({ spec, controls, tws, twaDeg, boatSpeed: v }).netLongitudinal;
  const f0 = f(0);
  if (f0 <= 0) return 0; // 帆都没展开或完全顶风
  // 高航速端若仍为正（极端情况），扩大上限
  let hi = maxSpeed;
  while (f(hi) > 0 && hi < 120) hi *= 1.5;
  if (f(hi) > 0) return hi;
  return clamp(bisect(f, 0, hi, 1e-3, 30), 0, hi);
}

/**
 * 搜索给定风况下使平衡航速最大的调帆方案。
 * 主帆与前帆采用联合粗网格 + 逐帆轮换细化。
 */
export function optimizeTrim(
  spec: BoatSpec,
  tws: number,
  twaDeg: number,
  opts: OptimizeOptions = {},
): { controls: SailingControls; speed: number; point: PolarPoint | null } {
  const coarse = opts.coarse ?? 7;
  const refine = opts.refine ?? 6;
  const allowReef = opts.allowReef ?? true;
  const hasJib = spec.jibArea > 0;

  // 调帆角范围随风角放宽
  const trimLo = clamp(twaDeg - 78, 3, 85);
  const trimHi = clamp(twaDeg + 6, trimLo + 4, 90);

  const build = (mainTrim: number, jibTrim: number, mainF: number, jibF: number): SailingControls => ({
    main: { fraction: mainF, trimDeg: mainTrim },
    jib: { fraction: hasJib ? jibF : 0, trimDeg: jibTrim },
    rudderDeg: 0,
  });

  const speedOf = (c: SailingControls) => equilibriumSpeed(spec, c, tws, twaDeg);

  // 收帆策略：横倾逼近可持续极限就需要，先全展评估，逐档收帆
  const reefLevels = allowReef ? [1, 0.85, 0.7, 0.55] : [1];
  let best: { controls: SailingControls; speed: number } | null = null;

  for (const reef of reefLevels) {
    const mainF = reef;
    const jibF = reef;
    // 联合粗网格
    let bm = trimLo;
    let bj = trimLo;
    let bs = -1;
    const step = (trimHi - trimLo) / coarse;
    for (let i = 0; i <= coarse; i++) {
      const mt = trimLo + i * step;
      const jSteps = hasJib ? coarse : 0;
      for (let j = 0; j <= jSteps; j++) {
        const jt = hasJib ? trimLo + j * step : mt;
        const c = build(mt, jt, mainF, jibF);
        const s = speedOf(c);
        if (s > bs) {
          bs = s;
          bm = mt;
          bj = jt;
        }
      }
    }
    // 逐维轮换细化
    for (let pass = 0; pass < 2; pass++) {
      const rm = gridMaximize(
        (mt) => speedOf(build(mt, bj, mainF, jibF)),
        Math.max(trimLo, bm - step),
        Math.min(trimHi, bm + step),
        refine,
        refine,
      );
      bm = rm.x;
      bs = rm.f;
      if (hasJib) {
        const rj = gridMaximize(
          (jt) => speedOf(build(bm, jt, mainF, jibF)),
          Math.max(trimLo, bj - step),
          Math.min(trimHi, bj + step),
          refine,
          refine,
        );
        bj = rj.x;
        bs = rj.f;
      }
    }
    if (!best || bs > best.speed) {
      best = { controls: build(bm, bj, mainF, jibF), speed: bs };
    }
    // 全展已不超限（横倾 < 参考角）就不必再试收帆
    const probe = evaluateAeroHydro({
      spec,
      controls: best.controls,
      tws,
      twaDeg,
      boatSpeed: best.speed,
    });
    if (probe.heelDeg < spec.heelEfficiencyRefDeg * 0.78) break;
  }

  const controls = best!.controls;
  const speed = best!.speed;
  const r = evaluateAeroHydro({ spec, controls, tws, twaDeg, boatSpeed: speed });
  const point: PolarPoint = {
    twaDeg,
    tws,
    boatSpeed: speed,
    vmg: speed * Math.cos((twaDeg * Math.PI) / 180),
    aws: r.apparentWindSpeed,
    awaDeg: r.apparentWindAngleDeg,
    heelDeg: r.heelDeg,
    leewayDeg: r.leewayDeg,
    mainTrimDeg: controls.main.trimDeg,
    jibTrimDeg: controls.jib.trimDeg,
    mainFraction: controls.main.fraction,
    jibFraction: controls.jib.fraction,
    thrust: r.totalThrust,
    resistance: r.hullResistance,
  };
  return { controls, speed, point };
}

/** 极曲线扫描：twa 从 close-hauled 到正顺风。 */
export function runPolar(
  spec: BoatSpec,
  tws: number,
  twaGrid: number[] = DEFAULT_TWA_GRID,
  opts?: OptimizeOptions,
): PolarCurve {
  const points: PolarPoint[] = [];
  for (const twa of twaGrid) {
    const { point } = optimizeTrim(spec, tws, twa, opts);
    if (point) points.push(point);
  }
  return { boatId: spec.id, tws, points };
}

export const DEFAULT_TWA_GRID = [
  30, 35, 40, 45, 52, 60, 70, 80, 90, 100, 110, 120, 135, 150, 165, 180,
];

/** 极曲线点按风角插值查询（用于实时航行页的建议航速/调帆提示）。 */
export function interpolatePolar(curve: PolarCurve, twaDeg: number): PolarPoint | null {
  const pts = curve.points;
  if (pts.length === 0) return null;
  if (twaDeg <= pts[0].twaDeg) return pts[0];
  if (twaDeg >= pts[pts.length - 1].twaDeg) return pts[pts.length - 1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (twaDeg >= a.twaDeg && twaDeg <= b.twaDeg) {
      const t = (twaDeg - a.twaDeg) / (b.twaDeg - a.twaDeg);
      return { ...a, ...Object.fromEntries(Object.keys(b).map((k) => [k, (a as any)[k] + ((b as any)[k] - (a as any)[k]) * t])) };
    }
  }
  return null;
}
