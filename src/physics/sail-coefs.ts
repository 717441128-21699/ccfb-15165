/**
 * 帆空气动力系数表。
 *
 * 数据形态参考 Marchaj《Aero-Hydrodynamics of Sailing》与 ORC VPP 的简化极曲线：
 * - 升力系数 Cl 随攻角先线性增长、在 15° 附近达到峰值 ~1.7，随后失速；
 * - 阻力系数 Cd 在附着流段很小，失速后快速上升，90° 时接近平板正交阻力 ~1.2；
 * - 深顺风段帆完全失速、工作在“阻力推进”状态，另给一套极帆/球帆风格系数，
 *   按视风角在 80°~125° 之间平滑混合。
 *
 * 表只列 0~90°（负攻角按镜像处理并判定飘帆），运行时线性插值。
 */

import { interp1 as interp, smoothstep } from './math-utils';

export interface CoefPoint {
  /** 攻角（度） */
  alpha: number;
  cl: number;
  cd: number;
}

/** 迎风帆（主帆/前帆，附着流翼型特性） */
export const UPWIND_SAIL_TABLE: readonly CoefPoint[] = [
  { alpha: 0, cl: 0.45, cd: 0.014 },
  { alpha: 3, cl: 0.8, cd: 0.015 },
  { alpha: 6, cl: 1.15, cd: 0.018 },
  { alpha: 9, cl: 1.45, cd: 0.026 },
  { alpha: 12, cl: 1.65, cd: 0.04 },
  { alpha: 15, cl: 1.72, cd: 0.062 },
  { alpha: 18, cl: 1.66, cd: 0.095 },
  { alpha: 22, cl: 1.48, cd: 0.16 },
  { alpha: 27, cl: 1.28, cd: 0.27 },
  { alpha: 35, cl: 1.08, cd: 0.5 },
  { alpha: 45, cl: 0.92, cd: 0.76 },
  { alpha: 60, cl: 0.62, cd: 1.02 },
  { alpha: 75, cl: 0.28, cd: 1.16 },
  { alpha: 90, cl: 0.0, cd: 1.22 },
];

/** 顺风帆（球帆/撑出前帆的失速阻力推进特性） */
export const DOWNWIND_SAIL_TABLE: readonly CoefPoint[] = [
  { alpha: 15, cl: 1.05, cd: 0.14 },
  { alpha: 22, cl: 1.4, cd: 0.24 },
  { alpha: 30, cl: 1.6, cd: 0.36 },
  { alpha: 40, cl: 1.6, cd: 0.52 },
  { alpha: 50, cl: 1.45, cd: 0.72 },
  { alpha: 60, cl: 1.2, cd: 0.92 },
  { alpha: 75, cl: 0.78, cd: 1.18 },
  { alpha: 90, cl: 0.28, cd: 1.4 },
  { alpha: 100, cl: 0.08, cd: 1.5 },
  { alpha: 120, cl: 0.0, cd: 1.56 },
  { alpha: 150, cl: 0.0, cd: 1.6 },
  { alpha: 180, cl: 0.0, cd: 1.62 },
];

const UP_A = UPWIND_SAIL_TABLE.map((p) => p.alpha);
const UP_CL = UPWIND_SAIL_TABLE.map((p) => p.cl);
const UP_CD = UPWIND_SAIL_TABLE.map((p) => p.cd);
const DW_A = DOWNWIND_SAIL_TABLE.map((p) => p.alpha);
const DW_CL = DOWNWIND_SAIL_TABLE.map((p) => p.cl);
const DW_CD = DOWNWIND_SAIL_TABLE.map((p) => p.cd);

export interface SailCoefs {
  cl: number;
  cd: number;
  /** 查表所用攻角（度，绝对值） */
  alphaAbs: number;
  /** 是否飘帆/反灌（攻角为负或过小，帆无法正常成型） */
  luffing: boolean;
}

/**
 * 按攻角与视风角查帆的升阻力系数。
 * @param alphaDeg 带符号攻角（度）：视风来向与帆弦线的夹角
 * @param awaDeg   视风角（度，0=正顶风，180=正顺风）
 */
export function sailCoefs(alphaDeg: number, awaDeg: number): SailCoefs {
  const luffing = alphaDeg < 1.5;
  const a = Math.min(Math.abs(alphaDeg), 180);

  // 迎风表在 90° 封顶
  const au = Math.min(a, 90);
  const clu = interp(UP_A, UP_CL, au);
  const cdu = interp(UP_A, UP_CD, au);

  // 顺风表
  const cld = interp(DW_A, DW_CL, a);
  const cdd = interp(DW_A, DW_CD, a);

  // 视风角 80° 以下纯翼型，125° 以上纯球帆特性，中间平滑混合
  const w = smoothstep(80, 125, awaDeg);
  let cl = clu * (1 - w) + cld * w;
  const cd = cdu * (1 - w) + cdd * w;

  // 攻角带符号时升力方向翻转；飘帆时升力崩掉、只剩小阻力
  if (alphaDeg < 0) cl = -cl * 0.25;
  if (luffing) {
    cl *= 0.15;
  }
  return { cl, cd, alphaAbs: a, luffing };
}

