import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({entryPoints:['scripts/benchmark.ts'],bundle:true,platform:'node',format:'cjs',outfile:'test-results/benchmark.cjs'});
const r=spawnSync(process.execPath,['test-results/benchmark.cjs'],{stdio:'inherit',windowsHide:true});process.exit(r.status??1);
