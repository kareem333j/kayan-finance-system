import {createHash} from 'node:crypto';
import type {Store} from './store';
import {cloudWrites,adminWrites,type CloudOperation,type CloudUser} from '../shared/cloud';

export function operationIds(operationId:string){let n=0;return ()=>{const h=createHash('sha256').update(`${operationId}:${n++}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};}

// This same domain dispatcher runs on the device and in the trusted Edge Function.
export function applyCloudCommand(store:Store,operation:CloudOperation,user:CloudUser){
 if(!user.active||operation.actor!==user.id)throw Error('الحساب غير متاح');
 if(!cloudWrites.has(operation.method))throw Error('عملية غير مسموحة');
 if(adminWrites.has(operation.method)&&user.role==='operator')throw Error('هذه العملية متاحة للأدمن فقط');
 const oldIds=store.newId;store.newId=operationIds(operation.id);store.actor=user.id;
 try{return store.db.transaction(()=>{
  const p=operation.payload;
  switch(operation.method){
   case 'employee.save':{const employee=store.saveEmployee(p);store.refreshSnapshots(employee.id);return employee;}
   case 'employee.delete':return store.removeEmployee(p);
   case 'period.create':return store.createPeriod(p);
   case 'period.sync':return store.syncPeriod(p);
   case 'period.refreshSnapshots':return store.refreshSnapshots(p);
   case 'daily.save':return store.saveDaily(p);
   case 'daily.void':return store.voidDaily(p);
   case 'entry.save':return store.saveEntry(p);
   case 'entry.saveBatch':return store.saveEntries(p);
   case 'settings.save':return store.setSettings(p);
   case 'period.approve':return store.approve(p);
   case 'period.pay':return store.pay(p);
   case 'import.rows':return store.importRows(p.fingerprint,p.rows);
   case 'admin.reset':return store.resetData(p,user.id,`cloud-before-reset-${operation.id}`);
  }
 })();}finally{store.newId=oldIds;}
}
