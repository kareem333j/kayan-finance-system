import {_electron as electron} from 'playwright';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync} from 'node:fs';import path from 'node:path';
mkdirSync('test-results',{recursive:true});const dir=mkdtempSync(path.resolve('test-results/offline-')),env={...process.env,KAYAN_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({...(process.env.KAYAN_PACKAGED_TEST?{executablePath:process.env.KAYAN_PACKAGED_TEST,args:[]}:{args:['.']}),env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().setOffline(true);
 await page.getByLabel('كلمة المرور',{exact:true}).fill('Offline-123');await page.getByRole('button',{name:'حفظ بيانات الدخول',exact:true}).click();await page.getByRole('heading',{name:'أهلًا بك في مساحة الرواتب'}).waitFor();
 const call=(method,payload)=>page.evaluate(({method,payload})=>window.payroll.call(method,payload),{method,payload});
 assert.equal((await call('cloud.status')).configured,false);assert.equal(await page.getByRole('button',{name:'ربط مساحة الشركة'}).count(),0);
 const e=await call('employee.save',{code:'OFFLINE-1',name:'موظف بدون إنترنت',basic:'6000',active:true,paymentMethod:'نقدي'});const period=await call('period.create','2026-09');assert.equal(period.entries.length,1);
 const xlsx=path.join(dir,'employees.xlsx'),backup=path.join(dir,'backup.sqlite');
 await app.evaluate(({dialog},filename)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:filename});},xlsx);
 await call('employee.export.excel',{ids:[e.id],includeSalary:true});assert.ok(existsSync(xlsx));
 await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});},xlsx);
 const preview=await call('import.preview');assert.equal(preview.rows[0].duplicate,true);
 await app.evaluate(({dialog},filename)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:filename});},backup);await call('backup.create');
 await call('employee.save',{code:'TEMP',name:'موظف مؤقت',basic:'100',active:true,paymentMethod:'نقدي'});
 await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},backup);
 await call('backup.restore');assert.equal((await call('state')).employees.length,1);
 await call('auth.lock');await call('auth.login',{username:'admin',password:'Offline-123'});assert.equal((await call('state')).employees.length,1);
 await page.context().setOffline(false);assert.equal(await page.evaluate(async()=>{try{await fetch('https://example.com');return false;}catch{return true;}}),true);
 assert.deepEqual(errors,[]);console.log('PASS offline setup/login, employee/payroll, Excel export/import, backup/restore and blocked external requests');
}finally{await app.close();}
