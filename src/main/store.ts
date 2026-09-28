import Database, {type DatabaseAdapter} from './database';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { calculate, emptyInputs, numeric, defaultFormulas,emptyDaily,type Inputs } from '../domain/payroll';
import { accrualDays,defaultCutoff,monthEnd,todayLocal,validDate } from '../domain/dates';
import Decimal from 'decimal.js';
import type { Employee, Entry, Period, Settings, State, ImportRow, FormulaSettings,DailyRecord,DailyTotals,DailyKind } from '../shared/types';
const text = z.string().max(1000).default('');
const date = z.string().refine(s=>!s || validDate(s),'تاريخ غير صحيح').default('');
const empSchema = z.object({id:z.string().optional(),code:z.string().trim().min(1,'الكود مطلوب').max(40),name:z.string().trim().min(2,'الاسم مطلوب').max(200),job:text,costCenter:text,startDate:date,endDate:date,paymentMethod:z.enum(['نقدي','بنكي','غير محدد','فودافون كاش','إنستا باي']),bankNote:text,graduation:text,phone:text,nationalId:text,address:text,basic:text,active:z.boolean(),notes:text,version:z.number().int().nonnegative().optional(),birthDate:date,gender:text,maritalStatus:text,nationality:text,email:text,emergencyName:text,emergencyPhone:text,department:text,contractType:text,contractEnd:date,qualification:text,insuranceNumber:text,bankName:text,accountNumber:text,accountHolder:text,walletNumber:text,instapayAddress:text});
const inputSchema = z.object({ basic:z.string(),assignmentMode:z.enum(['amount','days']),assignmentAmount:z.string(),assignmentDays:z.string(),incentive:z.string(),livingDays:z.string(),transport:z.string(),other:z.string(),advance:z.string(),absenceDays:z.string(),delayUnit:z.enum(['hours','days']),delayQuantity:z.string(),penalties:z.string(),note:text,customValues:z.record(z.string(),z.string()).optional() });
const entrySchema=z.object({periodId:z.string(),id:z.string(),version:z.number().int(),inputs:inputSchema,checked:z.boolean(),effectiveDate:date.optional()});
const parse = <T>(value:any):T => JSON.parse(value);
export const normalizeSearch=(s:string)=>s.normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065Fـ]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
export class Store {
  db:DatabaseAdapter;
  newId:()=>string=randomUUID;
  actor:string|null=null;
  constructor(public filename:string, database?:Store['db']) {
    if(!database)mkdirSync(path.dirname(filename),{recursive:true});
    this.db=database||new Database(filename);
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON');
    const version = this.db.pragma('user_version',{simple:true}) as number;
    if(version>3) throw new Error('قاعدة البيانات أحدث من إصدار التطبيق');
    if(version===0) this.db.transaction(()=>{
      this.db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE employees(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name_key TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL);
        CREATE TABLE periods(id TEXT PRIMARY KEY, month TEXT UNIQUE NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','approved')), created_at TEXT NOT NULL, approved_at TEXT, policy TEXT);
        CREATE TABLE entries(id TEXT PRIMARY KEY, period_id TEXT NOT NULL REFERENCES periods(id), employee_id TEXT NOT NULL REFERENCES employees(id), snapshot TEXT NOT NULL, inputs TEXT NOT NULL, result TEXT, checked INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, paid INTEGER NOT NULL DEFAULT 0, UNIQUE(period_id,employee_id));
        CREATE INDEX idx_entries_period ON entries(period_id);
        CREATE TABLE imports(fingerprint TEXT NOT NULL, source_row INTEGER NOT NULL, employee_id TEXT NOT NULL REFERENCES employees(id), PRIMARY KEY(fingerprint,source_row));
        CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
        PRAGMA user_version = 1;`);
      this.db.prepare('INSERT INTO settings VALUES (?,?)').run('company',JSON.stringify({company:'كيان',penaltiesEnabled:false,roundingAccepted:false,formulas:defaultFormulas}));
    })();
    if(version<2){
      if(version===1)this.db.prepare('VACUUM INTO ?').run(path.join(path.dirname(filename),`before-v2-${Date.now()}.sqlite`));
      this.db.transaction(()=>{
        this.db.exec(`CREATE TABLE daily_records(id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, employee_id TEXT NOT NULL REFERENCES employees(id), date TEXT NOT NULL, kind TEXT NOT NULL, quantity TEXT NOT NULL, note TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, voided INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
          CREATE INDEX idx_daily_date ON daily_records(date,employee_id);
          CREATE TABLE input_history(id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id TEXT NOT NULL REFERENCES entries(id), effective_date TEXT NOT NULL, patch TEXT NOT NULL, created_at TEXT NOT NULL);
          CREATE INDEX idx_input_history ON input_history(entry_id,effective_date,id);
          CREATE TABLE policy_history(id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, data TEXT NOT NULL);
          INSERT INTO input_history(entry_id,effective_date,patch,created_at) SELECT e.id,p.month||'-01',e.inputs,p.created_at FROM entries e JOIN periods p ON p.id=e.period_id;
          PRAGMA user_version=2;`);
        const raw=parse<any>(this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('company'));
        raw.formulas={...defaultFormulas,...raw.formulas,delayByHours:false};
        this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(raw),'company');
        this.db.prepare("UPDATE entries SET checked=0,version=version+1 WHERE period_id IN(SELECT id FROM periods WHERE status='draft')").run();
        this.audit('ترقية المتابعة اليومية',{from:version,to:2,delay:'hours * basic / daysInMonth',approvedUnchanged:true});
      })();
    }
    if(version<3){if(version>0)this.db.prepare('VACUUM INTO ?').run(path.join(path.dirname(filename),`before-v3-${Date.now()}.sqlite`));this.db.transaction(()=>{this.db.exec('PRAGMA user_version=3');this.audit('ترقية صلاحيات الحسابات',{from:version,to:3});})();}
  }
  audit(action:string,detail:unknown) {this.db.prepare('INSERT INTO audit(at,action,detail) VALUES (?,?,?)').run(new Date().toISOString(),action,JSON.stringify(this.actor?{...(detail as object),actor:this.actor}:detail));}
  settings():Settings {
    const raw = parse<any>(this.db.prepare('SELECT value FROM settings WHERE key=?').pluck().get('company'));
    return {...raw, formulas:{...defaultFormulas,...(raw.formulas||{})}};
  }
  setSettings(value:unknown) {
    const formulaSchema = z.object({ livingDayRate:z.number().min(0).max(10000), fellowshipRate:z.number().min(0).max(1), fellowshipMin:z.number().min(0).max(10000), daysInMonth:z.number().int().min(1).max(31), workingHours:z.number().min(1).max(24), delayByHours:z.boolean(), customFields:z.array(z.object({id:z.string().regex(/^[A-Za-z_][A-Za-z_0-9]*$/).max(50),name:z.string().trim().min(1).max(80),type:z.enum(['earning','deduction']),formula:z.string().max(500),mode:z.enum(['formula','fixed','manual']).optional(),value:z.string().optional()})).max(30),expressions:z.record(z.string(),z.string().max(500)).optional(),constants:z.record(z.string(),z.string()).optional(),revision:z.number().optional(),monthlyAccrual:z.enum(['onDate','prorated']).optional() }).partial();
    const s=z.object({company:z.string().trim().min(1).max(160),penaltiesEnabled:z.boolean(),roundingAccepted:z.boolean(),formulas:formulaSchema.optional()}).parse(value);
    const previous=this.settings();const merged = { ...s, formulas:{...previous.formulas,...(s.formulas||{}),delayByHours:false,revision:(previous.formulas.revision||1)+1} };
    for(const basic of ['0','3000','6000','10000'])calculate({...emptyInputs(basic),assignmentMode:'days',assignmentDays:'3',livingDays:'20',absenceDays:'1',delayQuantity:'2'},merged.formulas,true);
    this.db.transaction(()=>{this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(merged),'company');this.db.prepare('INSERT INTO policy_history(created_at,data) VALUES (?,?)').run(new Date().toISOString(),JSON.stringify(merged));this.db.prepare("UPDATE entries SET checked=0,version=version+1 WHERE period_id IN(SELECT id FROM periods WHERE status='draft')").run(); this.audit('تحديث إعدادات الشركة',{before:previous,after:merged});})();return merged as Settings;
  }
  employees(includeDeleted=false):Employee[] {return (this.db.prepare('SELECT data FROM employees ORDER BY name_key').all() as any[]).map(r=>parse<Employee>(r.data)).filter(e=>includeDeleted||!e.deletedAt);}
  saveEmployee(value:unknown):Employee {
    const data=empSchema.parse(value); if(data.basic!=='') data.basic=numeric(data.basic,'الراتب الأساسي');
    if(data.endDate && data.startDate && data.endDate<data.startDate) throw new Error('تاريخ الانتهاء يسبق بدء العمل');
    return this.db.transaction(()=>{
      const old=data.id ? this.db.prepare('SELECT data,version FROM employees WHERE id=?').get(data.id) as any:undefined;
      if(old&&parse<Employee>(old.data).deletedAt)throw new Error('الموظف محذوف من قوائم العمل');
      if(data.id && !old) throw new Error('الموظف غير موجود');
      if(old && data.version!==old.version) throw new Error('تغير سجل الموظف؛ أعد تحميل البيانات');
      if(data.paymentMethod==='بنكي'&&!data.accountNumber.trim())throw new Error('أدخل رقم الحساب البنكي');
      if(data.paymentMethod==='فودافون كاش'&&!/^01\d{9}$/.test(data.walletNumber))throw new Error('رقم محفظة فودافون كاش يجب أن يكون 11 رقمًا ويبدأ بـ01');
      if(data.paymentMethod==='إنستا باي'&&!data.instapayAddress.trim())throw new Error('أدخل عنوان الدفع على إنستا باي');
      const employee={...(old?parse<Employee>(old.data):{}),...data,id:data.id||this.newId(),version:(old?.version||0)+1} as Employee;
      try { this.db.prepare('INSERT INTO employees(id,code,name_key,data,version) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name_key=excluded.name_key,data=excluded.data,version=excluded.version').run(employee.id,employee.code,normalizeSearch(employee.name),JSON.stringify(employee),employee.version); }
      catch(e:any){if(e.message?.includes('UNIQUE')) throw new Error('كود الموظف مستخدم بالفعل');throw e;}
      this.audit(old?'تعديل موظف':'إضافة موظف',{id:employee.id,before:old?parse(old.data):null,after:employee});return employee;
    })();
  }
  removeEmployee(id:unknown) {const key=z.string().parse(id);return this.db.transaction(()=>{const row=this.db.prepare('SELECT data FROM employees WHERE id=?').get(key) as any;if(!row)throw Error('الموظف غير موجود');const old=parse<Employee>(row.data);if(old.deletedAt)return true;const next={...old,active:false,deletedAt:new Date().toISOString(),version:old.version+1};this.db.prepare('UPDATE employees SET data=?,version=? WHERE id=?').run(JSON.stringify(next),next.version,key);this.audit('حذف موظف من قوائم العمل مع حفظ التاريخ',{id:key,before:old,after:next});return true;})();}
  resetPreview(month?:string){if(month&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('اختر شهرًا صحيحًا');const count=(sql:string,...args:any[])=>Number(this.db.prepare(sql).pluck().get(...args));return {month:month||null,periods:count('SELECT COUNT(*) FROM periods'+(month?' WHERE month=?':''),...(month?[month]:[])),entries:count('SELECT COUNT(*) FROM entries'+(month?' WHERE period_id IN(SELECT id FROM periods WHERE month=?)':''),...(month?[month]:[])),daily:count('SELECT COUNT(*) FROM daily_records'+(month?' WHERE substr(date,1,7)=?':''),...(month?[month]:[])),employees:this.employees().length,revision:count('SELECT COALESCE(MAX(id),0) FROM audit'),confirmation:month?`RESET ${month}`:'RESET ALL'};}
  resetData(value:unknown,actor:string,backupPath:string){const v=z.object({month:z.string().optional(),revision:z.number().int(),confirmation:z.string()}).parse(value);return this.db.transaction(()=>{const current=this.resetPreview(v.month);if(current.revision!==v.revision)throw Error('تغيرت البيانات؛ افتح معاينة إعادة الضبط مجددًا');if(v.confirmation!==current.confirmation)throw Error('عبارة التأكيد غير مطابقة');if(!backupPath)throw Error('يلزم إنشاء نسخة احتياطية أولًا');if(v.month){const p=this.db.prepare('SELECT id FROM periods WHERE month=?').get(v.month) as any;this.db.prepare('DELETE FROM daily_records WHERE substr(date,1,7)=?').run(v.month);if(p){this.db.prepare('DELETE FROM input_history WHERE entry_id IN(SELECT id FROM entries WHERE period_id=?)').run(p.id);const rows=this.db.prepare('SELECT id,inputs FROM entries WHERE period_id=?').all(p.id) as any[];for(const r of rows){const inputs=emptyInputs();this.db.prepare('UPDATE entries SET inputs=?,result=NULL,checked=0,paid=0,version=version+1 WHERE id=?').run(JSON.stringify(inputs),r.id);}this.db.prepare("UPDATE periods SET status='draft',approved_at=NULL,policy=NULL WHERE id=?").run(p.id);}}else{this.db.exec('DELETE FROM input_history; DELETE FROM daily_records; DELETE FROM entries; DELETE FROM periods; DELETE FROM imports; DELETE FROM policy_history; DELETE FROM audit;');for(const e of this.employees(true).filter(e=>e.deletedAt))this.db.prepare('DELETE FROM employees WHERE id=?').run(e.id);this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify({company:'كيان',penaltiesEnabled:false,roundingAccepted:false,formulas:defaultFormulas}),'company');}this.audit(v.month?'إعادة ضبط رواتب شهر':'إعادة ضبط النظام مع إبقاء الموظفين',{actor,scope:v.month||'all',before:current,backupPath});return {backupPath,...this.resetPreview(v.month)};})();}
  state():State { return {employees:this.employees(),periods:(this.db.prepare('SELECT * FROM periods ORDER BY month DESC').all() as any[]).map(r=>({id:r.id,month:r.month,status:r.status,createdAt:r.created_at,approvedAt:r.approved_at,policy:r.policy?parse(r.policy):null})),settings:this.settings(),audit:this.db.prepare('SELECT id,at,action,detail FROM audit ORDER BY id DESC LIMIT 100').all() as any[],dataPath:path.dirname(this.filename)}; }
  createPeriod(value:unknown) {
    const month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/,'اختر شهرًا صحيحًا').parse(value);
    return this.db.transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM periods WHERE month=?').get(month)) throw new Error('كشف رواتب هذا الشهر موجود بالفعل');
      const id=this.newId();this.db.prepare('INSERT INTO periods(id,month,status,created_at) VALUES (?,?,?,?)').run(id,month,'draft',new Date().toISOString());
      const next=new Date(`${month}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);const end=next.toISOString().slice(0,10);
      const list=this.employees().filter(e=>(e.active || (!!e.endDate && e.endDate>=`${month}-01`)) && (!e.startDate || e.startDate<end) && (!e.endDate || e.endDate>=`${month}-01`));
      for(const e of list) this.db.prepare('INSERT INTO entries(id,period_id,employee_id,snapshot,inputs) VALUES (?,?,?,?,?)').run(this.newId(),id,e.id,JSON.stringify(e),JSON.stringify(emptyInputs(e.basic)));
      this.audit('إنشاء كشف',{month,count:list.length});return this.period(id);
    })();
  }
  syncPeriod(id: unknown) {
    const key=z.string().parse(id);
    return this.db.transaction(()=>{
      const p = this.period(key);
      if (p.status !== 'draft') throw new Error('لا يمكن مزامنة كشف معتمد');
      const existing = new Set(p.entries.map(e=>e.employeeId));
      const month = p.month;
      const next=new Date(`${month}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);const end=next.toISOString().slice(0,10);
      const list=this.employees().filter(e=>(e.active || (!!e.endDate && e.endDate>=`${month}-01`)) && (!e.startDate || e.startDate<end) && (!e.endDate || e.endDate>=`${month}-01`));
      let added = 0;
      for (const e of list) {
        if (!existing.has(e.id)) {
          this.db.prepare('INSERT INTO entries(id,period_id,employee_id,snapshot,inputs) VALUES (?,?,?,?,?)')
            .run(this.newId(),p.id,e.id,JSON.stringify(e),JSON.stringify(emptyInputs(e.basic)));
          added++;
        } else {
          // Update snapshot for existing entries too (reflects name/job changes)
          this.db.prepare('UPDATE entries SET snapshot=?,checked=0,version=version+1 WHERE period_id=? AND employee_id=? AND (SELECT status FROM periods WHERE id=period_id)=\'draft\'')
            .run(JSON.stringify(e), p.id, e.id);
        }
      }
      this.audit('تحديث الكشف',{month:p.month,added});
      return this.period(p.id);
    })();
  }
  // Update snapshots in ALL draft periods for a specific employee
  refreshSnapshots(employeeId: unknown) {
    const key=z.string().parse(employeeId);
    return this.db.transaction(()=>{
      const emp = this.employees().find(e=>e.id===key);
      if (!emp) throw new Error('الموظف غير موجود');
      // Update snapshot in all DRAFT entries for this employee
      this.db.prepare(`UPDATE entries SET snapshot=?,checked=0,version=version+1 WHERE employee_id=? AND period_id IN (SELECT id FROM periods WHERE status='draft')`)
        .run(JSON.stringify(emp), key);
      this.audit('تحديث بيانات الموظف في الكشوف', {employee: emp.name});
      return true;
    })();
  }
  private monthlyContext(p:{month:string},e:Entry,settings:Settings){const days=accrualDays(p.month,monthEnd(p.month),e.snapshot.startDate,e.snapshot.endDate,settings.formulas.daysInMonth);return {daily:e.daily,accrualDays:days,monthlyRatio:settings.formulas.monthlyAccrual==='prorated'?new Decimal(days).div(settings.formulas.daysInMonth).toFixed():'1'};}
  period(id:unknown,requestedDate?:string):Period {
    const key=z.string().parse(id);const p=this.db.prepare('SELECT * FROM periods WHERE id=?').get(key) as any;if(!p) throw new Error('الكشف غير موجود');
    const policy=p.policy?parse<Settings>(p.policy):this.settings();policy.formulas={...defaultFormulas,...policy.formulas};
    const asOf=requestedDate||defaultCutoff(p.month);if(!validDate(asOf)||!asOf.startsWith(p.month))throw new Error('تاريخ الاحتساب يجب أن يكون داخل الشهر');
    const allDaily=this.dailyRecords(p.month);const totals=(employeeId:string,cutoff:string)=>{const t=emptyDaily();for(const r of allDaily)if(r.employeeId===employeeId&&!r.voided&&r.date<=cutoff)t[r.kind]=new Decimal(t[r.kind]).plus(r.quantity).toFixed();return t;};
    const entries=(this.db.prepare('SELECT * FROM entries WHERE period_id=? ORDER BY rowid').all(key) as any[]).map(r=>{
      const entry:Entry={id:r.id,employeeId:r.employee_id,snapshot:parse(r.snapshot),inputs:parse(r.inputs),checked:!!r.checked,version:r.version,paid:!!r.paid,result:r.result?parse(r.result):null};
      entry.daily=totals(entry.employeeId,monthEnd(p.month));
      if(p.status==='draft')try{entry.result=calculate(entry.inputs,policy.formulas,policy.penaltiesEnabled,this.monthlyContext(p,entry,policy));}catch(e:any){entry.result=null;entry.error=e.message;}
      else if(entry.result)entry.result.amounts={...entry.result.amounts,dailyDeduction:entry.result.amounts.dailyDeduction??0};
      entry.eligibleDays=accrualDays(p.month,asOf,entry.snapshot.startDate,entry.snapshot.endDate,policy.formulas.daysInMonth);
      entry.effectiveInputs=this.inputsAt(entry.id,asOf,entry.inputs);
      try{entry.accrued=calculate(entry.effectiveInputs,policy.formulas,policy.penaltiesEnabled,{daily:totals(entry.employeeId,asOf),accrualDays:entry.eligibleDays,monthlyRatio:policy.formulas.monthlyAccrual==='prorated'?new Decimal(entry.eligibleDays).div(policy.formulas.daysInMonth).toFixed():'1'});}catch(e:any){entry.accrued=null;entry.accruedError=e.message;}
      if(p.status==='approved'&&asOf===monthEnd(p.month))entry.accrued=entry.result;
      return entry;
    });
    return {id:p.id,month:p.month,status:p.status,createdAt:p.created_at,approvedAt:p.approved_at,policy,entries,asOf};
  }
  inputsAt(entryId:string,cutoff:string,fallback:Inputs):Inputs{
    const rows=this.db.prepare('SELECT patch FROM input_history WHERE entry_id=? AND effective_date<=? ORDER BY effective_date,id').all(entryId,cutoff) as any[];
    if(!rows.length)return {...fallback};let result=emptyInputs();for(const r of rows){const patch=parse<Partial<Inputs>>(r.patch);result={...result,...patch,customValues:{...result.customValues,...patch.customValues}};}return result;
  }
  private writeInputs(entry:Entry,inputs:Inputs,month:string,effectiveDate:string){
    if(!validDate(effectiveDate)||!effectiveDate.startsWith(month))throw new Error('تاريخ سريان القيم يجب أن يكون داخل الشهر');
    if(!this.db.prepare('SELECT 1 FROM input_history WHERE entry_id=? LIMIT 1').get(entry.id))this.db.prepare('INSERT INTO input_history(entry_id,effective_date,patch,created_at) VALUES (?,?,?,?)').run(entry.id,`${month}-01`,JSON.stringify(entry.inputs),new Date().toISOString());
    const before=this.inputsAt(entry.id,effectiveDate,entry.inputs);const patch:Record<string,unknown>={};for(const [k,v] of Object.entries(inputs))if(JSON.stringify(v)!==JSON.stringify((before as any)[k]))patch[k]=v;
    if(Object.keys(patch).length)this.db.prepare('INSERT INTO input_history(entry_id,effective_date,patch,created_at) VALUES (?,?,?,?)').run(entry.id,effectiveDate,JSON.stringify(patch),new Date().toISOString());
    return this.inputsAt(entry.id,monthEnd(month),entry.inputs);
  }
  saveEntry(value:unknown) {
    const v=entrySchema.parse(value);
    return this.db.transaction(()=>{
      const p=this.period(v.periodId);if(p.status!=='draft') throw new Error('هذا الشهر معتمد ولا يمكن تعديل أرقامه');
      const old=p.entries.find(e=>e.id===v.id);if(!old) throw new Error('السطر غير موجود');if(old.version!==v.version) throw new Error('تغيرت البيانات؛ أعد فتح السطر');
      const settings = this.settings();
      const inputs=this.writeInputs(old,v.inputs,p.month,v.effectiveDate||defaultCutoff(p.month));
      const result=calculate(inputs,settings.formulas,settings.penaltiesEnabled,this.monthlyContext(p,old,settings));
      this.db.prepare('UPDATE entries SET inputs=?,result=?,checked=?,version=version+1 WHERE id=?').run(JSON.stringify(inputs),JSON.stringify(result),+v.checked,v.id);
      this.audit('تعديل راتب',{month:p.month,employee:old.snapshot.name,employeeId:old.employeeId,before:old.inputs,after:v.inputs,checked:v.checked});return this.period(p.id);
    })();
  }
  saveEntries(value:unknown) {
    const list=z.array(entrySchema).min(1).max(1000).parse(value);
    if(new Set(list.map(v=>v.periodId)).size!==1||new Set(list.map(v=>v.id)).size!==list.length)throw new Error('الدفعة يجب أن تخص كشفًا واحدًا دون صفوف مكررة');
    return this.db.transaction(()=>{
      const p=this.period(list[0].periodId);if(p.status!=='draft')throw new Error('الكشف معتمد ولا يقبل التعديل');const entries=new Map(p.entries.map(e=>[e.id,e]));const settings=this.settings();
      for(const v of list){const old=entries.get(v.id);if(!old||old.version!==v.version)throw new Error('تغيرت بيانات أحد الصفوف؛ أعد تحميل الكشف');const inputs=this.writeInputs(old,v.inputs,p.month,v.effectiveDate||defaultCutoff(p.month));const result=calculate(inputs,settings.formulas,settings.penaltiesEnabled,this.monthlyContext(p,old,settings));this.db.prepare('UPDATE entries SET inputs=?,result=?,checked=?,version=version+1 WHERE id=?').run(JSON.stringify(inputs),JSON.stringify(result),+v.checked,v.id);this.audit('تعديل راتب جماعي',{month:p.month,employee:old.snapshot.name,employeeId:old.employeeId,before:old.inputs,after:inputs,checked:v.checked});}
      return this.period(p.id);
    })();
  }
  approve(id:unknown) {
    return this.db.transaction(()=>{
      const p=this.period(id); if(p.status!=='draft') throw new Error('الكشف معتمد بالفعل');
      const settings=this.settings();if(!settings.roundingAccepted) throw new Error('ثبّت سياسة التقريب من الإعدادات أولًا');
      if(!p.entries.length) throw new Error('الكشف لا يحتوي موظفين');
      for(const e of p.entries){if(!e.checked) throw new Error(`راجع راتب ${e.snapshot.name} وأكد اكتمال البيانات`); const result=calculate(e.inputs,settings.formulas,settings.penaltiesEnabled,this.monthlyContext(p,e,settings));if(result.amounts.basic<=0) throw new Error(`الأساسي يجب أن يكون أكبر من صفر: ${e.snapshot.name}`);if(result.net<0) throw new Error(`صافي سالب: ${e.snapshot.name}`);if(new Decimal(numeric(e.inputs.absenceDays)).plus(e.daily?.absence||0).gt(Number(monthEnd(p.month).slice(8))))throw new Error(`راجع إجمالي الغياب: ${e.snapshot.name}`); this.db.prepare('UPDATE entries SET result=? WHERE id=?').run(JSON.stringify(result),e.id);}
      this.db.prepare('UPDATE periods SET status=?,approved_at=?,policy=? WHERE id=?').run('approved',new Date().toISOString(),JSON.stringify(settings),p.id);this.audit('اعتماد كشف',{month:p.month,count:p.entries.length});return this.period(p.id);
    })();
  }
  pay(value:unknown) {const v=z.object({periodId:z.string(),ids:z.array(z.string()).min(1)}).parse(value);return this.db.transaction(()=>{const p=this.period(v.periodId);if(p.status!=='approved') throw new Error('اعتمد الكشف أولًا');for(const id of new Set(v.ids)){const e=p.entries.find(e=>e.id===id);if(!e) throw new Error('موظف خارج الكشف');if(e.paid) continue;this.db.prepare('UPDATE entries SET paid=1 WHERE id=?').run(id);this.audit('تسجيل صرف كامل',{month:p.month,employee:e.snapshot.name,cents:e.result!.net});}return this.period(p.id);})();}
  importRows(fingerprint:string,rows:ImportRow[]) {return this.db.transaction(()=>{
    let count=0;
    for(const r of rows){if(this.db.prepare('SELECT 1 FROM imports WHERE fingerprint=? AND source_row=?').get(fingerprint,r.row)) continue;
      let code=r.code && /^\d+$/.test(r.code)?`EMP-${r.code}`:`EMP-${String(r.row).padStart(4,'0')}`;
      if(this.db.prepare('SELECT 1 FROM employees WHERE code=?').get(code)) code=`${code}-${this.newId().slice(0,6)}`;
      const e=this.saveEmployee({code,name:r.name,job:r.job,costCenter:r.costCenter,startDate:r.startDate,endDate:'',paymentMethod:'غير محدد',bankNote:r.bankNote,graduation:r.graduation,phone:'',nationalId:'',address:'',basic:'',active:true,notes:`استيراد صف ${r.row}. ${r.warnings.join('، ')}`});
      this.db.prepare('INSERT INTO imports VALUES (?,?,?)').run(fingerprint,r.row,e.id);count++;
    }this.audit('استيراد موظفين',{count,fingerprint});return count;
  })();}
  imported(fingerprint:string,row:number) {return !!this.db.prepare('SELECT 1 FROM imports WHERE fingerprint=? AND source_row=?').get(fingerprint,row);}
  dailyRecords(month:unknown):DailyRecord[]{const m=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).parse(month);return (this.db.prepare('SELECT * FROM daily_records WHERE date>=? AND date<=? ORDER BY date DESC,created_at DESC').all(`${m}-01`,monthEnd(m)) as any[]).map(r=>({id:r.id,requestId:r.request_id,employeeId:r.employee_id,date:r.date,kind:r.kind,quantity:r.quantity,note:r.note,version:r.version,voided:!!r.voided,createdAt:r.created_at}));}
  saveDaily(value:unknown){
    const v=z.object({id:z.string().optional(),requestId:z.string().min(8).max(100),employeeId:z.string(),date:z.string().refine(validDate),kind:z.enum(['absence','delay','deduction','incentive','living','transport','other','advance','assignment']),quantity:z.string(),note:z.string().trim().min(1,'اكتب سبب الحركة').max(500),version:z.number().int().optional()}).parse(value);
    const quantity=numeric(v.quantity,'الكمية');if(new Decimal(quantity).lte(0))throw new Error('الكمية يجب أن تكون أكبر من صفر');
    return this.db.transaction(()=>{
      const duplicate=this.db.prepare('SELECT id FROM daily_records WHERE request_id=?').get(v.requestId) as any;if(duplicate&&!v.id)return {id:duplicate.id,replayed:true};
      const emp=this.employees().find(e=>e.id===v.employeeId);if(!emp)throw new Error('الموظف غير موجود');if((emp.startDate&&v.date<emp.startDate)||(emp.endDate&&v.date>emp.endDate))throw new Error('التاريخ خارج فترة عمل الموظف');if(!emp.active&&!emp.endDate)throw new Error('الموظف متوقف؛ حدد تاريخ انتهاء عمله أولًا');
      const old=v.id?this.db.prepare('SELECT * FROM daily_records WHERE id=?').get(v.id) as any:null;
      if(v.id&&(!old||old.voided||old.version!==v.version))throw new Error('تغيرت الحركة؛ أعد تحميل اليوم');
      for(const month of new Set([v.date.slice(0,7),old?.date?.slice(0,7)].filter(Boolean))){if(this.db.prepare("SELECT 1 FROM periods WHERE month=? AND status='approved'").get(month))throw new Error('الشهر معتمد؛ لا يمكن تغيير حركاته اليومية');}
      const same=this.dailyRecords(v.date.slice(0,7)).filter(r=>!r.voided&&r.id!==v.id&&r.employeeId===v.employeeId&&r.date===v.date&&r.kind===v.kind);
      if(v.kind==='absence'&&same.reduce((s,r)=>s.plus(r.quantity),new Decimal(quantity)).gt(1))throw new Error('إجمالي الغياب في اليوم لا يتجاوز يومًا واحدًا');
      if(v.kind==='delay'&&same.reduce((s,r)=>s.plus(r.quantity),new Decimal(quantity)).gt(24))throw new Error('إجمالي الساعات في اليوم لا يتجاوز 24 ساعة');
      const month=v.date.slice(0,7);const periodRow=this.db.prepare('SELECT id FROM periods WHERE month=?').get(month) as any;if(!periodRow)this.createPeriod(month);else if(!this.db.prepare('SELECT 1 FROM entries WHERE period_id=? AND employee_id=?').get(periodRow.id,v.employeeId))this.syncPeriod(periodRow.id);
      const id=v.id||this.newId();if(old)this.db.prepare('UPDATE daily_records SET employee_id=?,date=?,kind=?,quantity=?,note=?,version=version+1 WHERE id=?').run(v.employeeId,v.date,v.kind,quantity,v.note,id);else this.db.prepare('INSERT INTO daily_records(id,request_id,employee_id,date,kind,quantity,note,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,v.requestId,v.employeeId,v.date,v.kind,quantity,v.note,new Date().toISOString());
      for(const [employeeId,month] of [[v.employeeId,v.date.slice(0,7)],[old?.employee_id,old?.date?.slice(0,7)]])if(employeeId)this.db.prepare('UPDATE entries SET checked=0,version=version+1 WHERE employee_id=? AND period_id IN(SELECT id FROM periods WHERE month=?)').run(employeeId,month);
      this.audit(old?'تعديل حركة يومية':'إضافة حركة يومية',{before:old,after:{...v,id,quantity}});return {id};
    })();
  }
  voidDaily(value:unknown){const v=z.object({id:z.string(),version:z.number().int(),reason:z.string().trim().min(1).max(500)}).parse(value);return this.db.transaction(()=>{const old=this.db.prepare('SELECT * FROM daily_records WHERE id=?').get(v.id) as any;if(!old||old.voided||old.version!==v.version)throw new Error('الحركة غير متاحة أو تغيرت');if(this.db.prepare("SELECT 1 FROM periods WHERE month=? AND status='approved'").get(old.date.slice(0,7)))throw new Error('الشهر معتمد ولا يقبل إلغاء الحركة');this.db.prepare('UPDATE daily_records SET voided=1,version=version+1 WHERE id=?').run(v.id);this.db.prepare('UPDATE entries SET checked=0,version=version+1 WHERE employee_id=? AND period_id IN(SELECT id FROM periods WHERE month=?)').run(old.employee_id,old.date.slice(0,7));this.audit('إلغاء حركة يومية',{before:old,reason:v.reason});return true;})();}
  employeeHistory(id:unknown){const key=z.string().parse(id);const employee=this.employees(true).find(e=>e.id===key);if(!employee)throw new Error('الموظف غير موجود');const payroll=(this.db.prepare('SELECT p.id,p.month,p.status FROM entries e JOIN periods p ON p.id=e.period_id WHERE e.employee_id=? ORDER BY p.month DESC').all(key) as any[]).map(r=>{const entry=this.period(r.id).entries.find(e=>e.employeeId===key)!;return {...r,result:entry.result,paid:entry.paid};});const events=(this.db.prepare('SELECT * FROM audit WHERE detail LIKE ? ORDER BY id DESC LIMIT 300').all(`%${key}%`) as any[]);const months=this.db.prepare('SELECT DISTINCT substr(date,1,7) month FROM daily_records WHERE employee_id=? ORDER BY month DESC').all(key) as any[];const daily=months.flatMap(r=>this.dailyRecords(r.month).filter(d=>d.employeeId===key));return {employee,payroll,events,daily};}
  async backup(destination:string) {await this.db.backup(destination);}
  close() {this.db.close();}
}
