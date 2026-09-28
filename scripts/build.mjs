import {existsSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
await build({entryPoints:['src/main/index.ts'], bundle:true, platform:'node', format:'cjs', target:'node24', outfile:'dist/main/index.cjs', external:['electron']});
await build({entryPoints:['src/preload/index.ts'], bundle:true, platform:'node', format:'cjs', outfile:'dist/main/preload.cjs', external:['electron']});
await viteBuild();

if(existsSync('cloud.public.json')){const config=JSON.parse(readFileSync('cloud.public.json','utf8'));if(Object.keys(config).sort().join(',')!=='publishableKey,url,workspaceId'||config.publishableKey.startsWith('sb_secret_'))throw Error('Only public cloud connection settings may be bundled');try{if(JSON.parse(Buffer.from(config.publishableKey.split('.')[1],'base64url').toString()).role==='service_role')throw Error('Service-role keys must never be bundled');}catch(e){if(e.message==='Service-role keys must never be bundled')throw e;}copyFileSync('cloud.public.json','dist/cloud-config.json');}else if(existsSync('dist/cloud-config.json'))rmSync('dist/cloud-config.json');
