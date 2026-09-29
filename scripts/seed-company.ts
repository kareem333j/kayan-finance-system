import {createClient} from '@supabase/supabase-js';
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';import path from 'node:path';
import {Store} from '../src/main/store';import {captureBusiness} from '../src/main/business-snapshot';
const config=JSON.parse(readFileSync('cloud.public.json','utf8'));
const owner=createClient(config.url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
const directory=path.join(process.env.APPDATA!,'kayan-payroll','payroll-data'),filename=path.join(directory,'payroll.sqlite');
if(!existsSync(filename))throw Error('Original company database not found');
const local=new Store(filename);
try{
 const accounts=JSON.parse(String(local.db.prepare("SELECT value FROM settings WHERE key='accounts'").pluck().get()||'[]'));
 const existing=await owner.from('kayan_members').select('id,username').eq('workspace_id',config.workspaceId);if(existing.error)throw Error('Membership query failed');
 for(const account of accounts){
  if(existing.data.some(p=>p.username.toLowerCase()===account.username.toLowerCase()))continue;
  const email=`${randomUUID()}@${config.workspaceId}.kayan.invalid`;
  const auth=await owner.auth.admin.createUser({email,password:randomBytes(32).toString('hex'),email_confirm:true});if(auth.error)throw Error('Account migration failed');
  try{
   const profile=await owner.from('kayan_members').insert({id:auth.data.user.id,workspace_id:config.workspaceId,username:account.username,name:account.name,login_email:email,role:account.role,active:account.active,is_hidden:account.is_hidden??false});if(profile.error)throw Error('Membership migration failed');
   const credentials=await owner.from('kayan_legacy_passwords').insert({user_id:auth.data.user.id,salt:account.salt,hash:account.hash});if(credentials.error)throw Error('Password migration failed');
  }catch(e){await owner.auth.admin.deleteUser(auth.data.user.id);throw e;}
 }
 const login=await client.functions.invoke('payroll',{body:{action:'login',workspaceId:config.workspaceId,username:'superadmin',password:process.env.KAYAN_ADMIN_PASSWORD}});if(login.error)throw Error('Cloud sign-in failed');
 await client.auth.setSession(login.data.session);
 const head=await client.functions.invoke('payroll',{body:{action:'pull',workspaceId:config.workspaceId,since:-1}});if(head.error)throw Error('Cannot read cloud workspace');
 if(head.data.initialized)throw Error('Workspace already contains data; refusing to replace it');
 mkdirSync(path.join(directory,'backups'),{recursive:true});await local.backup(path.join(directory,'backups',`before-cloud-live-${Date.now()}.sqlite`));
 const snapshot=captureBusiness(local),operation={id:randomUUID(),method:'workspace.seed',payload:snapshot,actor:login.data.user.id,baseRevision:0,createdAt:new Date().toISOString()};
 const result=await client.functions.invoke('payroll',{body:{action:'execute',workspaceId:config.workspaceId,operation}});if(result.error)throw Error('Data migration failed; original database retained');
 const verify=await client.functions.invoke('payroll',{body:{action:'pull',workspaceId:config.workspaceId,since:-1}});if(verify.error||verify.data.snapshot.employees.length!==snapshot.employees.length||verify.data.snapshot.entries.length!==snapshot.entries.length)throw Error('Cloud migration verification failed');
 writeFileSync(path.join(directory,'cloud-migration.json'),JSON.stringify({workspaceId:config.workspaceId,sourceAuditMax:local.resetPreview().revision,seededAt:new Date().toISOString()},null,2));
 console.log(JSON.stringify({migrated:true,employees:snapshot.employees.length,periods:snapshot.periods.length,entries:snapshot.entries.length,accounts:accounts.length,originalDatabasePreserved:true}));
}finally{local.close();await client.auth.signOut({scope:'local'});}
