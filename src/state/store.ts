/**
 * 全局仿真状态（轻量响应式 store）。
 * 保存当前船型、真风、调帆、航行页动态量，并提供订阅通知。
 */
import { BOAT_SPECS, getBoatSpec } from '../physics/boat-specs';
import type { BoatSpec, SailingControls } from '../physics/types';
import { KN_TO_MS } from '../vpp/reference-polars';

export interface SimState {
  boatId: string;
  /** 真风速（节，UI 用） */
  twsKn: number;
  /** 真风角（度，相对船首，0=顶风，180=顺风） */
  twaDeg: number;
  controls: SailingControls;
  /** 航行页当前航速 m/s */
  boatSpeed: number;
  /** 累计航程 m */
  distance: number;
  /** 仿真累计时间 s */
  simTime: number;
}

type Listener = (s: SimState) => void;

const DEFAULT_CONTROLS = (spec: BoatSpec): SailingControls => ({
  main: { fraction: 1, trimDeg: 14 },
  jib: { fraction: spec.jibArea > 0 ? 1 : 0, trimDeg: 14 },
  rudderDeg: 0,
});

class SimStore {
  private state: SimState;
  private listeners = new Set<Listener>();

  constructor() {
    const spec = BOAT_SPECS[0];
    this.state = {
      boatId: spec.id,
      twsKn: 12,
      twaDeg: 60,
      controls: DEFAULT_CONTROLS(spec),
      boatSpeed: 0,
      distance: 0,
      simTime: 0,
    };
  }

  get(): SimState {
    return this.state;
  }

  spec(): BoatSpec {
    return getBoatSpec(this.state.boatId);
  }

  tws(): number {
    return this.state.twsKn * KN_TO_MS;
  }

  set(patch: Partial<SimState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  /** 换船时重置调帆到该船的默认全展状态。 */
  setBoat(boatId: string): void {
    const spec = getBoatSpec(boatId);
    this.state = {
      ...this.state,
      boatId,
      controls: DEFAULT_CONTROLS(spec),
      boatSpeed: 0,
      distance: 0,
      simTime: 0,
    };
    this.emit();
  }

  updateControls(patch: Partial<SailingControls>): void {
    this.state = { ...this.state, controls: { ...this.state.controls, ...patch } };
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}

export const simStore = new SimStore();
