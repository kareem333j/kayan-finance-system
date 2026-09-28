import { _electron as electron } from 'playwright';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('data',{recursive:true});
const data=mkdtempSync(path.resolve('data/smoke-'));
mkdirSync('test-results',{recursive:true});
const env={...process.env,KAYAN_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.'],env});
try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByLabel('كلمة المرور').fill('Test-only-1234');await page.getByRole('button',{name:'إنشاء مساحة العمل'}).click();
  await page.getByRole('heading',{name:'أهلًا بك في مساحة الرواتب'}).waitFor();
  await page.getByRole('button',{name:'الموظفون',exact:true}).click();await page.getByRole('button',{name:'إضافة موظف',exact:true}).click();
  await page.getByLabel('الاسم الكامل').fill('أحمد محمد — موظف تجريبي');await page.getByLabel('الوظيفة',{exact:true}).fill('مهندس موقع');await page.getByLabel('مركز التكلفة / المشروع').fill('مشروع تجريبي');await page.getByLabel('الراتب الأساسي — جنيه').fill('6000');await page.getByRole('button',{name:'حفظ بيانات الموظف'}).click();
  await page.getByText('أحمد محمد — موظف تجريبي',{exact:true}).waitFor();
  await page.getByRole('button',{name:'نظرة عامة',exact:true}).click();await page.getByRole('button',{name:'إنشاء كشف شهر'}).click();await page.getByLabel('شهر الرواتب').fill('2026-09');await page.getByRole('button',{name:'إنشاء الكشف',exact:true}).click();
  await page.getByRole('button',{name:'تحرير',exact:true}).click();await page.getByLabel('طريقة حساب التكليف').selectOption('days');await page.getByLabel('أيام التكليف',{exact:false}).fill('3');await page.getByLabel('الحافز',{exact:true}).fill('500');await page.getByLabel('أيام الإعاشة',{exact:false}).fill('20');await page.getByLabel('المواصلات',{exact:true}).fill('300');await page.getByLabel('استحقاقات أخرى',{exact:true}).fill('100');await page.getByLabel('السلف المخصومة هذا الشهر',{exact:false}).fill('1000');await page.getByLabel('أيام الغياب',{exact:false}).fill('2');await page.getByLabel('عدد ساعات التأخير',{exact:false}).fill('1');
  await page.getByText('7,340.00',{exact:true}).waitFor();
  await page.getByText('راجعت الأساسي والمتغيرات والسلف وأهلية الموظف، وجميع الأصفار تعني عدم وجود مبالغ.').click();
  await page.screenshot({path:'test-results/editor.png'});await page.getByRole('button',{name:'حفظ راتب الموظف'}).click();
  const state=await page.evaluate(()=>window.payroll.call('state'));const id=state.periods[0].id;let period=await page.evaluate(id=>window.payroll.call('period.get',id),id);assert.equal(period.entries[0].result.net,734000);
  await page.getByRole('button',{name:'الإعدادات والنسخ',exact:true}).click();await page.getByText('اعتماد تقريب كل بند إلى قرشين بطريقة النصف لأعلى، ثم جمع البنود المعروضة.').click();await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();
  period=await page.evaluate(id=>window.payroll.call('period.get',id),id);await page.evaluate(p=>window.payroll.call('entry.save',{periodId:p.id,id:p.entries[0].id,version:p.entries[0].version,inputs:p.entries[0].inputs,checked:true}),period);
  await page.getByRole('button',{name:'رواتب الشهر',exact:true}).click();await page.getByRole('button',{name:'اعتماد الشهر',exact:true}).click();await page.getByRole('button',{name:'تأكيد',exact:true}).click();await page.getByRole('button',{name:'تسجيل صرف المحدد'}).waitFor();
  period=await page.evaluate(id=>window.payroll.call('period.get',id),id);assert.equal(period.status,'approved');
  await page.getByRole('button',{name:'نظرة عامة',exact:true}).click();await page.screenshot({path:'test-results/dashboard.png'});
  await page.getByRole('button',{name:'رواتب الشهر',exact:true}).click();await page.getByRole('button',{name:'طباعة وتصدير',exact:true}).click();await page.screenshot({path:'test-results/export.png'});
  // Mock only native file dialogs in the test process; exercise the real export handlers.
  await app.evaluate(({dialog,shell},dir)=>{dialog.showSaveDialog=async(...args)=>{const options=args.at(-1);return {canceled:false,filePath:dir+'/'+(options.defaultPath.endsWith('.pdf')?'sample.pdf':'sample.xlsx')};};shell.openPath=async()=>'';},path.resolve('test-results'));
  const exportOptions={periodId:id,entryIds:period.entries.map(e=>e.id),template:'slip',paper:'A4',hideZeros:true,monochrome:false,explanations:true};
  console.log('Testing PDF export');await page.evaluate(opts=>window.payroll.call('export.pdf',opts),exportOptions);
  assert.ok(readFileSync('test-results/sample.pdf').length>10000);
  console.log('Testing Excel export');await page.evaluate(opts=>window.payroll.call('export.excel',opts),exportOptions);assert.ok(readFileSync('test-results/sample.xlsx').length>5000);
  const prefs=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());assert.equal(prefs.contextIsolation,true);assert.equal(prefs.sandbox,true);assert.equal(prefs.nodeIntegration,false);
  console.log('Testing print variants and backup/restore');
  const employeeBase={code:'TEST-2',name:'موظف تجريبي ثان',job:'محاسب',costCenter:'تجريبي',startDate:'2026-01-01',endDate:'',paymentMethod:'نقدي',bankNote:'',graduation:'',phone:'',nationalId:'',address:'',basic:'8000',active:true,notes:''};
  await page.evaluate(e=>window.payroll.call('employee.save',e),employeeBase);
  await page.evaluate(e=>window.payroll.call('employee.save',e),{...employeeBase,code:'TEST-3',name:'موظف تجريبي ثالث'});
  const p2=await page.evaluate(()=>window.payroll.call('period.create','2026-10'));
  for(const [template,paper,filename] of [['compact','A4','compact.pdf'],['slip','A5','a5.pdf'],['register','A4','register.pdf']]){
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},path.resolve('test-results',filename));
    await page.evaluate(opts=>window.payroll.call('export.pdf',opts),{...exportOptions,periodId:p2.id,entryIds:p2.entries.map(e=>e.id),template,paper,hideZeros:false});
  }
  const backupFile=path.resolve('test-results','restore-check.sqlite');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},backupFile);
  await page.evaluate(()=>window.payroll.call('backup.create'));
  await page.evaluate(e=>window.payroll.call('employee.save',e),{...employeeBase,code:'AFTER-BACKUP',name:'يجب استبعاده بالاستعادة'});
  await page.evaluate(()=>window.payroll.call('backup.restore'));await page.evaluate(()=>window.payroll.call('auth.login','Test-only-1234'));
  const restored=await page.evaluate(()=>window.payroll.call('state'));assert.equal(restored.employees.length,3);assert.equal((await page.evaluate(id=>window.payroll.call('period.get',id),id)).entries[0].result.net,734000);
  assert.deepEqual(errors,[]);writeFileSync('test-results/smoke.json',JSON.stringify({passed:true,net:734000,approved:true,pdf:true,excel:true,isolated:true,restored:true,printVariants:['compact','A5','register'],dataDirectory:data},null,2));console.log('PASS: UI employee → month → calculation → review → approval → PDF/Excel → print variants → backup/restore.');
}finally{await app.close();}
