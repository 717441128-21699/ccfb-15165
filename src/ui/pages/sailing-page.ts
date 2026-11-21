/**
 * 航行页：实时海面 Canvas、航速/横倾/侧滑/视风仪表、舵与风的手动控制。
 * 每帧物理计时，状态栏显示单帧耗时（用于验证 <1ms 约束）。
 */
import type { Page } from '../router';
import { simStore } from '../../state/store';
import { SailingEngine, clampRudder } from '../../engine/sailing-engine';
import { OceanScene } from '../ocean-scene';
import { MS_TO_KN } from '../../vpp/reference-polars';

export class SailingPage implements Page {
  private root = document.createElement('div');
  private engine: SailingEngine | null = null;
  private scene: OceanScene | null = null;
  private raf = 0;
  private lastTs = 0;
  private elapsed = 0;
  private frameUs = 0;

  mount(): HTMLElement {
    const s = simStore.get();
    this.root.innerHTML = `
      <div class="layout">
        <div class="panel">
          <h2>海面实时航行</h2>
          <canvas class="scene"></canvas>
          <div class="hint">舵 ←/→ 或 A/D，收帆 W/S；真风角 Q/E。横倾与帆形随物理实时变化。</div>
        </div>
        <div class="panel">
          <h2>航行控制与仪表</h2>
          <div class="row"><label>真风速</label><input type="range" id="tws" min="4" max="25" step="0.5" value="${s.twsKn}"><span class="val" id="tws-v">${s.twsKn} kn</span></div>
          <div class="row"><label>真风角 TWA</label><input type="range" id="twa" min="20" max="180" step="1" value="${s.twaDeg}"><span class="val" id="twa-v">${s.twaDeg}°</span></div>
          <div class="row"><label>舵角</label><input type="range" id="rudder" min="-35" max="35" step="1" value="0"><span class="val" id="rudder-v">0°</span></div>
          <div class="metrics">
            <div class="metric"><div class="k">航速</div><div class="v"><span id="m-speed">0</span> <span class="u">kn</span></div></div>
            <div class="metric"><div class="k">横倾</div><div class="v"><span id="m-heel">0</span> <span class="u">°</span></div></div>
            <div class="metric"><div class="k">侧滑</div><div class="v"><span id="m-leeway">0</span> <span class="u">°</span></div></div>
            <div class="metric"><div class="k">视风速</div><div class="v"><span id="m-aws">0</span> <span class="u">kn</span></div></div>
            <div class="metric"><div class="k">视风角</div><div class="v"><span id="m-awa">0</span> <span class="u">°</span></div></div>
            <div class="metric"><div class="k">推力/阻力</div><div class="v"><span id="m-force">0</span> <span class="u">N</span></div></div>
          </div>
          <div class="row" style="margin-top:14px"><button class="btn ghost" id="reset">重置航程</button><span class="hint" id="dist">航程 0 m</span></div>
        </div>
      </div>`;

    const canvas = this.root.querySelector('canvas.scene') as HTMLCanvasElement;
    this.scene = new OceanScene(canvas);
    this.engine = new SailingEngine({
      spec: simStore.spec(),
      controls: simStore.get().controls,
      tws: simStore.tws(),
      trueWindFromDeg: s.twaDeg,
    });

    this.bindControls(canvas);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    return this.root;
  }

  private bindControls(canvas: HTMLCanvasElement): void {
    const set = (id: string, fn: (v: number) => void, fmt: (v: number) => string) => {
      const el = this.root.querySelector('#' + id) as HTMLInputElement;
      const val = this.root.querySelector('#' + id + '-v') as HTMLElement;
      el.addEventListener('input', () => {
        const v = Number(el.value);
        fn(v);
        val.textContent = fmt(v);
      });
    };
    set('tws', (v) => simStore.set({ twsKn: v }), (v) => `${v} kn`);
    set('twa', (v) => simStore.set({ twaDeg: v }), (v) => `${v}°`);
    set('rudder', (v) => simStore.updateControls({ rudderDeg: v }), (v) => `${v}°`);
    (this.root.querySelector('#reset') as HTMLButtonElement).addEventListener('click', () => {
      this.engine?.reset();
      simStore.set({ distance: 0, simTime: 0 });
    });

    window.addEventListener('keydown', this.onKey);
    void canvas;
  }

  private onKey = (e: KeyboardEvent): void => {
    const s = simStore.get();
    const c = s.controls;
    if (e.key === 'ArrowLeft' || e.key === 'a') simStore.updateControls({ rudderDeg: clampRudder(c.rudderDeg - 5) });
    if (e.key === 'ArrowRight' || e.key === 'd') simStore.updateControls({ rudderDeg: clampRudder(c.rudderDeg + 5) });
    if (e.key === 'w' || e.key === 'W') {
      simStore.updateControls({
        main: { ...c.main, fraction: Math.max(0, c.main.fraction - 0.1) },
        jib: { ...c.jib, fraction: Math.max(0, c.jib.fraction - 0.1) },
      });
    }
    if (e.key === 's' || e.key === 'S') {
      simStore.updateControls({
        main: { ...c.main, fraction: Math.min(1, c.main.fraction + 0.1) },
        jib: { ...c.jib, fraction: Math.min(1, c.jib.fraction + 0.1) },
      });
    }
    if (e.key === 'q' || e.key === 'Q') simStore.set({ twaDeg: Math.max(20, s.twaDeg - 5) });
    if (e.key === 'e' || e.key === 'E') simStore.set({ twaDeg: Math.min(180, s.twaDeg + 5) });
  };

  private loop(ts: number): void {
    if (!this.engine || !this.scene) return;
    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    this.elapsed += dt;

    const s = simStore.get();
    this.engine.updateConfig({ spec: simStore.spec(), controls: s.controls, tws: simStore.tws(), trueWindFromDeg: s.twaDeg });
    const t0 = performance.now();
    const frame = this.engine.step(dt);
    this.frameUs = (performance.now() - t0) * 1000;
    // 把实时航速同步到全局 store，供调帆页等用同一航速评估（节流，避免每帧触发订阅）
    if (Math.abs(frame.boatSpeed - s.boatSpeed) > 0.05) {
      simStore.set({ boatSpeed: frame.boatSpeed, distance: Math.hypot(frame.x, frame.y), simTime: this.elapsed });
    }

    this.scene.resize();
    this.scene.render({
      spec: simStore.spec(),
      controls: s.controls,
      result: frame.result,
      boatSpeed: frame.boatSpeed,
      headingDeg: frame.headingDeg,
      twaDeg: frame.twaDeg,
      time: this.elapsed,
      trueWindFromDeg: s.twaDeg,
    });

    this.updateReadouts(frame);
    this.raf = requestAnimationFrame(this.loop);
  }

  private updateReadouts(frame: ReturnType<SailingEngine['step']>): void {
    const r = frame.result;
    const set = (id: string, v: string) => {
      const el = this.root.querySelector('#' + id);
      if (el) el.textContent = v;
    };
    set('m-speed', (frame.boatSpeed * MS_TO_KN).toFixed(1));
    set('m-heel', r.heelDeg.toFixed(1));
    set('m-leeway', r.leewayDeg.toFixed(1));
    set('m-aws', (r.apparentWindSpeed * MS_TO_KN).toFixed(1));
    set('m-awa', r.apparentWindAngleDeg.toFixed(0));
    set('m-force', `${r.totalThrust.toFixed(0)} / ${r.hullResistance.toFixed(0)}`);
    set('dist', `航程 ${frame.x.toFixed(0)}, ${frame.y.toFixed(0)} m · 单帧物理 ${this.frameUs.toFixed(0)} μs`);
    const perf = document.querySelector('#perf-text');
    if (perf) perf.textContent = `物理单帧 ${this.frameUs.toFixed(0)} μs（约束 <1000 μs）`;
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.lastTs = 0;
  }
}
