/** 用 esbuild 把 node 侧脚本（VPP 校验/性能基准）打包成单文件 ESM。 */
import { build } from 'esbuild';

const entryPoints = process.argv.slice(2);
if (entryPoints.length === 0) {
  console.error('用法: node scripts/build-node.mjs <entry.ts> ...');
  process.exit(1);
}

await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: 'dist-node',
  outbase: '.',
  sourcemap: false,
});
