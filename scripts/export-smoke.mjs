import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('test-results', { recursive: true });
const directory = mkdtempSync(path.resolve('test-results/exports-'));
const env = { ...process.env, KAYAN_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch(process.env.KAYAN_PACKAGED_TEST ? { executablePath: path.resolve(process.env.KAYAN_PACKAGED_TEST), args: [], env } : { args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const call = (method, payload) => page.evaluate(({method,payload}) => window.payroll.call(method,payload), {method,payload});
  await call('auth.setup', 'Test-only-1234');
  for (let i=0;i<69;i++) await call('employee.save', {code:`EXPORT-${i}`,name:`موظف اختبار ${i}`,job:'محاسب',costCenter:'مشروع',startDate:'2026-01-01',endDate:'',paymentMethod:'نقدي',bankNote:'',graduation:'',phone:'',nationalId:'',address:'',basic:'6000',active:true,notes:''});
  const period = await call('period.create','2026-09');
  await app.evaluate(({dialog,shell,BrowserWindow},directory) => {
    globalThis.exportDocuments=[]; globalThis.printCalls=[]; globalThis.exportNumber=0;
    dialog.showSaveDialog=async(...args)=>({canceled:false,filePath:directory+'/'+(++globalThis.exportNumber)+'-'+args.at(-1).defaultPath});
    shell.openPath=async()=>'';
    // Only the physical printer is mocked; document generation and PDF use Chromium.
    const original=BrowserWindow.prototype.loadFile;
    BrowserWindow.prototype.loadFile=function(file,...args){globalThis.exportDocuments.push(file); return original.call(this,file,...args);};
    const main=BrowserWindow.getAllWindows()[0];
    const prototype=Object.getPrototypeOf(main.webContents);
    prototype.print=function(options,callback){globalThis.printCalls.push(options);callback(true);};
  },directory);
  const base={periodId:period.id,entryIds:period.entries.map(e=>e.id),template:'slip',paper:'A4',hideZeros:true,monochrome:false,explanations:true};
  const outputs=[];
  for(const template of ['slip','compact','register','monthly']) {
    for(const method of ['export.pdf','export.excel','export.print']) {
      console.log(template,method);
      const result=await call(method,{...base,template,monochrome:true});
      if(method!=='export.print') {const buffer=readFileSync(result);assert.ok(buffer.length>1000);if(method.endsWith('pdf'))assert.equal(buffer.subarray(0,4).toString(),'%PDF');outputs.push(result);}
    }
  }
  for(const template of ['slip','register']) await call('export.pdf',{...base,template,paper:'A5'});
  for(const method of ['employee.export.pdf','employee.export.excel','employee.export.print']) {
    console.log(method);const result=await call(method,{ids:period.entries.map(e=>e.employeeId),includeSalary:true});
    if(!method.endsWith('print'))assert.ok(readFileSync(result).length>1000);
  }
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true,filePath:''});});
  assert.equal(await call('export.pdf',base),null);
  assert.equal(await call('export.excel',base),null);
  assert.equal(await call('employee.export.pdf',{ids:period.entries.map(e=>e.employeeId),includeSalary:false}),null);
  const checks=await app.evaluate(({BrowserWindow})=>({documents:globalThis.exportDocuments,prints:globalThis.printCalls,windows:BrowserWindow.getAllWindows().length}));
  assert.equal(checks.windows,1);assert.equal(checks.prints.length,5);assert.ok(checks.prints.every(p=>p.printBackground));
  assert.ok(checks.documents.length>=16);for(const file of checks.documents)assert.equal(existsSync(file),false,`Temporary document leaked: ${file}`);
  writeFileSync(path.join(directory,'results.json'),JSON.stringify({passed:true,employees:69,outputs,checks},null,2));
  console.log('PASS: 69 employees, all templates, PDF/Excel/print paths, A5, employee exports, cancellation and cleanup.',directory);
} finally { await app.close(); }
