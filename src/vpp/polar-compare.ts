import type { PolarCurve } from './vpp';
import { MS_TO_KN } from './reference-polars';

/** 极曲线按风角线性插值取船速（节），超出范围夹到端点。 */
export function interpSpeedKn(curve: PolarCurve, twaDeg: number): number | null {
  const pts = curve.points;
  if (pts.length === 0) return null;
  if (twaDeg <= pts[0].twaDeg) return pts[0].boatSpeed * MS_TO_KN;
  if (twaDeg >= pts[pts.length - 1].twaDeg) return pts[pts.length - 1].boatSpeed * MS_TO_KN;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (twaDeg >= a.twaDeg && twaDeg <= b.twaDeg) {
      const t = (twaDeg - a.twaDeg) / (b.twaDeg - a.twaDeg);
      return (a.boatSpeed + (b.boatSpeed - a.boatSpeed) * t) * MS_TO_KN;
    }
  }
  return null;
}

export interface ErrorRow {
  boatId: string;
  twsKn: number;
  twaDeg: number;
  simKn: number;
  refKn: number;
  pct: number;
}

export function summarizeErrors(rows: ErrorRow[]): {
  perBoat: Record<string, { meanAbs: number; maxAbs: number; meanBias: number }>;
  overall: { meanAbs: number; maxAbs: number; meanBias: number };
} {
  const groups = new Map<string, ErrorRow[]>();
  for (const r of rows) {
    const g = groups.get(r.boatId) ?? [];
    g.push(r);
    groups.set(r.boatId, g);
  }
  const stats = (list: ErrorRow[]) => {
    const abs = list.map((r) => Math.abs(r.pct));
    return {
      meanAbs: abs.reduce((a, b) => a + b, 0) / abs.length,
      maxAbs: Math.max(...abs),
      meanBias: list.reduce((a, r) => a + r.pct, 0) / list.length,
    };
  };
  const perBoat: Record<string, { meanAbs: number; maxAbs: number; meanBias: number }> = {};
  for (const [boatId, list] of groups) perBoat[boatId] = stats(list);
  return { perBoat, overall: stats(rows) };
}
