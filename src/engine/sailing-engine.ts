/**
 * 实时航行引擎：固定步长积分航速，舵角改变航向，记录每帧气水动力结果。
 * 物理每帧只调用一次 evaluateAeroHydro（亚毫秒），积分用半隐式欧拉。
 */
import type { AeroHydroResult, BoatSpec, SailingControls } from '../physics/types';
import { evaluateAeroHydro } from '../physics/aero-hydro';
import { clamp } from '../physics/math-utils';

export interface SailingFrame {
  result: AeroHydroResult;
  boatSpeed: number;
  /** 航向角（度，相对固定水面参考，0=北；舵角驱动其变化） */
  headingDeg: number;
  /** 位置（米，水面坐标） */
  x: number;
  y: number;
  /** 相对当前航向的真风角（度），由航向与固定真风方向换算 */
  twaDeg: number;
}

export interface EngineConfig {
  spec: BoatSpec;
  controls: SailingControls;
  /** 固定真风速 m/s */
  tws: number;
  /** 固定真风的水面来向（度，0=从北来） */
  trueWindFromDeg: number;
}

export class SailingEngine {
  private cfg: EngineConfig;
  boatSpeed = 0;
  headingDeg = 0;
  x = 0;
  y = 0;
  last: AeroHydroResult | null = null;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
  }

  updateConfig(patch: Partial<EngineConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  /** 当前航向相对真风的夹角（0~180，取绝对值表示某一舷）。 */
  currentTwa(): number {
    let diff = (this.headingDeg - this.cfg.trueWindFromDeg) % 360;
    if (diff < 0) diff += 360;
    return diff > 180 ? 360 - diff : diff;
  }

  step(dt: number): SailingFrame {
    const twa = this.currentTwa();
    const result = evaluateAeroHydro({
      spec: this.cfg.spec,
      controls: this.cfg.controls,
      tws: this.cfg.tws,
      twaDeg: twa,
      boatSpeed: this.boatSpeed,
    });
    // 半隐式欧拉：a = F/m
    const accel = result.netLongitudinal / this.cfg.spec.mass;
    this.boatSpeed = Math.max(0, this.boatSpeed + accel * dt);
    // 舵：转向速率与舵角、航速相关（低速舵效差）
    const rudder = this.cfg.controls.rudderDeg;
    const turnRate = (rudder * this.boatSpeed) / (this.cfg.spec.lwl * 1.6);
    this.headingDeg = (this.headingDeg + turnRate * dt + 360) % 360;
    // 位置积分（航向 0=北→+y，90=东→+x）
    const hd = (this.headingDeg * Math.PI) / 180;
    this.x += Math.sin(hd) * this.boatSpeed * dt;
    this.y += Math.cos(hd) * this.boatSpeed * dt;
    this.last = result;
    return { result, boatSpeed: this.boatSpeed, headingDeg: this.headingDeg, x: this.x, y: this.y, twaDeg: twa };
  }

  reset(): void {
    this.boatSpeed = 0;
    this.headingDeg = 0;
    this.x = 0;
    this.y = 0;
    this.last = null;
  }
}

/** 工具：把舵角夹到 ±35°。 */
export const clampRudder = (r: number): number => clamp(r, -35, 35);
