/** 角度/弧度转换与通用数学工具。所有角度对外一律用“度”，物理计算内部用弧度。 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const deg2rad = (deg: number): number => deg * DEG2RAD;
export const rad2deg = (rad: number): number => rad * RAD2DEG;

/** 把角度归一化到 [0, 360)。 */
export function normalize360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** 把角度归一化到 (-180, 180]。 */
export function normalize180(deg: number): number {
  const d = normalize360(deg);
  return d > 180 ? d - 360 : d;
}

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * 一维查表线性插值。
 * @param xs 必须严格递增
 * @param ys 与 xs 等长
 * 超出范围时夹到端点。
 */
export function interp1(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  // 二分查找区间
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return lerp(ys[lo], ys[hi], t);
}

/** 平滑阶跃 0→1，用于两套气动系数在顺风段的混合。 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 二元函数黄金/对分求根：f(lo) 与 f(hi) 异号，返回使 f≈0 的点。 */
export function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol = 1e-4,
  maxIter = 40,
): number {
  let flo = f(lo);
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) * 0.5;
    const fm = f(mid);
    if (Math.abs(fm) < tol || (hi - lo) * 0.5 < tol) return mid;
    if ((flo < 0) !== (fm < 0)) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) * 0.5;
}

/** 在一维网格上找使 f 最大的点，先粗扫再在最优区间二次细分。返回 {x, f}。 */
export function gridMaximize(
  f: (x: number) => number,
  lo: number,
  hi: number,
  coarseSteps: number,
  refineSteps: number,
): { x: number; f: number } {
  const dx = (hi - lo) / coarseSteps;
  let bestX = lo;
  let bestF = f(lo);
  for (let i = 1; i <= coarseSteps; i++) {
    const x = lo + i * dx;
    const v = f(x);
    if (v > bestF) {
      bestF = v;
      bestX = x;
    }
  }
  // 在最优点附近细分
  const rLo = Math.max(lo, bestX - dx);
  const rHi = Math.min(hi, bestX + dx);
  const rdx = (rHi - rLo) / refineSteps;
  for (let i = 0; i <= refineSteps; i++) {
    const x = rLo + i * rdx;
    const v = f(x);
    if (v > bestF) {
      bestF = v;
      bestX = x;
    }
  }
  return { x: bestX, f: bestF };
}
