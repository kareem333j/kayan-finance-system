import {spawnSync} from 'node:child_process';
// Official credential helpers; returned secrets stay in process memory.
export function ownerEnvironment(projectRef){
 if(!/^[a-z0-9]{20}$/.test(projectRef))throw Error('Invalid project reference');
 const r=spawnSync('npx',['--yes','supabase','projects','api-keys','--project-ref',projectRef,'--output','json','--agent','no'],{encoding:'utf8',shell:process.platform==='win32',windowsHide:true});
 if(r.status!==0)throw Error('Sign in to Supabase CLI first.');
 const keys=JSON.parse(r.stdout),service=keys.find(k=>k.name==='service_role')?.api_key,publishable=keys.find(k=>k.type==='publishable')?.api_key||keys.find(k=>k.name==='anon')?.api_key;
 if(!service||!publishable)throw Error('Project keys unavailable');
 return {...process.env,SUPABASE_URL:`https://${projectRef}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_PUBLISHABLE_KEY:publishable};
}
export function githubCredential(){
 const r=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
 const values=Object.fromEntries(r.stdout.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)]}));
 if(r.status!==0||!values.password)throw Error('Sign in to GitHub in Git Credential Manager first.');return values.password;
}
