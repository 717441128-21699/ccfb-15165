/**
 * 气动—水动联合解算。
 *
 * 一次 evaluate 完成：
 *   视风（wind.ts）→ 各帆攻角 → Cl/Cd 查表 → 升力/阻力 → 推力/侧力
 *   → 横倾力矩 vs 扶正力矩（迭代求平衡横倾角，横倾反过来折减帆效率）
 *   → 龙骨侧向升力平衡侧滑角 → 龙骨诱导阻力 + 摩擦/兴波阻力 → 净纵向力
 *
 * 全部为解析/查表 + 定点迭代，无积分器、无内存分配热点，保证单帧亚毫秒。
 */

import type {
  AeroHydroResult,
  BoatSpec,
  SailForceDetail,
  SailingControls,
} from './types';
import { apparentWind } from './wind';
import { sailCoefs } from './sail-coefs';
import { clamp, deg2rad, interp1, rad2deg, smoothstep } from './math-utils';

const RHO_AIR = 1.225; // 空气密度 kg/m³
const RHO_WATER = 1025; // 海水密度 kg/m³
const G = 9.81;
const KINEMATIC_WATER = 1.19e-6; // 海水运动粘度 m²/s

export interface EvaluateInput {
  spec: BoatSpec;
  controls: SailingControls;
  tws: number;
  twaDeg: number;
  boatSpeed: number;
}

interface SailRaw {
  detail: SailForceDetail;
  sideForce: number;
  thrust: number;
  heelingForce: number;
}

/**
 * 顺风球帆/大顺风帆的等效面积增益（相对主帆面积的倍数）。
 * 真实船队在侧顺风（AWA > ~60°）就换升大前帆/球帆，这里按视风角平滑长出额外帆面积，
 * 避免新增独立控件，同时让 VPP 的顺风动力与真实帆装配置一致。
 */
function spinnakerAreaFactor(awaDeg: number, gain: number): number {
  return 1 + gain * smoothstep(60, 105, awaDeg);
}

/** 单帆受力（含横倾效率折减与帆间干扰）。 */
function computeSail(
  areaNominal: number,
  fraction: number,
  trimDeg: number,
  awaDeg: number,
  aws: number,
  slotFactor: number,
  heelEfficiency: number,
  otherSailOut: boolean,
  spinnakerFactor: number,
): SailRaw {
  const area = areaNominal * clamp(fraction, 0, 1) * spinnakerFactor;
  // 攻角 = 视风来向 − 帆弦线张角
  const alpha = awaDeg - trimDeg;
  const coef = sailCoefs(alpha, awaDeg);
  const q = 0.5 * RHO_AIR * aws * aws;
  const interaction = slotFactor * (otherSailOut ? 1 : 0.96); // 前帆收起时主帆前方来流略紊乱
  const efficiency = heelEfficiency * interaction;
  const lift = q * area * coef.cl * efficiency;
  const drag = q * area * coef.cd * efficiency;
  const awa = deg2rad(awaDeg);
  // 标准 VPP 分解：D 沿视风来流反向，L 垂直来流
  const thrust = lift * Math.sin(awa) - drag * Math.cos(awa);
  const sideForce = lift * Math.cos(awa) + drag * Math.sin(awa);
  return {
    detail: {
      aoaDeg: alpha,
      liftCoef: coef.cl,
      dragCoef: coef.cd,
      effectiveArea: area,
      lift,
      drag,
      thrust,
      sideForce,
      efficiency,
    },
    sideForce,
    thrust,
    heelingForce: sideForce,
  };
}

/** 松帆泄力：侧力按 sideFactor、推力按 thrustFactor 分别折减（对应船员主动松帆）。 */
function applyDump(sail: SailRaw, sideFactor: number, thrustFactor: number): void {
  sail.sideForce *= sideFactor;
  sail.heelingForce *= sideFactor;
  sail.thrust *= thrustFactor;
  const d = sail.detail;
  d.sideForce *= sideFactor;
  d.lift *= sideFactor; // 升力主要贡献侧力
  d.thrust *= thrustFactor;
  d.drag *= thrustFactor;
}

/**
 * 横倾下的帆效率（温和几何折减）。
 * 职责分离：本函数只刻画横倾导致的帆面有效受风投影减小；
 * 强风限功率完全由 evaluate 中的 maxHeel 泄力约束负责，
 * 避免两套机制叠加把帆力压到零。
 */
function heelEfficiency(spec: BoatSpec, heelDeg: number): number {
  void spec;
  const phi = deg2rad(heelDeg);
  // 帆面法向的水平投影 ≈ cos(φ)，再加一点帆型软化
  return Math.max(0.55, Math.cos(phi) * (1 - 0.08 * Math.sin(phi)));
}

/** 扶正力矩 (N·m)。龙骨船按压载线性段，多体/小艇按宽船体快速封顶模型。 */
function rightingMoment(spec: BoatSpec, heelDeg: number): number {
  const disp = spec.mass * G;
  const phi = deg2rad(heelDeg);
  if (spec.multihull) {
    // 三体：舷外浮体提供很大的初始扶正刚度（与船宽成正比），正常航行横倾 <15°；
    // 力矩曲线单调上升至倾覆角附近封顶，避免数值解算收敛到假倾覆点
    const cap = 55;
    const t = clamp(heelDeg / cap, 0, 1);
    return disp * spec.gzSlope * 2.2 * Math.sin(phi) * (1 - 0.25 * t * t);
  }
  // 单体：RM(φ) = Δ·GZ(φ)，GZ≈gzSlope·sin(φ)，大横倾时扶正力臂缩短
  const falloff = 1 - 0.006 * Math.max(0, heelDeg - 25) ** 1.6;
  return disp * spec.gzSlope * Math.sin(phi) * falloff;
}

/** 给定侧力气动力，求侧滑角与龙骨诱导阻力。 */
function solveLeeway(
  spec: BoatSpec,
  sideForce: number,
  boatSpeed: number,
): { leewayDeg: number; keelInducedDrag: number } {
  if (boatSpeed < 0.2 || sideForce <= 0) {
    return { leewayDeg: 0, keelInducedDrag: 0 };
  }
  const q = 0.5 * RHO_WATER * boatSpeed * boatSpeed;
  // 龙骨升力 = q·S·(2π 风格斜率)·α，平衡气动侧力
  const alpha = sideForce / (q * spec.keelArea * spec.keelLiftSlope);
  const leewayDeg = clamp(rad2deg(alpha), 0, 14);
  // 诱导阻力 Di = L² / (q·S·π·AR_eff)，用展弦比有效因子 3.2 近似
  const arEff = 3.2;
  const keelInducedDrag = (sideForce * sideForce) / (q * spec.keelArea * Math.PI * arEff);
  return { leewayDeg, keelInducedDrag };
}

/**
 * 剩余阻力系数 Cr 随 Froude 数的查表（Delft 船体系列风格的简化形态）。
 * Rr = Cr · ½ρV²·S。排水型在 Fn≈0.45 有兴波阻力峰；滑行型过峰后阻力回落。
 */
const FN_GRID = [0.05, 0.15, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.65, 0.8, 1.0, 1.3];
/** 纯排水型船体（重龙骨、压载深）：Fn 0.45 兴波峰后维持平台，不滑行 */
const CR_DISPLACEMENT = [0.0004, 0.001, 0.0025, 0.004, 0.006, 0.009, 0.012, 0.013, 0.0135, 0.0135, 0.013, 0.0125, 0.012];
/** 滑行型船体（平底小艇）：阻力峰较缓、过峰后进入滑行，Cr 大幅回落 */
const CR_PLANING = [0.0004, 0.001, 0.0019, 0.0028, 0.004, 0.006, 0.0078, 0.008, 0.0072, 0.005, 0.0033, 0.0027, 0.0024];

/**
 * 船体阻力：ITTC-57 摩擦阻力 + 查表剩余阻力（排水/滑行按 planingFactor 混合）。
 * 滑行后湿表面积按船体抬升适度折减，体现“越滑越轻”的真实趋势。
 */
export function hullResistance(spec: BoatSpec, speed: number): number {
  if (speed <= 0.05) return 0;
  const q = 0.5 * RHO_WATER * speed * speed;
  const rn = (speed * spec.lwl) / KINEMATIC_WATER;
  const cf = 0.075 / Math.pow(Math.log10(rn) - 2, 2);

  const fn = speed / Math.sqrt(G * spec.lwl);
  const crDis = interp1(FN_GRID, CR_DISPLACEMENT, fn);
  const crPlan = interp1(FN_GRID, CR_PLANING, fn);
  const cr = crDis * (1 - spec.planingFactor) + crPlan * spec.planingFactor;

  // 高速滑行时船体抬升、湿面积减小（排水型不抬升）
  const liftStart = smoothstep(0.42, 0.75, fn);
  const wetFactor = 1 - 0.32 * spec.planingFactor * liftStart;

  const friction = cf * q * spec.wettedArea * wetFactor * spec.dragShapeFactor;
  // 剩余阻力按排水量级别的参考面积（≈浸水横剖面尺度），不按摩擦湿面积，避免大船被高估
  const rrArea = spec.rrAreaFactor * spec.lwl * spec.lwl;
  const residuary = cr * q * rrArea * spec.rrScale;
  // 空气/上层建筑阻力小项
  const airDrag = 0.004 * q * spec.mainArea * 0.15;
  return friction + residuary + airDrag;
}

/** 完整一次气水动力评估。 */
export function evaluateAeroHydro(input: EvaluateInput): AeroHydroResult {
  const { spec, controls, tws, twaDeg, boatSpeed } = input;
  const tri = apparentWind(tws, twaDeg, Math.max(0, boatSpeed));
  const aws = tri.aws;
  const awa = tri.awaDeg;

  const mainOut = controls.main.fraction > 0.01 && spec.mainArea > 0;
  const jibOut = controls.jib.fraction > 0.01 && spec.jibArea > 0;

  const spinnakerF = spinnakerAreaFactor(awa, spec.spinnakerGain);
  const mainSpin = jibOut ? 1 : spinnakerF;

  /**
   * 给定试探横倾角，计算该角度下（含效率折减）的帆力。
   * 横倾平衡是求根问题：HM(φ)=帆侧力(φ)·CE高 与 RM(φ) 的交点，
   * 不能用“把横倾直接取成全力矩对应角”的不动点，否则会自激到极限角。
   */
  const forcesAtHeel = (heelDeg: number): { main: SailRaw | null; jib: SailRaw | null; side: number; thrust: number } => {
    const he = heelEfficiency(spec, heelDeg);
    const m = mainOut
      ? computeSail(spec.mainArea, controls.main.fraction, controls.main.trimDeg, awa, aws, 1.0, he, jibOut, mainSpin)
      : null;
    const j = jibOut
      ? computeSail(spec.jibArea, controls.jib.fraction, controls.jib.trimDeg, awa, aws, 1.04, Math.min(1, he + 0.03), mainOut, spinnakerF)
      : null;
    return {
      main: m,
      jib: j,
      side: (m?.sideForce ?? 0) + (j?.sideForce ?? 0),
      thrust: (m?.thrust ?? 0) + (j?.thrust ?? 0),
    };
  };

  // 对分求根：f(φ)=HM(φ)−RM(φ)。φ=0 时 HM≥0、RM=0 → f≥0；
  // 若 maxHeel 处 f 仍为正，说明全力也压不住，需要泄力并把横倾限制在 maxHeel。
  const hiHeel = spec.maxHeelDeg;
  const fAt = (phi: number) => {
    const f = forcesAtHeel(phi);
    return f.side * spec.sailCEHeight - rightingMoment(spec, phi);
  };
  let heel: number;
  if (fAt(hiHeel) <= 0) {
    let lo = 0;
    let hi = hiHeel;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) * 0.5;
      if (fAt(mid) > 0) lo = mid;
      else hi = mid;
    }
    heel = (lo + hi) * 0.5;
  } else {
    heel = hiHeel;
  }

  // 用平衡横倾算最终帆力
  const final = forcesAtHeel(heel);
  let mainRaw = final.main;
  let jibRaw = final.jib;
  let totalThrust = final.thrust;
  let totalSide = final.side;

  // 横倾力矩约束：侧力被限制在 maxHeel 处扶正力矩对应的值。
  // 松帆主要泄掉横向升力，前向推力保留较多（真实操船经验：松舵/松帆先压横倾，速度不会同比例掉）。
  const maxRM = rightingMoment(spec, spec.maxHeelDeg);
  const maxSideForce = maxRM / spec.sailCEHeight;
  if (totalSide > maxSideForce) {
    const sideDump = maxSideForce / totalSide;
    // 推力泄除因子是侧力因子的 0.4 次幂，更温和
    const thrustDump = Math.pow(sideDump, 0.4);
    if (mainRaw) applyDump(mainRaw, sideDump, thrustDump);
    if (jibRaw) applyDump(jibRaw, sideDump, thrustDump);
    totalSide *= sideDump;
    totalThrust *= thrustDump;
  }

  const heelingMoment = totalSide * spec.sailCEHeight;
  const { leewayDeg, keelInducedDrag } = solveLeeway(spec, totalSide, Math.max(0, boatSpeed));
  const resistance = hullResistance(spec, Math.max(0, boatSpeed)) + keelInducedDrag;

  return {
    apparentWindSpeed: aws,
    apparentWindAngleDeg: awa,
    main: mainRaw?.detail ?? zeroSailDetail(),
    jib: jibRaw?.detail ?? zeroSailDetail(),
    totalThrust,
    totalSideForce: totalSide,
    heelingMoment,
    heelDeg: heel,
    leewayDeg,
    hullResistance: resistance,
    netLongitudinal: totalThrust - resistance,
  };
}

function zeroSailDetail(): SailForceDetail {
  return {
    aoaDeg: 0,
    liftCoef: 0,
    dragCoef: 0,
    effectiveArea: 0,
    lift: 0,
    drag: 0,
    thrust: 0,
    sideForce: 0,
    efficiency: 0,
  };
}
