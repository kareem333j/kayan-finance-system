import {createClient} from '@supabase/supabase-js';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {Store} from '../src/main/store';import {captureBusiness} from '../src/main/business-snapshot';
const config=JSON.parse(readFileSync('cloud.public.json','utf8'));
const owner=createClient(config.url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const workspaceId=randomUUID(),users:string[]=[],password=randomBytes(24).toString('hex');
const directory=mkdtempSync(path.join(os.tmpdir(),'kayan-live-'));
const make=()=>createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
async function call(client:any,action:string,values:any={}){const r=await client.functions.invoke('payroll',{body:{action,workspaceId,...values}});if(r.error){const res=r.error.context;let message=r.error.message;if(res instanceof Response){try{message=(await res.json()).error||message;}catch{}}throw Error(message);}return r.data;}
async function login(client:any,username:string,pass=password){const result=await call(client,'login',{username,password:pass});await client.auth.setSession(result.session);return result.user;}
const a=make(),b=make(),regular=make();
try{
 const workspace=await owner.from('kayan_workspaces').insert({id:workspaceId,name:'Temporary integration test'});if(workspace.error)throw Error('Cannot create isolated test workspace');
 const email=`${randomUUID()}@${workspaceId}.kayan.invalid`,auth=await owner.auth.admin.createUser({email,password,email_confirm:true});if(auth.error)throw Error('Cannot create test account');const root=auth.data.user.id;users.push(root);
 const member=await owner.from('kayan_members').insert({id:root,workspace_id:workspaceId,username:'testroot',name:'Test root',login_email:email,role:'super_admin'});if(member.error)throw Error('Cannot create test membership');
 await login(a,'testroot');await login(b,'testroot');
 const source=new Store(path.join(directory,'fixture.sqlite'));
 const operation=(method:string,payload:any,actor=root,baseRevision=0)=>({id:randomUUID(),method,payload,actor,baseRevision,createdAt:new Date().toISOString()});
 try{await call(a,'execute',{operation:operation('workspace.seed',captureBusiness(source))});}finally{source.close();}
 const employee=(code:string)=>({code,name:'موظف اختبار '+code,basic:'6000',paymentMethod:'نقدي',active:true});
 const first=operation('employee.save',employee('LIVE-A')),second=operation('employee.save',employee('LIVE-B'));
 await Promise.all([call(a,'execute',{operation:first}),call(b,'execute',{operation:second})]);
 await call(b,'execute',{operation:first});
 const view=await call(a,'pull',{since:-1});assert.equal(view.snapshot.employees.length,2);assert.equal(view.revision,3);
 const original=JSON.parse(view.snapshot.employees[0].data);
 await call(a,'execute',{operation:operation('employee.save',{...original,name:'تعديل أول'})});
 await assert.rejects(call(b,'execute',{operation:operation('employee.save',{...original,name:'تعديل متعارض'})}));
 const operator=await call(a,'account.save',{value:{username:'testoperator',name:'Test operator',role:'operator',active:true,password}});users.push(operator.id);await login(regular,'testoperator');
 await assert.rejects(call(regular,'accounts'));
 const admin=await call(a,'account.save',{value:{username:'testadmin',name:'Test admin',role:'admin',active:true,password}});users.push(admin.id);
 const hidden=await call(a,'account.save',{value:{username:'testhidden',name:'Test hidden',role:'operator',active:true,is_hidden:true,password}});users.push(hidden.id);
 await login(b,'testadmin');assert.equal((await call(b,'accounts')).some((p:any)=>p.id===hidden.id),false);
 await assert.rejects(call(b,'account.save',{value:{...hidden,is_hidden:false}}));
 // Existing local passwords migrate once; later password changes take priority.
 const legacyPassword=randomBytes(16).toString('hex'),salt=randomBytes(24).toString('hex');
 const legacy=await owner.from('kayan_legacy_passwords').insert({user_id:operator.id,salt,hash:scryptSync(legacyPassword,salt,64).toString('hex')});if(legacy.error)throw Error('Cannot prepare legacy migration test');
 await login(regular,'testoperator',legacyPassword);
 const remaining=await owner.from('kayan_legacy_passwords').select('user_id').eq('user_id',operator.id);assert.equal(remaining.data?.length,0);
 const preview=await call(a,'reset.preview');assert.equal(preview.employees,2);
 const beforeRestore=await call(a,'pull',{since:-1});
 const restoring=operation('backup.restore',{snapshot:beforeRestore.snapshot,expectedRevision:beforeRestore.revision,confirmation:'RESTORE COMPANY'},root,beforeRestore.revision);
 await assert.rejects(call(regular,'execute',{operation:{...restoring,id:randomUUID(),actor:operator.id}}));
 await call(a,'execute',{operation:restoring});
 const saved=await owner.from('kayan_backups').select('revision').eq('workspace_id',workspaceId).eq('revision',beforeRestore.revision);assert.equal(saved.data?.length,1);
 console.log('PASS live Supabase: two devices, concurrency, exactly-once retries, conflicts, roles, hidden accounts, legacy passwords, reset preview and restore with backup.');
}finally{
 await Promise.all([a.auth.signOut({scope:'local'}),b.auth.signOut({scope:'local'}),regular.auth.signOut({scope:'local'})]);
 for(const id of users)await owner.auth.admin.deleteUser(id);
 for(const table of ['kayan_receipts','kayan_backups','kayan_notifications'])await owner.from(table).delete().eq('workspace_id',workspaceId);
 await owner.from('kayan_workspaces').delete().eq('id',workspaceId);
 rmSync(directory,{recursive:true,force:true});
}
