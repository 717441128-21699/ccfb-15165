/**
 * 极曲线页：选择船型与真风速集合，后台跑 VPP 扫描，
 * Canvas 画极曲线并叠加参考极曲线，显示逐点误差与 VMG 最优风角。
 */
import type { Page } from '../router';
import { BOAT_SPECS } from '../../physics/boat-specs';
import { simStore } from '../../state/store';
import { runPolar, type PolarCurve } from '../../vpp/vpp';
import { PolarChart } from '../polar-chart';
import { REFERENCE_POLARS, KN_TO_MS, MS_TO_KN } from '../../vpp/reference-polars';
import { interpSpeedKn } from '../../vpp/polar-compare';

export class PolarPage implements Page {
  private root = document.createElement('div');
  private chart: PolarChart | null = null;
  private curves: PolarCurve[] = [];
  private selectedTws: number[] = [];

  mount(): HTMLElement {
    const spec = simStore.spec();
    const refTws = Object.keys(REFERENCE_POLARS[spec.id] ?? {}).map(Number);
    this.selectedTws = refTws.slice(0, 3);
    this.root.innerHTML = `
      <div class="panel">
        <h2>极曲线 VPP（速度预测）</h2>
        <div class="row" style="flex-wrap:wrap">
          <label>船型</label>
          <select id="polar-boat">${BOAT_SPECS.map((b) => `<option value="${b.id}" ${b.id === spec.id ? 'selected' : ''}>${b.name}</option>`).join('')}</select>
          <label>真风速</label>
          <div id="tws-pills" style="display:flex;gap:6px;flex-wrap:wrap"></div>
          <button class="btn" id="run-polar">运行 VPP 扫描</button>
          <span class="hint" id="polar-status"></span>
        </div>
        <canvas class="chart"></canvas>
        <div class="legend" id="polar-legend"></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <h2>与设计参考极曲线对比</h2>
        <div id="compare-table"></div>
      </div>`;

    this.chart = new PolarChart(this.root.querySelector('canvas') as HTMLCanvasElement);
    this.buildPills(spec.id);
    this.root.querySelector('#polar-boat')?.addEventListener('change', (e) => {
      const id = (e.target as HTMLSelectElement).value;
      const ref = Object.keys(REFERENCE_POLARS[id] ?? {}).map(Number);
      this.selectedTws = ref.slice(0, 3);
      this.buildPills(id);
    });
    this.root.querySelector('#run-polar')?.addEventListener('click', () => this.run());
    this.run();
    return this.root;
  }

  private buildPills(boatId: string): void {
    const ref = Object.keys(REFERENCE_POLARS[boatId] ?? {}).map(Number);
    const host = this.root.querySelector('#tws-pills') as HTMLElement;
    host.innerHTML = ref
      .map(
        (tws) =>
          `<button class="btn ghost tws-pill ${this.selectedTws.includes(tws) ? 'active' : ''}" data-tws="${tws}" style="${this.selectedTws.includes(tws) ? 'border-color:var(--accent);color:var(--accent)' : ''}">${tws} kn</button>`,
      )
      .join('');
    host.querySelectorAll('.tws-pill').forEach((b) =>
      b.addEventListener('click', () => {
        const tws = Number((b as HTMLElement).dataset.tws);
        this.selectedTws = this.selectedTws.includes(tws)
          ? this.selectedTws.filter((t) => t !== tws)
          : [...this.selectedTws, tws];
        this.buildPills(boatId);
      }),
    );
  }

  private async run(): Promise<void> {
    const boatId = (this.root.querySelector('#polar-boat') as HTMLSelectElement).value;
    const spec = BOAT_SPECS.find((b) => b.id === boatId)!;
    const status = this.root.querySelector('#polar-status') as HTMLElement;
    status.textContent = '计算中…';
    // 让浏览器先渲染“计算中”
    await new Promise((r) => setTimeout(r, 30));
    const t0 = performance.now();
    this.curves = this.selectedTws.map((twsKn) => runPolar(spec, twsKn * KN_TO_MS));
    const ms = performance.now() - t0;
    status.textContent = `完成，${this.selectedTws.length} 条曲线耗时 ${ms.toFixed(0)} ms`;
    this.draw(spec.id);
    this.compare(spec.id);
  }

  private draw(boatId: string): void {
    const ref = REFERENCE_POLARS[boatId] ?? {};
    const refSubset: Record<number, Array<[number, number]>> = {};
    for (const tws of this.selectedTws) if (ref[tws]) refSubset[tws] = ref[tws];
    this.chart?.render({ curves: this.curves, reference: refSubset, showVmg: true });
    const legend = this.root.querySelector('#polar-legend') as HTMLElement;
    legend.innerHTML = this.curves
      .map((c, i) => {
        const color = ['#46b6ff', '#ffcf5c', '#4ade80', '#fb923c', '#f472b6'][i % 5];
        const bestVmg = Math.max(...c.points.map((p) => p.vmg));
        const bestPt = c.points.find((p) => p.vmg === bestVmg)!;
        return `<span><span class="swatch" style="background:${color}"></span>${c.tws.toFixed(0)}kn 实线=仿真 虚线=参考 · 最优迎风VMG ${bestVmg.toFixed(1)}kn @${bestPt.twaDeg}°</span>`;
      })
      .join('');
  }

  private compare(boatId: string): void {
    const host = this.root.querySelector('#compare-table') as HTMLElement;
    const rows: string[] = [];
    let allMean = 0;
    let allN = 0;
    for (const curve of this.curves) {
      const ref = (REFERENCE_POLARS[boatId] ?? {})[Math.round(curve.tws * MS_TO_KN)];
      if (!ref) continue;
      let sum = 0;
      const cells: string[] = [];
      for (const [twa, refKn] of ref) {
        const simKn = interpSpeedKn(curve, twa);
        if (simKn === null) continue;
        const pct = ((simKn - refKn) / refKn) * 100;
        sum += Math.abs(pct);
        allN++;
        allMean += Math.abs(pct);
        const cls = Math.abs(pct) < 8 ? 'good' : Math.abs(pct) < 14 ? 'warn' : 'bad';
        cells.push(`<td>${twa}°</td><td>${simKn.toFixed(1)}</td><td>${refKn.toFixed(1)}</td><td><span class="pill ${cls}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span></td>`);
      }
      const mean = sum / Math.max(1, ref.length);
      rows.push(
        `<tr><td rowspan="${ref.length}" style="vertical-align:top;font-weight:700">${Math.round(curve.tws * MS_TO_KN)}kn<br><span class="pill ${mean < 8 ? 'good' : 'bad'}">均误 ${mean.toFixed(1)}%</span></td>${cells.slice(0, 1).join('')}</tr>` +
          cells.slice(1).map((c) => `<tr>${c}</tr>`).join(''),
      );
    }
    const overall = allN ? allMean / allN : 0;
    host.innerHTML = `
      <table class="spec-table"><thead><tr><th>TWS</th><th>TWA</th><th>仿真 kn</th><th>参考 kn</th><th>误差</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>
      <div class="hint" style="margin-top:10px">所选风速平均绝对误差 <b class="${overall < 8 ? 'pill good' : 'pill bad'}">${overall.toFixed(2)}%</b>（验收阈值 8%）</div>`;
  }

  unmount(): void {
    this.chart = null;
  }
}
