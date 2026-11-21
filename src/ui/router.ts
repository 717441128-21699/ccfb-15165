/** 简单页面路由：挂载/卸载实现 Page 接口的页面实例。 */
export interface Page {
  mount(): HTMLElement;
  unmount(): void;
}

export type PageId = 'sailing' | 'trim' | 'polar' | 'boat';

export class Router {
  private current: Page | null = null;
  private root: HTMLElement;
  private factories: Record<PageId, () => Page>;

  constructor(root: HTMLElement, factories: Record<PageId, () => Page>) {
    this.root = root;
    this.factories = factories;
  }

  go(id: PageId): void {
    this.current?.unmount();
    this.current = this.factories[id]();
    this.root.innerHTML = '';
    this.root.appendChild(this.current.mount());
  }
}
