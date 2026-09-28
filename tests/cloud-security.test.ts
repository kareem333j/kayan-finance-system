import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
let db:PGlite;
const workspace=randomUUID(),otherWorkspace=randomUUID(),root=randomUUID(),admin=randomUUID(),user=randomUUID(),hidden=randomUUID();
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create publication supabase_realtime;`);
 await db.exec(readFileSync('supabase/migrations/202609280001_cloud.sql','utf8'));
 await db.query('insert into public.kayan_workspaces(id,name) values($1,$2),($3,$4)',[workspace,'Company',otherWorkspace,'Other']);
 for(const [id,role,name,isHidden] of [[root,'super_admin','root',false],[admin,'admin','admin',false],[user,'operator','user',false],[hidden,'operator','hidden',true]]){
  await db.query('insert into auth.users values($1)',[id]);
  await db.query('insert into public.kayan_members(id,workspace_id,username,name,login_email,role,is_hidden) values($1,$2,$3,$3,$4,$5,$6)',[id,workspace,name,`${name}@example.invalid`,role,isHidden]);
 }
 await db.query('insert into kayan_notifications(workspace_id) values($1),($2)',[workspace,otherWorkspace]);
},30_000);
afterAll(async()=>{await db.close();});
describe('cloud database authorization',()=>{
 it('denies raw payroll, members and commits to authenticated clients',async()=>{
  await db.exec('set role authenticated');
  try{await expect(db.query('select * from kayan_workspaces')).rejects.toThrow(/permission denied/);await expect(db.query('select * from kayan_members')).rejects.toThrow(/permission denied/);await expect(db.query('select kayan_commit($1,0,$2,$3,$4)',[workspace,{}, {},true])).rejects.toThrow(/permission denied/);}finally{await db.exec('reset role');}
 });
 it('isolates realtime events to the active member workspace',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
  try{const rows=await db.query('select workspace_id from kayan_notifications');expect(rows.rows).toEqual([{workspace_id:workspace}]);}finally{await db.exec('reset role');}
 });
 it('rechecks the member privilege inside the commit transaction',async()=>{
  await expect(db.query('select kayan_commit($1,0,$2,$3,$4)',[workspace,{id:randomUUID(),actor:user,method:'settings.save'}, {},true])).rejects.toThrow(/Admin required/);
 });
 it('blocks administrators from managing hidden users or escalating roles',async()=>{
  const value={username:'hidden',name:'Hidden',login_email:'hidden@example.invalid',role:'operator',active:true,is_hidden:true};
  await expect(db.query('select kayan_save_member($1,$2,$3,$4,1)',[workspace,admin,hidden,value])).rejects.toThrow(/Super admin/);
  await expect(db.query('select kayan_save_member($1,$2,$2,$3,1)',[workspace,admin,{...value,username:'admin',role:'super_admin',is_hidden:false}])).rejects.toThrow(/Super admin/);
 });
 it('atomically accepts a revision once and makes duplicate ids harmless',async()=>{
  const op={id:randomUUID(),actor:root,method:'workspace.seed'};
  const first=await db.query<{kayan_commit:boolean}>('select kayan_commit($1,0,$2,$3,$4)',[workspace,op,{settings:[]},true]);expect(first.rows[0].kayan_commit).toBe(true);
  // A normal replay is rejected by revision/id without mutating the head.
  const repeated=await db.query<{kayan_commit:boolean}>('select kayan_commit($1,0,$2,$3,$4)',[workspace,{...op,method:'employee.save'},{settings:[]},true]);expect(repeated.rows[0].kayan_commit).toBe(false);
  const rows=await db.query<{revision:number}>('select revision from kayan_workspaces where id=$1',[workspace]);expect(Number(rows.rows[0].revision)).toBe(1);
 });
});
