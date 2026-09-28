import {randomUUID} from 'node:crypto';
import type {Store} from './store';
import {applyCloudCommand} from './cloud-commands';
import {installBusiness} from './business-snapshot';
import {onlineWrites,type BusinessSnapshot,type CloudOperation,type CloudStatus,type CloudUser} from '../shared/cloud';

export class CloudTransportError extends Error {constructor(message:string,public status=0){super(message);}}
export interface CloudTransport {
 execute(operation:CloudOperation):Promise<{result:any;revision:number}>;
 pull(since:number):Promise<{revision:number;snapshot?:BusinessSnapshot|null;initialized:boolean}>;
 me():Promise<CloudUser>;
}
export class SyncEngine {
 private tail:Promise<unknown>=Promise.resolve();
 private online=false;private forcePull=true;private lastSync:string|null=null;private message='جاهز للمزامنة';
 user:CloudUser|null=null;
 onChanged:()=>void=()=>{};
 constructor(readonly store:Store,private transport:CloudTransport){
  store.db.exec(`CREATE TABLE IF NOT EXISTS cloud_outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,operation TEXT NOT NULL,applied INTEGER NOT NULL,error TEXT);
   CREATE TABLE IF NOT EXISTS cloud_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
 }
 private get(key:string){return this.store.db.prepare('SELECT value FROM cloud_meta WHERE key=?').pluck().get(key);}
 private set(key:string,value:string){this.store.db.prepare('INSERT INTO cloud_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
 get revision(){return Number(this.get('revision')||-1);}
 private rows(){return this.store.db.prepare('SELECT * FROM cloud_outbox ORDER BY seq').all() as any[];}
 status():CloudStatus{const rows=this.rows(),first=rows.find(r=>r.error);return {configured:true,online:this.online,pending:rows.length,lastSync:this.lastSync,message:this.message,revision:this.revision,conflict:first?{id:first.id,method:JSON.parse(first.operation).method,payload:JSON.parse(first.operation).payload,message:first.error}:null};}
 private exclusive<T>(fn:()=>Promise<T>):Promise<T>{const next=this.tail.then(fn,fn);this.tail=next.catch(()=>{});return next;}
 setUser(user:CloudUser){const pending=this.rows();if(pending.some(r=>JSON.parse(r.operation).actor!==user.id))throw Error('على هذا الجهاز عمليات لحساب آخر لم تتزامن؛ سجّل بحساب صاحبها أولًا');this.user=user;}
 sync(){return this.exclusive(()=>this.flush());}
 private async flush(){
  if(!this.user)return;
  try{
   this.user=await this.transport.me();this.online=true;
   if(!this.user.active)throw new CloudTransportError('الحساب متوقف',403);
   const pending=this.rows();
   for(const row of pending){
    if(row.error){this.message='يوجد تعارض يحتاج مراجعة';return;}
    const operation:CloudOperation=JSON.parse(row.operation);
    if(operation.actor!==this.user.id)throw new CloudTransportError('عمليات غير متزامنة تخص حسابًا آخر',403);
    try{await this.transport.execute(operation);this.store.db.prepare('DELETE FROM cloud_outbox WHERE id=?').run(row.id);}
    catch(e){if(e instanceof CloudTransportError&&[400,409,422].includes(e.status)){this.store.db.prepare('UPDATE cloud_outbox SET error=? WHERE id=?').run(e.message,row.id);this.message='يوجد تعارض يحتاج مراجعة';return;}throw e;}
   }
   // Pull even at the same revision after a user/permission change: account
   // visibility can change without a payroll mutation.
   const result=await this.transport.pull(this.forcePull?-1:this.revision);
   if(result.initialized&&result.snapshot){this.store.db.transaction(()=>{installBusiness(this.store,result.snapshot!);this.set('revision',String(result.revision));})();}
   else if(!result.initialized){this.message='المساحة فارغة؛ ارفع بيانات الجهاز الرئيسي';return;}
   this.forcePull=false;this.lastSync=new Date().toISOString();this.message='البيانات متزامنة';
  }catch(e){this.online=false;this.message=e instanceof CloudTransportError&&e.status?e.message:'لا يوجد اتصال بالخدمة؛ التعديلات المحلية محفوظة';if(e instanceof CloudTransportError&&[401,403].includes(e.status))this.user=null;}
  finally{this.onChanged();}
 }
 write(method:string,payload:any){return this.exclusive(async()=>{
  if(!this.user)throw Error('سجّل الدخول إلى مساحة الشركة');
  if(this.status().conflict)throw Error('راجع التعارض قبل إضافة تعديلات جديدة');
  if(this.revision<0)throw Error('اربط الجهاز ببيانات الشركة أولًا');
  if(this.rows().some(r=>!r.applied))throw Error('توجد عملية تنتظر تأكيد الخدمة؛ اتصل بالإنترنت للمزامنة');
  if(onlineWrites.has(method)){
   await this.flush();
   if(!this.online||this.rows().length||!this.user)throw Error('هذه العملية تتطلب اتصالًا ومزامنة مكتملة');
  }
  const operation:CloudOperation={id:randomUUID(),method,payload,actor:this.user!.id,baseRevision:this.revision,createdAt:new Date().toISOString()};
  let result:any;
  this.store.db.transaction(()=>{
   if(!onlineWrites.has(method))result=applyCloudCommand(this.store,operation,this.user!);
   this.store.db.prepare('INSERT INTO cloud_outbox(id,operation,applied) VALUES (?,?,?)').run(operation.id,JSON.stringify(operation),onlineWrites.has(method)?0:1);
  })();
  this.onChanged();
  if(onlineWrites.has(method)){
   await this.flush();
   const pending=this.rows().find(r=>r.id===operation.id);
   if(pending)throw Error(pending.error||'لم يصل تأكيد الخدمة بعد؛ العملية محفوظة ولن تتكرر، أعد المزامنة');
   // Return the canonical local read for callers that expect a Period object.
   if(method==='period.approve')return this.store.period(payload);
   if(method==='period.pay')return this.store.period(payload.periodId);
   if(method==='settings.save')return this.store.settings();
   if(method==='period.sync')return this.store.period(payload);
   if(method==='admin.reset')return {backupPath:'نسخة سحابية محفوظة قبل إعادة الضبط'};
   return true;
  }
  void this.sync();return result;
 });}
 async discardPending(backupPath:string){return this.exclusive(async()=>{
  if(!this.user)throw Error('سجّل الدخول أولًا');
  await this.store.backup(backupPath);
  // Fetch first: a network failure must never discard pending edits.
  const remote=await this.transport.pull(-1);
  if(!remote.initialized||!remote.snapshot)throw Error('تعذر تحميل بيانات الشركة');
  this.store.db.transaction(()=>{installBusiness(this.store,remote.snapshot!);this.store.db.exec('DELETE FROM cloud_outbox');this.set('revision',String(remote.revision));})();
  this.message='تم حفظ التعديلات السابقة في نسخة احتياطية وتحميل نسخة الشركة';this.onChanged();return backupPath;
 });}
}
