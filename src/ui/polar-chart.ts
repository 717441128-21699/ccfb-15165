/**
 * 极曲线图表（Canvas 2D）。
 * 径向=船速（节），角度=真风角 TWA（0°顶风在顶部，左右舷镜像），
 * 每条曲线对应一个真风速，可叠加参考极曲线与 VMG 标记。
 */
import type { PolarCurve } from '../vpp/vpp';
import { MS_TO_KN } from '../vpp/reference-polars';

const COLORS = ['#46b6ff', '#ffcf5c', '#4ade80', '#fb923c', '#f472b6', '#a78bfa'];

export interface PolarChartOptions {
  curves: PolarCurve[];
  /** 参考曲线（虚线叠加），key 为 tws（节） */
  reference?: Record<number, Array<[number, number]>>;
  /** 高亮当前风角 */
  highlightTwa?: number;
  showVmg?: boolean;
}

export class PolarChart {
  private ctx: CanvasRenderingContext2D;
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

  render(opts: PolarChartOptions): void {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2 + 10;
    const R = Math.min(width, height) * 0.4;

    const maxSpeed = this.maxSpeed(opts);
    const rOf = (kn: number) => (kn / maxSpeed) * R;
    // TWA→画布坐标：0°顶朝上，顺时针为右舷
    const xy = (twaDeg: number, kn: number, side = 1) => {
      const a = ((twaDeg - 90) * Math.PI) / 180;
      return { x: cx + side * Math.cos(a) * rOf(kn), y: cy + Math.sin(a) * rOf(kn) };
    };

    this.drawGrid(cx, cy, R, maxSpeed);

    // 参考曲线（虚线）
    if (opts.reference) {
      let ri = 0;
      for (const [twsKn, pts] of Object.entries(opts.reference)) {
        const color = COLORS[ri % COLORS.length];
        this.drawReference(pts, xy, color, Number(twsKn));
        ri++;
      }
    }

    // 仿真曲线（左右舷镜像）
    opts.curves.forEach((curve, i) => {
      const color = COLORS[i % COLORS.length];
      this.drawCurve(curve, xy, color);
      if (opts.showVmg) this.drawVmg(curve, xy, color);
    });

    if (opts.highlightTwa !== undefined) {
      this.drawHighlight(opts.highlightTwa, cx, cy, R);
    }
    this.drawLabels(cx, cy, R);
  }

  private maxSpeed(opts: PolarChartOptions): number {
    let m = 4;
    for (const c of opts.curves) for (const p of c.points) m = Math.max(m, p.boatSpeed * MS_TO_KN);
    if (opts.reference) for (const pts of Object.values(opts.reference)) for (const [, v] of pts) m = Math.max(m, v);
    return Math.ceil(m / 2) * 2;
  }

  private drawGrid(cx: number, cy: number, R: number, maxSpeed: number): void {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(148,163,189,0.18)';
    ctx.fillStyle = 'rgba(148,163,189,0.75)';
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    // 同心环
    const rings = 4;
    for (let i = 1; i <= rings; i++) {
      const r = (R * i) / rings;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const label = ((maxSpeed * i) / rings).toFixed(0);
      ctx.fillText(`${label}kn`, cx + 3, cy - r - 2);
    }
    // 径向角度线
    for (let twa = 30; twa <= 150; twa += 30) {
      for (const side of [-1, 1]) {
        const a = ((twa - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + side * Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      }
    }
    // 中心
    ctx.fillStyle = 'rgba(148,163,189,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCurve(
    curve: PolarCurve,
    xy: (twa: number, kn: number, side?: number) => { x: number; y: number },
    color: string,
  ): void {
    const { ctx } = this;
    for (const side of [1, -1]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      curve.points.forEach((p, idx) => {
        const pt = xy(p.twaDeg, p.boatSpeed * MS_TO_KN, side);
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      // 数据点
      ctx.fillStyle = color;
      for (const p of curve.points) {
        const pt = xy(p.twaDeg, p.boatSpeed * MS_TO_KN, side);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawReference(
    pts: Array<[number, number]>,
    xy: (twa: number, kn: number, side?: number) => { x: number; y: number },
    color: string,
    twsKn: number,
  ): void {
    const { ctx } = this;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    for (const side of [1, -1]) {
      ctx.beginPath();
      pts.forEach(([twa, kn], idx) => {
        const pt = xy(twa, kn, side);
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    void twsKn;
  }

  private drawVmg(
    curve: PolarCurve,
    xy: (twa: number, kn: number, side?: number) => { x: number; y: number },
    color: string,
  ): void {
    const { ctx } = this;
    let best = curve.points[0];
    for (const p of curve.points) if (p.vmg > best.vmg) best = p;
    for (const side of [1, -1]) {
      const pt = xy(best.twaDeg, best.boatSpeed * MS_TO_KN, side);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0e1726';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawHighlight(twa: number, cx: number, cy: number, R: number): void {
    const { ctx } = this;
    const a = ((twa - 90) * Math.PI) / 180;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawLabels(cx: number, cy: number, R: number): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(200,215,235,0.85)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const labels: Array<[number, string]> = [
      [0, '顶风 0°'],
      [90, '90°'],
      [180, '顺风 180°'],
    ];
    for (const [twa, text] of labels) {
      const a = ((twa - 90) * Math.PI) / 180;
      const x = cx + Math.cos(a) * (R + 22);
      const y = cy + Math.sin(a) * (R + 22) + 4;
      ctx.fillText(text, x, y);
    }
  }
}
