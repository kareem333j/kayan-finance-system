import Database from './database';
import {Store} from './store';
import {captureBusiness} from './business-snapshot';
// Work on a SQLite-consistent copy (including any committed WAL pages), never
// migrate the user's original backup or transport authentication/outbox tables.
export async function readCompatibleBackup(file:string,staging:string){
 const source=new Database(file,{readonly:true,fileMustExist:true});
 try{
  const version=Number(source.pragma('user_version',{simple:true}));
  if(version>3)throw Error('هذه النسخة من إصدار أحدث؛ حدّث البرنامج أولًا لاستعادتها بأمان');
  if(![1,2,3].includes(version)||source.pragma('integrity_check',{simple:true})!=='ok'||(source.pragma('foreign_key_check') as any[]).length)throw Error('ملف النسخة غير سليم؛ لم يتم تغيير بياناتك');
  for(const table of ['settings','employees','periods','entries','imports','audit',...(version>=2?['daily_records','input_history','policy_history']:[])])source.prepare(`SELECT COUNT(*) FROM ${table}`).get();
  await source.backup(staging);
 }finally{source.close();}
 const candidate=new Store(staging);
 try{const settings=candidate.settings();if(!settings.company)throw Error('إعدادات النسخة غير مكتملة');candidate.employees();return captureBusiness(candidate);}finally{candidate.close();}
}
