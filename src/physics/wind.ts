/**
 * 真风与视风的矢量变换。
 *
 * 参考系（船体坐标系）：
 * - +x 指向船头（纵向），+y 指向右舷（侧向）；
 * - 风的“来向角”：0°=正顶风（风从船头来），90°=右舷正横，180°=正顺风；
 * - 风矢量（空气运动方向）= 从来向的反方向吹。
 *
 * 真风是水面参考系下的风；视风 = 真风 − 船速矢量。
 * 船速越高，视风来向越向船头方向“前移”、视风风速增大——这是帆船最关键的运动学效应。
 */

export interface WindTriangle {
  /** 真风速 m/s */
  tws: number;
  /** 真风角（度，0~180） */
  twaDeg: number;
  /** 船纵向航速 m/s */
  boatSpeed: number;
  /** 视风速 m/s */
  aws: number;
  /** 视风角（度，0~180） */
  awaDeg: number;
}

import { clamp, deg2rad, rad2deg } from './math-utils';

/**
 * 由真风与船速计算视风（风三角解算）。
 * 约定只处理左/右一舷（角度 0~180），换舷由上层逻辑处理。
 */
export function apparentWind(
  tws: number,
  twaDeg: number,
  boatSpeed: number,
): WindTriangle {
  const twa = deg2rad(clamp(twaDeg, 0, 180));
  // 真风在船体坐标系中的空气运动矢量（风从来向吹向反方向）
  const airX = -tws * Math.cos(twa) - boatSpeed; // 纵向：顶风来流 + 船速前进叠加
  const airY = -tws * Math.sin(twa); // 侧向
  const aws = Math.hypot(airX, airY);
  // 来向角 β：V_air = -AWS·(cosβ, sinβ)
  const beta = Math.atan2(-airY, -airX);
  return {
    tws,
    twaDeg,
    boatSpeed,
    aws,
    awaDeg: clamp(rad2deg(beta), 0, 180),
  };
}

/**
 * 由视风反推真风（航行页调舵换舷/显示用）。
 * V_air_true = V_app + V_boat。
 */
export function trueWindFromApparent(
  aws: number,
  awaDeg: number,
  boatSpeed: number,
): { tws: number; twaDeg: number } {
  const awa = deg2rad(awaDeg);
  const airX = -aws * Math.cos(awa) + boatSpeed;
  const airY = -aws * Math.sin(awa);
  const tws = Math.hypot(airX, airY);
  const twa = Math.atan2(-airY, -airX);
  return { tws, twaDeg: clamp(rad2deg(twa), 0, 180) };
}
