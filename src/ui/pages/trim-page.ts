/**
 * 调帆页：主帆/前帆独立的展开比例与调帆角控制，
 * 实时显示攻角、Cl/Cd、帆力分解，并在 Canvas 上画 Cl/Cd 随攻角曲线与当前工作点。
 */
import type { Page } from '../router';
import { simStore } from '../../state/store';
import { evaluateAeroHydro } from '../../physics/aero-hydro';
import { KN_TO_MS, MS_TO_KN } from '../../vpp/reference-polars';
import { UPWIND_SAIL_TABLE, DOWNWIND_SAIL_TABLE, type CoefPoint } from '../../physics/sail-coefs';
import { optimizeTrim } from '../../vpp/vpp';

export class TrimPage implements Page {
  private root = document.createElement('div');
  private raf = 0;
  private coefCanvas: HTMLCanvasElement | null = null;

  mount(): HTMLElement {
    const s = simStore.get();
    const spec = simStore.spec();
    this.root.innerHTML = `
      <div class="layout">
        <div class="panel">
          <h2>帆空气动力系数（随攻角）</h2>
          <canvas class="chart" style="height:380px"></canvas>
          <div class="legend">
            <span><span class="swatch" style="background:#46b6ff"></span>升力系数 Cl（迎风）</span>
            <span><span class="swatch" style="background:#ffcf5c"></span>阻力系数 Cd（迎风）</span>
            <span><span class="swatch" style="background:#4ade80"></span>球帆特性 Cl/Cd</span>
            <span><span class="swatch" style="background:#f87171"></span>当前工作点</span>
          </div>
        </div>
        <div class="panel">
          <h2>调帆控制</h2>
          <div id="trim-controls"></div>
          <h2 style="margin-top:18px">实时帆力</h2>
          <div id="force-readout" class="metrics"></div>
          <div class="hint">攻角 = 视风角 − 调帆角。攻角 12~18° 升力最大；过小会飘帆，过大会失速。</div>
          <button class="btn" id="auto-trim" style="margin-top:10px">一键最优调帆（VPP）</button>
        </div>
      </div>`;

    this.coefCanvas = this.root.querySelector('canvas') as HTMLCanvasElement;
    this.buildControls(spec, s);
    this.root.querySelector('#auto-trim')?.addEventListener('click', () => this.autoTrim());
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    return this.root;
  }

  private buildControls(spec: ReturnType<typeof simStore.spec>, s: ReturnType<typeof simStore.get>): void {
    const host = this.root.querySelector('#trim-controls') as HTMLElement;
    const sails: Array<{ key: 'main' | 'jib'; name: string; area: number }> = [];
    if (spec.mainArea > 0) sails.push({ key: 'main', name: '主帆', area: spec.mainArea });
    if (spec.jibArea > 0) sails.push({ key: 'jib', name: '前帆', area: spec.jibArea });
    host.innerHTML = sails
      .map(
        (sl) => `
      <div style="border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px">
        <div class="row"><label>${sl.name}展开（${sl.area}m²）</label>
          <input type="range" data-sail="${sl.key}" data-field="fraction" min="0" max="1" step="0.05" value="${s.controls[sl.key].fraction}">
          <span class="val" id="${sl.key}-fraction-v">${(s.controls[sl.key].fraction * 100).toFixed(0)}%</span></div>
        <div class="row"><label>${sl.name}调帆角</label>
          <input type="range" data-sail="${sl.key}" data-field="trimDeg" min="3" max="90" step="1" value="${s.controls[sl.key].trimDeg}">
          <span class="val" id="${sl.key}-trim-v">${s.controls[sl.key].trimDeg}°</span></div>
      </div>`,
      )
      .join('');
    host.querySelectorAll('input').forEach((el) => {
      el.addEventListener('input', () => {
        const input = el as HTMLInputElement;
        const sail = input.dataset.sail as 'main' | 'jib';
        const field = input.dataset.field as 'fraction' | 'trimDeg';
        const cur = simStore.get().controls[sail];
        simStore.updateControls({ [sail]: { ...cur, [field]: Number(input.value) } } as never);
      });
    });
  }

  private autoTrim(): void {
    const spec = simStore.spec();
    const s = simStore.get();
    const { controls } = optimizeTrim(spec, simStore.tws(), s.twaDeg);
    simStore.updateControls({ main: controls.main, jib: controls.jib });
  }

  private loop(): void {
    const s = simStore.get();
    const spec = simStore.spec();
    const r = evaluateAeroHydro({ spec, controls: s.controls, tws: simStore.tws(), twaDeg: s.twaDeg, boatSpeed: s.boatSpeed });
    this.drawCoef(r);
    this.updateReadout(r);
    this.raf = requestAnimationFrame(this.loop);
  }

  private drawCoef(r: ReturnType<typeof evaluateAeroHydro>): void {
    const canvas = this.coefCanvas!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 46, r: 16, t: 16, b: 34 };
    const xMax = 90;
    const yMax = 1.8;
    const x = (a: number) => pad.l + (a / xMax) * (W - pad.l - pad.r);
    const y = (v: number) => H - pad.b - (Math.min(v, yMax) / yMax) * (H - pad.t - pad.b);

    // 坐标轴
    ctx.strokeStyle = 'rgba(148,163,189,0.3)';
    ctx.fillStyle = 'rgba(148,163,189,0.8)';
    ctx.font = '10px sans-serif';
    for (let a = 0; a <= 90; a += 15) {
      ctx.beginPath();
      ctx.moveTo(x(a), pad.t);
      ctx.lineTo(x(a), H - pad.b);
      ctx.stroke();
      ctx.fillText(`${a}°`, x(a) - 6, H - pad.b + 14);
    }
    for (let v = 0; v <= yMax; v += 0.3) {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(v));
      ctx.lineTo(W - pad.r, y(v));
      ctx.stroke();
      ctx.fillText(v.toFixed(1), 8, y(v) + 3);
    }
    ctx.fillText('攻角 α →', W - 70, H - 6);

    const line = (table: readonly CoefPoint[], key: 'cl' | 'cd', color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      table.forEach((p: CoefPoint, i: number) => {
        const px = x(p.alpha);
        const py = y(p[key]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };
    line(UPWIND_SAIL_TABLE, 'cl', '#46b6ff');
    line(UPWIND_SAIL_TABLE, 'cd', '#ffcf5c');
    line(
      DOWNWIND_SAIL_TABLE.filter((p: CoefPoint) => p.alpha <= 90),
      'cl',
      '#4ade80',
    );
    line(
      DOWNWIND_SAIL_TABLE.filter((p: CoefPoint) => p.alpha <= 90),
      'cd',
      '#4ade80',
    );

    // 当前工作点（主帆攻角）
    const aoa = Math.abs(r.main.aoaDeg);
    if (aoa <= 90) {
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(x(aoa), y(r.main.liftCoef), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f87171';
      ctx.font = '11px sans-serif';
      ctx.fillText(`主帆 α=${aoa.toFixed(0)}°`, x(aoa) + 8, y(r.main.liftCoef) - 6);
    }
  }

  private updateReadout(r: ReturnType<typeof evaluateAeroHydro>): void {
    const host = this.root.querySelector('#force-readout') as HTMLElement;
    const item = (k: string, v: string, u = '') =>
      `<div class="metric"><div class="k">${k}</div><div class="v">${v} <span class="u">${u}</span></div></div>`;
    host.innerHTML = [
      item('视风角 AWA', r.apparentWindAngleDeg.toFixed(0), '°'),
      item('视风速 AWS', (r.apparentWindSpeed * MS_TO_KN).toFixed(1), 'kn'),
      item('主帆攻角', r.main.aoaDeg.toFixed(1), '°'),
      item('主帆 Cl/Cd', `${r.main.liftCoef.toFixed(2)}/${r.main.dragCoef.toFixed(2)}`),
      item('前帆攻角', r.jib.effectiveArea > 0 ? r.jib.aoaDeg.toFixed(1) : '—', '°'),
      item('前帆 Cl/Cd', r.jib.effectiveArea > 0 ? `${r.jib.liftCoef.toFixed(2)}/${r.jib.dragCoef.toFixed(2)}` : '—'),
      item('帆效率(主)', (r.main.efficiency * 100).toFixed(0), '%'),
      item('平衡横倾', r.heelDeg.toFixed(1), '°'),
    ].join('');
    void KN_TO_MS;
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
  }
}
