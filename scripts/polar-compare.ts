/** Node 脚本侧入口：复用 src/vpp/polar-compare 的实现。 */
export { interpSpeedKn, summarizeErrors } from '../src/vpp/polar-compare';
export type { ErrorRow } from '../src/vpp/polar-compare';

/** 校验用的细密风角网格（覆盖参考表全部风角）。 */
export const INTERP_TWA = [
  30, 35, 40, 42, 45, 50, 52, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120,
  125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180,
];
