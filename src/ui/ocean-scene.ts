/**
 * Canvas 场景渲染：动态海面（波浪）、风粒子、带横倾/侧滑的帆船与鼓起的帆形。
 * 全部用 Canvas 2D 路径绘制，无图片资源。
 */
import type { AeroHydroResult, BoatSpec, SailingControls } from '../physics/types';

export interface SceneInput {
  spec: BoatSpec;
  controls: SailingControls;
  result: AeroHydroResult;
  boatSpeed: number;
  headingDeg: number;
  twaDeg: number;
  time: number;
  /** 真风来向（度，水面参考） */
  trueWindFromDeg: number;
}

interface Particle {
  x: number;
  y: number;
  life: number;
}

export class OceanScene {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 Canvas 2D 上下文');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(input: SceneInput): void {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    this.drawSea(input.time);
    this.drawWindParticles(input);
    this.drawBoat(input);
    this.drawCompass(input);
  }

  private drawSea(time: number): void {
    const { ctx, width, height } = this;
    // 海面渐变
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#0d3a5c');
    g.addColorStop(1, '#0a2c46');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    // 多层波浪线
    ctx.lineWidth = 1.5;
    for (let layer = 0; layer < 4; layer++) {
      const baseY = height * (0.55 + layer * 0.13);
      const amp = 5 + layer * 3;
      const len = 70 + layer * 26;
      ctx.strokeStyle = `rgba(150, 205, 235, ${0.18 - layer * 0.03})`;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 6) {
        const y =
          baseY +
          Math.sin((x + time * (26 + layer * 12)) / len) * amp +
          Math.sin((x - time * 18) / (len * 0.45)) * amp * 0.35;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private drawWindParticles(input: SceneInput): void {
    const { ctx, width, height } = this;
    // 风从来向吹向反方向
    const fromRad = (input.trueWindFromDeg * Math.PI) / 180;
    const vx = Math.sin(fromRad);
    const vy = -Math.cos(fromRad);
    const speed = 1.4 + input.result.apparentWindSpeed * 0.25;
    // 补充粒子
    while (this.particles.length < 70) {
      this.particles.push({ x: Math.random() * width, y: Math.random() * height, life: Math.random() });
    }
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.35)';
    ctx.lineWidth = 1;
    for (const p of this.particles) {
      p.x += vx * speed;
      p.y += vy * speed;
      p.life -= 0.008;
      if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20 || p.life <= 0) {
        p.x = Math.random() * width;
        p.y = Math.random() * height;
        p.life = 1;
      }
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - vx * 9, p.y - vy * 9);
      ctx.stroke();
    }
  }

  private drawBoat(input: SceneInput): void {
    const { ctx, width, height } = this;
    const cx = width * 0.5;
    const cy = height * 0.62;
    const scale = Math.min(width, height) / 360;
    const heel = input.result.heelDeg;
    const leeway = input.result.leewayDeg;

    ctx.save();
    ctx.translate(cx, cy);
    // 侧滑：船体相对航迹偏一个小角（视觉上轻微偏转）
    ctx.rotate(((leeway * 0.4) * Math.PI) / 180);
    ctx.scale(scale, scale);

    // 横倾：绕纵轴的视觉表现用垂直压缩 + 帆面倾斜近似（侧视图）
    const heelRad = (heel * Math.PI) / 180;
    const squash = Math.cos(heelRad);

    // 船体
    ctx.save();
    ctx.scale(1, 0.7 + 0.3 * squash);
    this.drawHull(input.spec);
    ctx.restore();

    // 桅杆与帆（随横倾倾斜）
    ctx.save();
    ctx.rotate(-heelRad * 0.85);
    this.drawRig(input);
    ctx.restore();

    // 航迹浪花
    this.drawWake(input, scale);
    ctx.restore();
  }

  private drawHull(spec: BoatSpec): void {
    const { ctx } = this;
    const L = 150;
    ctx.fillStyle = spec.colors.hull;
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, 18);
    ctx.quadraticCurveTo(-L * 0.55, 34, -L * 0.4, 38);
    ctx.lineTo(L * 0.4, 38);
    ctx.quadraticCurveTo(L * 0.56, 32, L * 0.5, 16);
    ctx.quadraticCurveTo(L * 0.2, 26, 0, 26);
    ctx.quadraticCurveTo(-L * 0.2, 26, -L * 0.5, 18);
    ctx.closePath();
    ctx.fill();
    // 甲板色带
    ctx.fillStyle = spec.colors.deck;
    ctx.beginPath();
    ctx.moveTo(-L * 0.46, 16);
    ctx.quadraticCurveTo(0, 24, L * 0.46, 15);
    ctx.lineTo(L * 0.42, 21);
    ctx.quadraticCurveTo(0, 28, -L * 0.42, 22);
    ctx.closePath();
    ctx.fill();
    if (spec.multihull) {
      // 三体的两个舷外浮体
      ctx.fillStyle = spec.colors.hull;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 92, 30, 34, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawRig(input: SceneInput): void {
    const { ctx } = this;
    const { spec, controls, result, time } = input;
    const mastH = 175;
    // 桅杆
    ctx.strokeStyle = '#5b6b7d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(0, -mastH);
    ctx.stroke();

    const belly = 6 + Math.sin(time * 1.6) * 1.2; // 帆的呼吸式鼓动
    // 主帆
    if (controls.main.fraction > 0.01 && spec.mainArea > 0) {
      this.drawSail(
        0,
        -mastH,
        20,
        96 * controls.main.fraction,
        controls.main.trimDeg,
        belly,
        spec.colors.sail,
        result.main.efficiency,
      );
    }
    // 前帆
    if (controls.jib.fraction > 0.01 && spec.jibArea > 0) {
      this.drawSail(
        2,
        -mastH * 0.82,
        -58,
        70 * controls.jib.fraction,
        controls.jib.trimDeg,
        belly * 0.8,
        '#eaf2fb',
        result.jib.efficiency,
      );
    }
  }

  /** 画一面三角帆，trimDeg 决定帆腹张角，belley 控制鼓起程度。 */
  private drawSail(
    mastX: number,
    topY: number,
    footX: number,
    footLen: number,
    trimDeg: number,
    belly: number,
    color: string,
    efficiency: number,
  ): void {
    const { ctx } = this;
    const trim = Math.min(40, trimDeg) * 0.9;
    const clewX = mastX + footX + trim;
    const tackX = mastX + footX * 0.18;
    const headX = mastX;
    // 帆形：用二次贝塞尔做出弧形帆腹
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55 + 0.45 * Math.max(0.2, efficiency);
    ctx.beginPath();
    ctx.moveTo(headX, topY);
    ctx.quadraticCurveTo(clewX + belly, topY + footLen * 0.55, clewX, topY + footLen);
    ctx.quadraticCurveTo(tackX + belly * 0.5, topY + footLen * 0.8, tackX, topY + footLen * 0.86);
    ctx.closePath();
    ctx.fill();
    // 帆缘线
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(120,140,160,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawWake(input: SceneInput, scale: number): void {
    const { ctx } = this;
    const speed = input.boatSpeed;
    if (speed < 0.4) return;
    const alpha = Math.min(0.5, speed * 0.06);
    ctx.strokeStyle = `rgba(230, 245, 255, ${alpha})`;
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 60 * scale, 34);
      ctx.quadraticCurveTo(side * 95 * scale, 48, side * (120 + speed * 6) * scale, 60);
      ctx.stroke();
    }
  }

  private drawCompass(input: SceneInput): void {
    const { ctx, width } = this;
    const x = width - 56;
    const y = 52;
    const r = 30;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(10,25,40,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,210,235,0.6)';
    ctx.stroke();
    // 真风箭头（来向）
    const fr = (input.trueWindFromDeg * Math.PI) / 180;
    ctx.strokeStyle = '#9fd4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.sin(fr) * (r - 6), y + Math.cos(fr) * (r - 6));
    ctx.stroke();
    ctx.fillStyle = '#9fd4ff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('真风', x, y + r + 14);
    ctx.restore();
  }
}
