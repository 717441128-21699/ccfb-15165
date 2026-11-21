/** 物理模型共享类型定义。 */

/** 船型参数（不同级别帆船）。单位：米、千克、牛顿相关为 SI。 */
export interface BoatSpec {
  id: string;
  name: string;
  /** 级别简介 */
  description: string;
  /** 船体总长 LWL 水线长 (m) */
  lwl: number;
  /** 船宽 (m) */
  beam: number;
  /** 总重（含船员压载）(kg) */
  mass: number;
  /** 主帆面积 (m²) */
  mainArea: number;
  /** 前帆面积 (m²) */
  jibArea: number;
  /** 帆面气动合力中心距水线的有效高度 (m)，用于横倾力矩 */
  sailCEHeight: number;
  /** 船体（含龙骨/稳向板）湿表面积近似 (m²)，用于摩擦阻力 */
  wettedArea: number;
  /** 小横倾扶正力臂 GZ 斜率 (m/rad)：RM(φ)=Δ·gzSlope·sin(φ)，物理量纲清晰、逐船标定 */
  gzSlope: number;
  /** 龙骨/稳向板侧向升力线斜率 dCL/dα(rad)，决定侧滑大小 */
  keelLiftSlope: number;
  /** 龙骨/稳向板参考面积 (m²) */
  keelArea: number;
  /** 船体阻力形状系数：摩擦阻力 C_f * 1/2ρV²S 的附加裕量 */
  dragShapeFactor: number;
  /** 剩余（兴波）阻力参考面积因子：Rr = Cr·½ρV²·(rrAreaFactor·LWL²)，按船体浸水横截面尺度标定 */
  rrAreaFactor: number;
  /** 剩余阻力整体缩放（细长多体取小、粗壮单体取大） */
  rrScale: number;
  /** 兴波阻力峰航速系数（船体速长限，m/s = hullSpeedCoef*sqrt(LWL)），0 表示无硬上限（多体/滑行） */
  hullSpeedCoef: number;
  /** 兴波阻力权重（越大越难突破 hull speed） */
  waveDragWeight: number;
  /** 滑行能力 0=纯排水型（重龙骨船），1=典型滑行艇（小艇），决定剩余阻力曲线形态 */
  planingFactor: number;
  /** 顺风球帆/大前帆的等效面积增益倍数（相对主帆面积），逐船按帆装配置标定 */
  spinnakerGain: number;
  /** 横倾导致帆效率衰减的特征角（度），效率 ≈ cos(heel/heelRef * π/2) 形态 */
  heelEfficiencyRefDeg: number;
  /** 最大可持续横倾角（度）：超过后船员必须松帆泄力，气动可用功率被硬截断 */
  maxHeelDeg: number;
  /** 是否为多体船（无压载、扶正靠船宽） */
  multihull: boolean;
  /** 配色（Canvas 绘制用） */
  colors: { hull: string; sail: string; deck: string };
}

/** 帆的收放状态：fraction 0~1 为展开比例；trim 为帆弦线相对船首尾线的角（度，正=向舷外张）。 */
export interface SailState {
  /** 展开面积比例 0~1（0=全收，1=全展） */
  fraction: number;
  /** 调帆角（度）：帆弦线相对船头方向的张角，主帆一般 5~35，顺风可达 80+ */
  trimDeg: number;
}

/** 全局航行控制状态。 */
export interface SailingControls {
  main: SailState;
  jib: SailState;
  /** 舵角（度），负=左舵 */
  rudderDeg: number;
}

/** 真风（水面参考系）。 */
export interface TrueWind {
  /** 风速 m/s */
  speed: number;
  /** 风的来向（度，0=从正北/船首基准来；本仿真用船首相对基准，0=顶风） */
  fromDeg: number;
}

/** 单帧/单次解算的完整气动与流体结果。 */
export interface AeroHydroResult {
  // 视风
  apparentWindSpeed: number;
  /** 视风来向相对船首（度，0=正顶风） */
  apparentWindAngleDeg: number;
  // 各帆
  main: SailForceDetail;
  jib: SailForceDetail;
  /** 总气动推力（沿航向，N，正=向前） */
  totalThrust: number;
  /** 总侧向气动力（N，正=向背风侧） */
  totalSideForce: number;
  /** 横倾力矩 (N·m) */
  heelingMoment: number;
  /** 平衡横倾角（度） */
  heelDeg: number;
  /** 侧滑角（度，正=船体向背风侧漂移、船头指向相对航迹偏上风） */
  leewayDeg: number;
  /** 当前航速下船体总阻力 (N) */
  hullResistance: number;
  /** 净纵向力 (N) */
  netLongitudinal: number;
}

export interface SailForceDetail {
  /** 攻角（度，带符号） */
  aoaDeg: number;
  liftCoef: number;
  dragCoef: number;
  /** 有效面积 m²（含收帆比例） */
  effectiveArea: number;
  /** 升力 N */
  lift: number;
  /** 阻力 N */
  drag: number;
  /** 该帆贡献的纵向推力 N */
  thrust: number;
  /** 该帆贡献的侧向力 N */
  sideForce: number;
  /** 帆效率（受横倾/帆间干扰折减后，0~1） */
  efficiency: number;
}
