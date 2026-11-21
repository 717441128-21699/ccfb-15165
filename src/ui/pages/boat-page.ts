/**
 * 船型页：五种级别帆船卡片、完整物理参数表、Canvas 侧视示意，
 * 点击卡片切换全局当前船型。
 */
import type { Page } from '../router';
import { BOAT_SPECS } from '../../physics/boat-specs';
import type { BoatSpec } from '../../physics/types';
import { simStore } from '../../state/store';

export class BoatPage implements Page {
  private root = document.createElement('div');

  mount(): HTMLElement {
    this.root.innerHTML = `
      <div class="boat-grid" id="boat-grid"></div>
      <div class="layout" style="margin-top:16px">
        <div class="panel">
          <h2 id="detail-name">船型参数</h2>
          <table class="spec-table" id="spec-table"></table>
        </div>
        <div class="panel">
          <h2>船型示意（侧视）</h2>
          <canvas class="scene" style="height:300px"></canvas>
          <div class="hint" id="boat-hint"></div>
        </div>
      </div>`;
    this.buildGrid();
    this.showDetail(simStore.spec());
    return this.root;
  }

  private buildGrid(): void {
    const host = this.root.querySelector('#boat-grid') as HTMLElement;
    host.innerHTML = BOAT_SPECS.map((b) => {
      const area = b.mainArea + b.jibArea;
      return `<div class="boat-card ${b.id === simStore.get().boatId ? 'selected' : ''}" data-id="${b.id}">
        <h3>${b.name}</h3>
        <p>${b.description}</p>
        <div class="spec-table" style="font-size:12px">
          <tr><td>水线长</td><td>${b.lwl} m</td></tr>
          <tr><td>总帆面积</td><td>${area.toFixed(1)} m²</td></tr>
          <tr><td>质量</td><td>${b.mass} kg</td></tr>
          <tr><td>${b.multihull ? '多体船' : '单体船'}</td><td>最大横倾 ${b.maxHeelDeg}°</td></tr>
        </div>
      </div>`;
    }).join('');
    host.querySelectorAll('.boat-card').forEach((card) =>
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.id!;
        simStore.setBoat(id);
        host.querySelectorAll('.boat-card').forEach((c) => c.classList.toggle('selected', c === card));
        this.showDetail(simStore.spec());
      }),
    );
  }

  private showDetail(spec: BoatSpec): void {
    (this.root.querySelector('#detail-name') as HTMLElement).textContent = `${spec.name} · 物理参数`;
    const rows: Array<[string, string]> = [
      ['水线长 LWL', `${spec.lwl} m`],
      ['船宽 Beam', `${spec.beam} m`],
      ['总质量（含船员）', `${spec.mass} kg`],
      ['主帆面积', `${spec.mainArea} m²`],
      ['前帆面积', spec.jibArea > 0 ? `${spec.jibArea} m²` : '无'],
      ['帆气动中心高度', `${spec.sailCEHeight} m`],
      ['湿表面积', `${spec.wettedArea} m²`],
      ['扶正力臂斜率 GZ', `${spec.gzSlope} m/rad`],
      ['龙骨升力线斜率', `${spec.keelLiftSlope}`],
      ['龙骨面积', `${spec.keelArea} m²`],
      ['剩余阻力缩放 rrScale', `${spec.rrScale}`],
      ['滑行因子 planing', `${spec.planingFactor}`],
      ['球帆增益', `${spec.spinnakerGain}×`],
      ['最大可持续横倾角', `${spec.maxHeelDeg}°`],
      ['船体类型', spec.multihull ? '多体船' : '单体船'],
    ];
    (this.root.querySelector('#spec-table') as HTMLElement).innerHTML = rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('');
    (this.root.querySelector('#boat-hint') as HTMLElement).textContent =
      `扶正力矩 RM(φ)=Δ·GZ·sinφ；剩余阻力按 Cr(Froude) 查表，planing=${spec.planingFactor} 决定过阻力峰后的减阻程度。`;
    this.drawBoat(spec);
  }

  private drawBoat(spec: BoatSpec): void {
    const canvas = this.root.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);
    // 海平线
    ctx.strokeStyle = 'rgba(150,205,235,0.3)';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.62);
    ctx.lineTo(W, H * 0.62);
    ctx.stroke();

    const scale = Math.min(W / 320, H / 260);
    ctx.save();
    ctx.translate(W / 2, H * 0.62);
    ctx.scale(scale, scale);
    // 桅杆
    const mastH = 150 * Math.max(0.8, spec.sailCEHeight / 4);
    ctx.strokeStyle = '#5b6b7d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(0, -mastH);
    ctx.stroke();
    // 主帆
    ctx.fillStyle = spec.colors.sail;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -mastH);
    ctx.quadraticCurveTo(70, -mastH * 0.4, 78, 8);
    ctx.quadraticCurveTo(20, 14, 0, 12);
    ctx.closePath();
    ctx.fill();
    // 前帆
    if (spec.jibArea > 0) {
      ctx.beginPath();
      ctx.moveTo(0, -mastH * 0.85);
      ctx.quadraticCurveTo(-52, -mastH * 0.35, -58, 8);
      ctx.quadraticCurveTo(-15, 12, 0, 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 船体
    ctx.fillStyle = spec.colors.hull;
    ctx.beginPath();
    ctx.moveTo(-110, 12);
    ctx.quadraticCurveTo(-118, 34, -90, 38);
    ctx.lineTo(92, 38);
    ctx.quadraticCurveTo(118, 32, 108, 12);
    ctx.quadraticCurveTo(0, 22, -110, 12);
    ctx.closePath();
    ctx.fill();
    if (spec.multihull) {
      ctx.fillStyle = spec.colors.hull;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 130, 30, 40, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  unmount(): void {
    // 无持续资源需要释放
  }
}
