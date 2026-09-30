import {spawnSync} from 'node:child_process';
// Produces a local installer only. It cannot deploy, upload, or notify devices.
for(const [command,args] of [['npm',['test']],['npm',['run','build']],['npx',['--no-install','electron-builder','--win','nsis','--publish','never']],['node',['scripts/check-icon.mjs']],['node',['scripts/check-offline.mjs']]]){
 const result=spawnSync(command,args,{stdio:'inherit',shell:process.platform==='win32',windowsHide:true});
 if(result.status!==0)process.exit(result.status||1);
}
