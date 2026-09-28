import { Store } from '../src/main/store';
import { calculate,emptyInputs } from '../src/domain/payroll';
import { excelBuffer } from '../src/main/exports';
import { mkdtempSync,writeFileSync,mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
async function main(){
mkdirSync('test-results',{recursive:true});const dir=mkdtempSync(path.resolve('test-results/benchmark-'));const s=new Store(path.join(dir,'test.sqlite'));
const results:Record<string,unknown>={platform:os.platform(),cpu:os.cpus()[0].model,memoryGB:Math.round(os.totalmem()/1024**3),employees:1000,months:24};
const timed=(name:string,fn:()=>any)=>{const start=performance.now();const value=fn();results[name]=Math.round(performance.now()-start);return value;};
try{
timed('seedEmployeesMs',()=>s.db.transaction(()=>{for(let i=0;i<1000;i++)s.saveEmployee({code:`BENCH-${i}`,name:`موظف تجريبي ${i}`,job:'مهندس',costCenter:`مشروع ${i%10}`,startDate:'2024-01-01',endDate:'',paymentMethod:'نقدي',bankNote:'',graduation:'',phone:'',nationalId:'',address:'',basic:'6000',active:true,notes:''});})());
let p:any;timed('create24MonthsMs',()=>{for(let i=0;i<24;i++)p=s.createPeriod(`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);});
timed('calculate1000Ms',()=>{for(let i=0;i<1000;i++)calculate({...emptyInputs('6000'),delayQuantity:'2',absenceDays:'1.5',livingDays:'20'});});
timed('loadMonth1000Ms',()=>s.period(p.id));
timed('bulkSave1000Ms',()=>s.saveEntries(p.entries.map((e:any)=>({periodId:p.id,id:e.id,version:e.version,inputs:{...e.inputs,incentive:'100'},checked:false}))));
const t=performance.now();await excelBuffer(s.period(p.id),{periodId:p.id,entryIds:p.entries.map((e:any)=>e.id),template:'slip',paper:'A4',hideZeros:true,explanations:true,monochrome:false});results.excel1000Ms=Math.round(performance.now()-t);
writeFileSync('test-results/benchmark.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{s.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
