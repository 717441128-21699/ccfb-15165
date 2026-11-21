/** 应用入口：装配路由与四个页面，处理标签切换与画布自适应。 */
import { Router, type PageId } from './ui/router';
import { SailingPage } from './ui/pages/sailing-page';
import { TrimPage } from './ui/pages/trim-page';
import { PolarPage } from './ui/pages/polar-page';
import { BoatPage } from './ui/pages/boat-page';
import { simStore } from './state/store';

const root = document.querySelector('#page-root') as HTMLElement;
const router = new Router(root, {
  sailing: () => new SailingPage(),
  trim: () => new TrimPage(),
  polar: () => new PolarPage(),
  boat: () => new BoatPage(),
});

function activate(id: PageId): void {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', (t as HTMLElement).dataset.page === id));
  router.go(id);
}

document.querySelector('#tabs')?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.tab') as HTMLElement | null;
  if (btn?.dataset.page) activate(btn.dataset.page as PageId);
});

window.addEventListener('resize', () => window.dispatchEvent(new CustomEvent('canvas-resize')));

// 启动
activate('sailing');
const s = simStore.get();
document.querySelector('#status-text')!.textContent =
  `当前船型：${simStore.spec().name} · 真风 ${s.twsKn}kn / TWA ${s.twaDeg}°`;
simStore.subscribe((st) => {
  document.querySelector('#status-text')!.textContent =
    `当前船型：${simStore.spec().name} · 真风 ${st.twsKn}kn / TWA ${st.twaDeg}°`;
});
