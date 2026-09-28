import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {safeStorage} from 'electron';
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {CloudConfig,CloudOperation,CloudUser} from '../shared/cloud';
import {CloudTransportError,type CloudTransport} from './sync-engine';

export const configSchema=z.object({url:z.url().refine(s=>{const u=new URL(s);return u.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)&&!u.username&&!u.password&&u.pathname==='/';},'استخدم رابط مشروع Supabase الرسمي'),publishableKey:z.string().min(20).max(2000).refine(s=>!s.startsWith('sb_secret_')&&!isServiceKey(s),'استخدم المفتاح العام فقط؛ مفتاح الإدارة ممنوع'),workspaceId:z.uuid()});
function isServiceKey(value:string){try{return JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString()).role==='service_role';}catch{return false;}}
export function readCloudConfig(dataDir:string):CloudConfig|null{const file=path.join(dataDir,'cloud-config.json');return existsSync(file)?configSchema.parse(JSON.parse(readFileSync(file,'utf8'))):null;}
export function writeCloudConfig(dataDir:string,value:unknown){const config=configSchema.parse(value),file=path.join(dataDir,'cloud-config.json');writeFileSync(file+'.tmp',JSON.stringify(config,null,2));renameSync(file+'.tmp',file);return config;}

export class CloudClient implements CloudTransport {
 readonly client:SupabaseClient;
 constructor(readonly config:CloudConfig,dataDir:string){
  const filename=path.join(dataDir,`cloud-session-${config.workspaceId}.bin`);
  const storage={
   getItem:(_key:string)=>{try{return existsSync(filename)&&safeStorage.isEncryptionAvailable()?safeStorage.decryptString(readFileSync(filename)):null;}catch{return null;}},
   setItem:(_key:string,value:string)=>{if(!safeStorage.isEncryptionAvailable())throw Error('تعذر حماية جلسة الدخول على هذا الجهاز');writeFileSync(filename+'.tmp',safeStorage.encryptString(value));renameSync(filename+'.tmp',filename);},
   removeItem:()=>{if(existsSync(filename))unlinkSync(filename);}
  };
  this.client=createClient(config.url,config.publishableKey,{auth:{storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(25_000)})}});
 }
 async call(action:string,value:Record<string,any>={}){
  try{
   const {data,error}=await this.client.functions.invoke('payroll',{body:{workspaceId:this.config.workspaceId,action,...value}});
   if(error){const response=error.context;if(response instanceof Response){let message='تعذر الاتصال بخدمة الشركة';try{message=(await response.json()).error||message;}catch{}throw new CloudTransportError(message,response.status);}throw new CloudTransportError('تعذر الاتصال بخدمة الشركة');}
   return data;
  }catch(e){if(e instanceof CloudTransportError)throw e;throw new CloudTransportError('تعذر الاتصال بخدمة الشركة');}
 }
 async login(username:string,password:string){const data=await this.call('login',{username,password});const {error}=await this.client.auth.setSession(data.session);if(error)throw new CloudTransportError('تعذر حفظ جلسة الدخول');return data.user as CloudUser;}
 async logout(){await this.client.auth.signOut({scope:'local'});}
 me(){return this.call('me') as Promise<CloudUser>;}
 execute(operation:CloudOperation){return this.call('execute',{operation});}
 pull(since:number){return this.call('pull',{since});}
 watch(onChanged:()=>void){const channel=this.client.channel(`workspace-${this.config.workspaceId}`).on('postgres_changes',{event:'*',schema:'public',table:'kayan_notifications',filter:`workspace_id=eq.${this.config.workspaceId}`},onChanged).subscribe();return ()=>{void this.client.removeChannel(channel);};}
}
