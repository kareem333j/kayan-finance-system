import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import initSqlJs from 'npm:sql.js@1.14.2';
import {Store,CloudServer,CloudConflict,SqlJsAdapter} from './domain.js';

const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const SQL=await initSqlJs({wasmBinary:new Uint8Array(await Deno.readFile(new URL('./sql-wasm.wasm',import.meta.url))).buffer});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
const safeUser=(m:any)=>({id:m.id,username:m.username,name:m.name,role:m.role,active:m.active,is_hidden:m.is_hidden});
async function checked(query:any){const {data,error}=await query;if(error)throw fail('تعذر إكمال العملية في قاعدة البيانات',503);return data;}

Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const text=await req.text();if(text.length>12_000_000)throw fail('حجم الطلب أكبر من المسموح',413);
  const body=JSON.parse(text),workspace=body.workspaceId;
  if(!/^[a-f0-9-]{36}$/i.test(workspace||''))throw fail('مساحة الشركة غير صحيحة');
  if(body.action==='login'){
   if(typeof body.username!=='string'||typeof body.password!=='string'||body.password.length>200)throw fail('بيانات الدخول غير صحيحة',401);
   const rows=await checked(service.from('kayan_members').select('*').eq('workspace_id',workspace).ilike('username',body.username.replace(/[%_]/g,'\\$&')).limit(1));
   const member=rows[0];
   // Always hit Auth, including unknown usernames, to use Auth's password rate
   // limiting and avoid returning a membership-existence response.
   const auth=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await auth.auth.signInWithPassword({email:member?.login_email||`unknown@${workspace}.invalid`,password:body.password});
   if(error||!member?.active||data.user?.id!==member.id)throw fail('بيانات الدخول غير صحيحة أو الحساب متوقف',401);
   return reply({session:data.session,user:safeUser(member)});
  }
  const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'')||'';
  const {data:identity,error:authError}=await service.auth.getUser(token);
  if(authError||!identity.user)throw fail('انتهت جلسة الدخول؛ سجّل الدخول مجددًا',401);
  const member=await checked(service.from('kayan_members').select('*').eq('id',identity.user.id).eq('workspace_id',workspace).maybeSingle());
  if(!member?.active)throw fail('الحساب غير متاح في هذه الشركة',403);
  const user=safeUser(member);
  if(body.action==='me')return reply(user);
  if(body.action==='accounts'){
   if(user.role==='operator')throw fail('هذه العملية متاحة للأدمن فقط',403);
   let query=service.from('kayan_members').select('id,username,name,role,active,is_hidden').eq('workspace_id',workspace);
   if(user.role!=='super_admin')query=query.eq('is_hidden',false);
   return reply(await checked(query.order('username')));
  }
  if(body.action==='account.save'){
   if(user.role==='operator')throw fail('هذه العملية متاحة للأدمن فقط',403);
   const v=body.value;
   if(!v||!/^[a-zA-Z0-9_.-]{3,40}$/.test(v.username)||typeof v.name!=='string'||!v.name.trim()||v.name.length>100||!['operator','admin','super_admin'].includes(v.role)||typeof v.active!=='boolean'||(v.is_hidden!==undefined&&typeof v.is_hidden!=='boolean'))throw fail('راجع بيانات الحساب');
   const old=v.id?await checked(service.from('kayan_members').select('*').eq('id',v.id).eq('workspace_id',workspace).maybeSingle()):null;
   if(v.id&&(!old||(old.is_hidden&&user.role!=='super_admin')))throw fail('الحساب غير موجود',404);
   if(user.role!=='super_admin'&&(v.role==='super_admin'||old?.role==='super_admin'||(v.is_hidden??false)!==(old?.is_hidden??false)))throw fail('هذه العملية متاحة للسوبر أدمن فقط',403);
   if(v.password!==undefined&&(typeof v.password!=='string'||v.password.length<8||v.password.length>200))throw fail('كلمة المرور 8 أحرف على الأقل');
   if(!old&&!v.password)throw fail('كلمة المرور مطلوبة');
   let id=old?.id;const email=old?.login_email||`${crypto.randomUUID()}@${workspace}.kayan.invalid`;
   if(!old){const {data,error}=await service.auth.admin.createUser({email,password:v.password,email_confirm:true});if(error)throw fail('تعذر إنشاء الحساب');id=data.user.id;}
   try{
    const {data,error}=await service.rpc('kayan_save_member',{p_workspace:workspace,p_actor:user.id,p_id:id,p_value:{username:v.username,name:v.name.trim(),role:v.role,active:v.active,is_hidden:v.is_hidden??old?.is_hidden??false,login_email:email},p_expected:old?.version??0});
    if(error)throw fail('تعذر حفظ الحساب؛ تحقق من الاسم والصلاحيات وحدّث القائمة',409);
    if(old&&v.password){const {error}=await service.auth.admin.updateUserById(id,{password:v.password});if(error)throw fail('حُفظت بيانات الحساب لكن تعذر تغيير كلمة المرور؛ أعد المحاولة',503);}
    return reply(safeUser(data));
   }catch(e){if(!old)await service.auth.admin.deleteUser(id);throw e;}
  }
  if(body.action==='password'){
   const v=body.value;if(typeof v?.password!=='string'||v.password.length<8||v.password.length>200)throw fail('كلمة المرور 8 أحرف على الأقل');
   const auth=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const {error}=await auth.auth.signInWithPassword({email:member.login_email,password:v.currentPassword});if(error)throw fail('كلمة المرور الحالية غير صحيحة',401);
   const {error:updateError}=await service.auth.admin.updateUserById(user.id,{password:v.password});if(updateError)throw fail('تعذر تغيير كلمة المرور',503);return reply(true);
  }
  const repository={
   load:async(since?:number)=>{if(since!==undefined){const head=await checked(service.from('kayan_workspaces').select('revision').eq('id',workspace).single());if(head.revision===since)return {...head,snapshot:null};}return await checked(service.from('kayan_workspaces').select('revision,snapshot').eq('id',workspace).single());},
   receipt:async(id:string)=>await checked(service.from('kayan_receipts').select('actor,operation,result,revision').eq('workspace_id',workspace).eq('id',id).maybeSingle()),
   profiles:async()=>await checked(service.from('kayan_members').select('id,is_hidden').eq('workspace_id',workspace)),
   commit:async(base:number,operation:any,snapshot:any,result:any)=>{
    const {data,error}=await service.rpc('kayan_commit',{p_workspace:workspace,p_base:base,p_operation:operation,p_snapshot:snapshot,p_result:result??null});
    if(error)throw fail('تعذر تأكيد العملية؛ راجع صلاحية الحساب وحالة الخدمة',503);return data;
   }
  };
  const server=new CloudServer(repository,()=>new Store(':memory:',new SqlJsAdapter(new SQL.Database())));
  if(body.action==='pull')return reply(await server.pull(user,Number(body.since??-1)));
  if(body.action==='execute'){
   const op=body.operation;
   if(!op||!/^[a-f0-9-]{36}$/i.test(op.id)||op.actor!==user.id||!Number.isSafeInteger(op.baseRevision)||typeof op.method!=='string')throw fail('عملية مزامنة غير صالحة');
   return reply(await server.execute(op,user));
  }
  throw fail('عملية غير معروفة');
 }catch(e){const status=e instanceof CloudConflict?409:(e as any).status||422;return reply({error:(e as Error).message||'تعذر إكمال العملية'},status);}
});
