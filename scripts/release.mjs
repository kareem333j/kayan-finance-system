import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const [version,repository]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+$/.test(version||'')||!/^[-\w.]+\/[-\w.]+$/.test(repository||''))throw Error('Usage: npm run release -- 0.4.1 owner/repository');
// Desktop users never receive publisher credentials. The owner can use the
// official CLI/OS credential helpers instead of copying secrets into files.
if(!process.env.SUPABASE_SERVICE_ROLE_KEY){const {ownerEnvironment}=await import('./owner-env.mjs');Object.assign(process.env,ownerEnvironment('cpihwwbjjqxxyweblfsn'));}
if(!process.env.GH_TOKEN&&!process.env.GITHUB_TOKEN){const {githubCredential}=await import('./owner-env.mjs');process.env.GH_TOKEN=githubCredential();}
const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
if(!token||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Publisher credentials required in the terminal environment; never put them in application files.');
if(!existsSync('cloud.public.json'))throw Error('Configure and verify the company workspace first.');
const config=JSON.parse(readFileSync('cloud.public.json','utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const cmp=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;};
if(cmp(version,pkg.version)<=0)throw Error('The release version must be higher than the current version.');
const [owner,repo]=repository.split('/');
async function github(endpoint,init={}){const response=await fetch('https://api.github.com/repos/'+repository+endpoint,{...init,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...init.headers}});if(!response.ok)throw Error('GitHub publishing request failed ('+response.status+').');return response.json();}
// Ensure this is a public binary-only distribution repository.
const info=await github('');if(info.private)throw Error('Use a public repository for unauthenticated desktop update downloads.');
pkg.version=version;pkg.build.publish=[{provider:'github',owner,repo,releaseType:'draft'}];
writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
const run=(command,args)=>{const result=spawnSync(command,args,{stdio:'inherit',shell:process.platform==='win32',windowsHide:true,env:{...process.env,GH_TOKEN:token}});if(result.status!==0)throw Error('Release preparation failed. Nothing was made public.');};
run('npm',['install','--package-lock-only','--ignore-scripts']);run('npm',['test']);run('npm',['run','build:cloud']);run('npm',['run','build']);
run('npx',['--yes','supabase','functions','deploy','payroll','--project-ref',new URL(config.url).hostname.split('.')[0],'--use-api','--output-format','text']);
run('npx',['electron-builder','--win','nsis','--publish','always']);
if(process.env.KAYAN_ADMIN_PASSWORD){process.env.KAYAN_PACKAGED_TEST='release/win-unpacked/Kayan Payroll.exe';run('node',['scripts/cloud-ui-smoke.mjs']);}
const releases=await github('/releases');const release=releases.find(r=>r.tag_name==='v'+version||r.tag_name===version);
if(!release||!release.draft||!release.assets.some(a=>a.name==='latest.yml')||!release.assets.some(a=>a.name.endsWith('.exe')))throw Error('The draft release is missing its installer/manifest; it was not published.');
await github('/releases/'+release.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,prerelease:false})});
const cloud=createClient(config.url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {error}=await cloud.from('kayan_notifications').update({updated_at:new Date().toISOString()}).eq('workspace_id',config.workspaceId);
console.log(error?'Release published; immediate notification failed, periodic checks will discover it.':'Release published and connected devices notified.');
