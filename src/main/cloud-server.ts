import type {Store} from './store';
import {captureBusiness,installBusiness} from './business-snapshot';
import {applyCloudCommand} from './cloud-commands';
import {onlineWrites,type BusinessSnapshot,type CloudOperation,type CloudUser} from '../shared/cloud';

export type CloudHead={revision:number;snapshot:BusinessSnapshot|null};
export type Receipt={actor:string;operation:CloudOperation;result:any;revision:number};
export interface CloudRepository {
 load(since?:number):Promise<CloudHead>;
 receipt(id:string):Promise<Receipt|null>;
 commit(base:number,operation:CloudOperation,snapshot:BusinessSnapshot,result:any):Promise<boolean>;
 profiles():Promise<CloudUser[]>;
}
export class CloudConflict extends Error{}
const canonical=(value:any):string=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
export class CloudServer {
 constructor(private repository:CloudRepository,private makeStore:()=>Store){}
 async execute(operation:CloudOperation,user:CloudUser){
  if(operation.actor!==user.id||!user.active)throw Error('الحساب غير متاح');
  for(let retry=0;retry<4;retry++){
   const receipt=await this.repository.receipt(operation.id);
   if(receipt){if(receipt.actor!==user.id||canonical(receipt.operation.payload)!==canonical(operation.payload)||receipt.operation.method!==operation.method)throw Error('معرّف العملية مستخدم لطلب آخر');return {result:receipt.result,revision:receipt.revision};}
   const head=await this.repository.load();
   if(onlineWrites.has(operation.method)&&head.revision!==operation.baseRevision)throw new CloudConflict('تغيرت البيانات على جهاز آخر؛ حدّث البيانات وراجع العملية');
   const store=this.makeStore();
   try{
    if(head.snapshot)installBusiness(store,head.snapshot);
    else if(operation.method!=='workspace.seed')throw new CloudConflict('مساحة الشركة لم تُهيأ بعد؛ ارفع البيانات من الجهاز الرئيسي');
    let result:any;
    if(operation.method==='workspace.seed'){
     if(user.role!=='super_admin'||head.snapshot)throw Error('رفع البيانات الأولية متاح للسوبر أدمن مرة واحدة لمساحة فارغة');
     const snapshot=structuredClone(operation.payload) as BusinessSnapshot;
     snapshot.audit=(snapshot.audit||[]).filter(r=>{const d=JSON.parse(r.detail);return !d.account&&!d.accountId;}).map(r=>{const d=JSON.parse(r.detail);delete d.actor;return {...r,detail:JSON.stringify(d)};});
     installBusiness(store,snapshot);store.settings();store.employees();result=true;
    }else result=applyCloudCommand(store,operation,user);
    const snapshot=captureBusiness(store);
    // Receipts keep a compact acknowledgement, never a complete payroll report.
    const acknowledgement=result&&typeof result==='object'?(result.id?{id:result.id}:true):result;
    if(await this.repository.commit(head.revision,operation,snapshot,acknowledgement))return {result:acknowledgement,revision:head.revision+1};
   }finally{store.close();}
  }
  throw new CloudConflict('تعديلات متزامنة كثيرة؛ أعد المحاولة');
 }
 async pull(user:CloudUser,since:number){
  if(!user.active)throw Error('الحساب غير متاح');
  const head=await this.repository.load(since);
  if(since===head.revision)return {revision:head.revision,initialized:true};
  if(!head.snapshot)return {revision:head.revision,snapshot:null,initialized:false};
  const snapshot=structuredClone(head.snapshot);
  if(user.role!=='super_admin'){
   const hidden=new Set((await this.repository.profiles()).filter(p=>p.is_hidden).map(p=>p.id));
   snapshot.audit=snapshot.audit.filter(row=>!hidden.has(JSON.parse(row.detail).actor));
  }
  return {revision:head.revision,snapshot,initialized:true};
 }
}
