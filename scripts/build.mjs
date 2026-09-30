import {existsSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
await build({entryPoints:['src/main/index.ts'], bundle:true, platform:'node', format:'cjs', target:'node24', outfile:'dist/main/index.cjs', external:['electron']});
await build({entryPoints:['src/preload/index.ts'], bundle:true, platform:'node', format:'cjs', outfile:'dist/main/preload.cjs', external:['electron']});
await viteBuild();

if(existsSync('dist/cloud-config.json'))rmSync('dist/cloud-config.json');
