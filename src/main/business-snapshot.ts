import type {Store} from './store';
import type {BusinessSnapshot} from '../shared/cloud';

export const businessTables = ['employees','periods','entries','imports','daily_records','input_history','policy_history','audit'] as const;
// Authentication and local sync/session tables are deliberately never transported.
export function captureBusiness(store:Store):BusinessSnapshot {
 const snapshot:BusinessSnapshot={settings:store.db.prepare("SELECT key,value FROM settings WHERE key='company'").all()};
 for(const table of businessTables)snapshot[table]=store.db.prepare(`SELECT * FROM ${table}`).all();
 return snapshot;
}
export function installBusiness(store:Store,snapshot:BusinessSnapshot){
 const allowed:Record<string,string[]>={settings:['key','value']};
 for(const table of businessTables)allowed[table]=(store.db.pragma(`table_info(${table})`) as any[]).map(c=>c.name);
 store.db.transaction(()=>{
  for(const table of [...businessTables].reverse())store.db.exec(`DELETE FROM ${table}`);
  store.db.prepare("DELETE FROM settings WHERE key='company'").run();
  for(const table of ['settings',...businessTables]){
   if(!Array.isArray(snapshot[table]))throw Error('بيانات المزامنة غير مكتملة');
   for(const row of snapshot[table]){
    const columns=Object.keys(row);
    if(!columns.length||columns.some(c=>!allowed[table].includes(c))||(table==='settings'&&row.key!=='company'))throw Error('بيانات مزامنة غير صالحة');
    store.db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
   }
  }
  if(!snapshot.settings.some(r=>r.key==='company'))throw Error('إعدادات الشركة مفقودة');
  if((store.db.pragma('foreign_key_check') as any[]).length)throw Error('روابط البيانات غير صحيحة');
 })();
}
