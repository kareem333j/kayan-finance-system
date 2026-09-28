import { spawnSync } from 'node:child_process';
import electron from 'electron';
const r=spawnSync(electron,['node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts'],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true});
process.exit(r.status??1);
