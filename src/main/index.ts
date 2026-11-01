import { app,BrowserWindow,ipcMain,dialog,shell,session } from 'electron';
import path from 'node:path';
import { readFileSync,existsSync,mkdirSync,writeFileSync,renameSync,copyFileSync,unlinkSync } from 'node:fs';
import Database from './database';
import { z } from 'zod';
import { Accounts } from './accounts';
import { Store } from './store';
import { previewImport } from './importer';
import { employeeHtml,employeeExcel } from './employee-export';
import { validDate } from '../domain/dates';
import { printHtml,excelBuffer } from './exports';
import { openPrintDocument } from './print-document';
import type { ExportOptions } from '../shared/types';




import {captureBusiness,installBusiness} from './business-snapshot';
import {readCompatibleBackup} from './backup-compat';
import {randomUUID} from 'node:crypto';
import {prepareOfflineDatabase} from './offline-migration';
let win:BrowserWindow;let store:Store;let unlocked=false;let accountId:string|null=null;let maintenance=false;let preview:Awaited<ReturnType<typeof previewImport>>|null=null;
const root=path.join(__dirname,'../..');
if(process.env.KAYAN_TEST_DATA){const testProfile=path.resolve(process.env.KAYAN_TEST_DATA,'electron-profile');mkdirSync(testProfile,{recursive:true});app.setPath('userData',testProfile);}
const dataDir=process.env.KAYAN_TEST_DATA||path.join(app.getPath('userData'),'payroll-data');
let dbPath=path.join(dataDir,'payroll.sqlite');
let activeRequests=0;
let accountService:{storeRef:Store;accounts:Accounts}|null=null;
async function autoBackup(tag:string){const dir=path.join(dataDir,'backups');mkdirSync(dir,{recursive:true});const file=path.join(dir,`${tag}-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);await store.backup(file);return file;}
function validatedExport(payload:unknown):ExportOptions {const opts=z.object({periodId:z.string(),entryIds:z.array(z.string()).min(1),template:z.enum(['slip','compact','register','monthly']),paper:z.enum(['A4','A5']),hideZeros:z.boolean(),monochrome:z.boolean(),explanations:z.boolean(),registerColumns:z.array(z.string()).optional(),slipFields:z.array(z.string()).optional(),reportSections:z.array(z.enum(['overview','quality','centers','payment','components','daily','employees'])).optional(),reportColumns:z.array(z.enum(['code','name','employerCompany','job','department','costCenter','paymentMethod','basic','gross','deductions','net','checked','paid'])).optional(),asOf:z.string().optional(),view:z.enum(['monthly','accrued']).optional()}).parse(payload);if(opts.template==='compact'&&opts.paper!=='A4')throw new Error('القسيمتان تتطلبان ورق A4');if(opts.template==='monthly'&&opts.view==='accrued')throw new Error('التقرير الشهري يعرض تسوية الشهر كاملة');if(opts.template==='monthly'&&opts.reportSections&&!opts.reportSections.length)throw new Error('اختر قسمًا واحدًا على الأقل للتقرير');if(opts.template==='monthly'&&opts.reportSections?.includes('employees')&&opts.reportColumns&&!opts.reportColumns.length)throw new Error('اختر حقلًا واحدًا على الأقل لتفاصيل الموظفين');return opts as ExportOptions;}
function restricted(w:BrowserWindow){w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
function exportPeriod(opts:ExportOptions){const p=store.period(opts.periodId,opts.asOf);if(opts.view==='accrued'){p.view='accrued';p.entries=p.entries.map(e=>({...e,result:e.accrued||null,error:e.accruedError,inputs:e.effectiveInputs||e.inputs}));}return p;}
async function printWindow(opts:ExportOptions){
  const p=exportPeriod(opts);const logo='data:image/svg+xml;base64,'+readFileSync(path.join(root,'assets/brand/logo.svg')).toString('base64');
  const font='data:font/ttf;base64,'+readFileSync(path.join(root,'assets/fonts/NotoSansArabic-Regular.ttf')).toString('base64');
  const html=printHtml(p,opts,logo,font);const w=await openPrintDocument(html);
  try{if(opts.template==='compact'){const overflow=await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.slip')).some(e=>e.scrollHeight>e.clientHeight+2)`);if(overflow)throw new Error('تفاصيل القسيمة أكثر من مساحة نصف صفحة؛ اختر القسيمة المفصلة لحفظ وضوح كل البنود');}return w;}catch(e){w.destroy();throw e;}
}
async function exportImages(w:BrowserWindow){
  const result=await w.webContents.executeJavaScript(`(async()=>{const toPng=async(source,width,height)=>{const image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight);const drawWidth=image.naturalWidth*scale,drawHeight=image.naturalHeight*scale;context.drawImage(image,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight);return canvas.toDataURL('image/png').split(',')[1]};const logo=await toPng(document.querySelector('.report-logo, .doc-header img').src,500,240);const charts={};for(const svg of document.querySelectorAll('.report-chart[data-report-chart]')){const box=svg.viewBox.baseVal;const xml=new XMLSerializer().serializeToString(svg);const encoded=btoa(unescape(encodeURIComponent(xml)));charts[svg.dataset.reportChart]=await toPng('data:image/svg+xml;base64,'+encoded,Math.ceil(box.width*2),Math.ceil(box.height*2));}return {logo,charts};})()`);
  const charts=Object.fromEntries(Object.entries(result.charts||{}).map(([key,value])=>[key,Buffer.from(value as string,'base64')]));
  return {logo:Buffer.from(result.logo,'base64'),charts};
}
async function handle(method:string,payload:any):Promise<any>{
  const accounts=accountService?.storeRef===store?accountService.accounts:(accountService={storeRef:store,accounts:new Accounts(store)}).accounts;
  if(method==='cloud.status')return {configured:false,online:false,pending:0,conflict:null,lastSync:null,message:'العمل محلي على هذا الجهاز',revision:-1};
  if(maintenance)throw Error('إعادة الضبط جارية؛ انتظر اكتمال العملية');
  if(method==='auth.status')return {configured:accounts.configured(),unlocked:!!accounts.current(accountId),user:accounts.current(accountId)};
  if(method==='auth.setup'||method==='auth.login'){const account=method==='auth.setup'?accounts.setup(payload):accounts.login(payload);accountId=account.id;unlocked=true;return account;}
  if(method==='auth.lock'){accountId=null;unlocked=false;return true;}const current=accounts.current(accountId);if(!current){accountId=null;unlocked=false;throw Error('سجّل الدخول أولًا');}
  if(method.startsWith('admin.')||['settings.save','backup.restore','period.approve','period.delete'].includes(method)){accounts.requireAdmin(accountId);}
  store.actor=current.username;
  switch(method){
    case 'account.password':return accounts.changePassword(current.id,payload);
    case 'admin.accounts':return accounts.list(current.id);
    case 'admin.account.save':return accounts.save(current.id,payload);
    case 'admin.reset.preview':return store.resetPreview(payload?.month);
    case 'admin.reset':{accounts.verify(current.id,payload.password);const request=z.object({month:z.string().optional(),revision:z.number().int(),confirmation:z.string()}).parse(payload);const before=store.resetPreview(request.month);if(before.revision!==request.revision||before.confirmation!==request.confirmation)throw Error('تغيرت البيانات أو عبارة التأكيد غير صحيحة؛ أعد المعاينة');maintenance=true;try{const backup=await autoBackup(request.month?'before-reset-'+request.month:'before-reset-all');const result=store.resetData(request,current.username,backup);preview=null;return result;}finally{maintenance=false;}}
    case 'state':{const state=store.state();return {...state,audit:accounts.filterAudit(current.id,state.audit)};}
    case 'employee.save':return store.saveEmployee(payload);
    case 'employee.delete':return store.removeEmployee(payload);
    case 'period.create':return store.createPeriod(payload);
    case 'period.sync':return store.syncPeriod(payload);
    case 'period.refreshSnapshots':return store.refreshSnapshots(payload);
    case 'period.get':return typeof payload==='string'?store.period(payload):store.period(payload.id,payload.asOf);
    case 'daily.overview':{const date=z.string().refine(validDate).parse(payload.date);const p=store.state().periods.find(p=>p.month===date.slice(0,7));return {records:store.dailyRecords(date.slice(0,7)),period:p?store.period(p.id,date):null};}
    case 'daily.save':return store.saveDaily(payload);
    case 'daily.void':return store.voidDaily(payload);
    case 'employee.history':{const history=store.employeeHistory(payload);return {...history,events:accounts.filterAudit(current.id,history.events)};}
    case 'employee.export.pdf':case 'employee.export.excel':case 'employee.export.print':{
      const v=z.object({ids:z.array(z.string()).min(1),includeSalary:z.boolean(),fields:z.array(z.string()).optional()}).parse(payload);const employees=store.employees().filter(e=>v.ids.includes(e.id));if(employees.length!==new Set(v.ids).size)throw new Error('موظف غير موجود');
      const pdf=method.endsWith('.pdf');const print=method.endsWith('.print');const ext=pdf?'pdf':'xlsx';
      
      let filePath = '';
      if (!print) {
        const defaultName = employees.length === 1 ? employees[0].name.replace(/[\\/:"*?<>|]/g, '') : 'بيانات-الموظفين';
        const picked=await dialog.showSaveDialog(win,{defaultPath:`${defaultName}.${ext}`,filters:[{name:ext,extensions:[ext]}]});if(picked.canceled||!picked.filePath)return null;
        filePath = picked.filePath;
      }
      
      let buffer:Buffer|undefined;
      if(pdf || print){const logo='data:image/svg+xml;base64,'+readFileSync(path.join(root,'assets/brand/logo.svg')).toString('base64');const font='data:font/ttf;base64,'+readFileSync(path.join(root,'assets/fonts/NotoSansArabic-Regular.ttf')).toString('base64');const w=await openPrintDocument(employeeHtml(employees,store.settings().company,logo,font,v.includeSalary,v.fields));try{if(print){await new Promise<void>((resolve,reject)=>w.webContents.print({silent:false,printBackground:true},(ok,why)=>ok?resolve():reject(new Error(why==='cancelled'?'أُلغيت الطباعة':`لم تكتمل الطباعة: ${why}`))));return 'أُرسل إلى الطابعة';}buffer=await w.webContents.printToPDF({printBackground:true,preferCSSPageSize:true});}finally{w.destroy();}}else buffer=await employeeExcel(employees,store.settings().company,v.includeSalary,readFileSync(path.join(root,'assets/brand/export-logo.png')),v.fields);
      writeFileSync(filePath+'.tmp',buffer!);renameSync(filePath+'.tmp',filePath);store.audit('تصدير ملفات موظفين',{ids:v.ids,format:ext});return filePath;
    }
    case 'entry.save':return store.saveEntry(payload);
    case 'entry.saveBatch':return store.saveEntries(payload);
    case 'settings.save':return store.setSettings(payload);
    case 'period.approve':await autoBackup('before-approval');return store.approve(payload);
    case 'period.delete':{await autoBackup('before-period-delete');return store.deletePeriod(payload);}
    case 'period.pay':return store.pay(payload);
    case 'import.preview':{
      const picked=await dialog.showOpenDialog(win,{title:'اختيار ملف العمال',filters:[{name:'Excel',extensions:['xlsx']}],properties:['openFile']});if(picked.canceled)return null;
      preview=await previewImport(picked.filePaths[0],store);return {token:preview.token,filename:preview.filename,rows:preview.rows};
    }
    case 'import.commit':{
      const v=z.object({token:z.string(),rows:z.array(z.number().int()).min(1)}).parse(payload);if(!preview||preview.token!==v.token)throw new Error('أعد فتح معاينة الاستيراد');const rows=preview.rows.filter(r=>v.rows.includes(r.row));if(rows.length!==new Set(v.rows).size)throw new Error('صفوف غير صالحة');const count=store.importRows(preview.fingerprint,rows);preview=null;return count;
    }
    case 'export.excel':{
      const opts=validatedExport(payload);const p=exportPeriod(opts);const picked=await dialog.showSaveDialog(win,{defaultPath:`${opts.template==='monthly'?'التقرير-الشهري':'رواتب'}-${p.month}.xlsx`,filters:[{name:'Excel',extensions:['xlsx']}]});if(picked.canceled||!picked.filePath)return null;
      const w=await printWindow(opts.template==='monthly'?opts:{...opts,template:'slip'});let assets:{logo:Buffer;charts:Record<string,Buffer>};try{assets=await exportImages(w);}finally{w.destroy();}
      const buffer=await excelBuffer(p,opts,assets.logo,assets.charts);writeFileSync(picked.filePath+'.tmp',buffer);renameSync(picked.filePath+'.tmp',picked.filePath);store.audit(opts.template==='monthly'?'تصدير التقرير الشهري Excel':'تصدير Excel',{month:p.month,count:opts.entryIds.length});return picked.filePath;
    }
    case 'export.pdf':case 'export.print':{
      const opts=validatedExport(payload);const w=await printWindow(opts);try{
        if(method==='export.print'){await new Promise<void>((resolve,reject)=>w.webContents.print({silent:false,printBackground:true},(ok,why)=>ok?resolve():reject(new Error(why==='cancelled'?'أُلغيت الطباعة':`لم تكتمل الطباعة: ${why}`))));return 'أُرسل إلى الطابعة';}
        const p=exportPeriod(opts);const picked=await dialog.showSaveDialog(win,{defaultPath:`${opts.template==='monthly'?'التقرير-الشهري':'قسائم'}-${p.month}.pdf`,filters:[{name:'PDF',extensions:['pdf']}]});if(picked.canceled||!picked.filePath)return null;
        const pdf=await w.webContents.printToPDF({printBackground:true,preferCSSPageSize:true});writeFileSync(picked.filePath+'.tmp',pdf);renameSync(picked.filePath+'.tmp',picked.filePath);store.audit(opts.template==='monthly'?'تصدير التقرير الشهري PDF':'تصدير PDF',{month:p.month,count:opts.entryIds.length});await shell.openPath(picked.filePath);return picked.filePath;
      }finally{w.destroy();}
    }
    case 'backup.create':{const picked=await dialog.showSaveDialog(win,{defaultPath:`kayan-backup-${new Date().toISOString().slice(0,10)}.sqlite`,filters:[{name:'نسخة كيان',extensions:['sqlite']}]});if(picked.canceled||!picked.filePath)return null;if(path.resolve(picked.filePath)===path.resolve(dbPath))throw new Error('اختر مسارًا مختلفًا عن القاعدة المستخدمة');await store.backup(picked.filePath);store.audit('نسخة احتياطية يدوية',{});return picked.filePath;}
    case 'backup.restore':{
      const pick=await dialog.showOpenDialog(win,{filters:[{name:'نسخة كيان',extensions:['sqlite']}],properties:['openFile']});if(pick.canceled)return false;const file=pick.filePaths[0];
      if(path.resolve(file).toLowerCase()===path.resolve(dbPath).toLowerCase())throw new Error('هذه قاعدة البيانات الحالية وليست نسخة للاسترجاع');
      const staging=path.join(dataDir,'backups',`restore-review-${randomUUID()}.sqlite`);
      const snapshot=await readCompatibleBackup(file,staging);
      const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['إلغاء','استعادة النسخة'],defaultId:0,cancelId:0,message:'ستُستبدل بيانات العمل بالنسخة المختارة.',detail:'ستُحفظ نسخة من الوضع الحالي تلقائيًا. حسابات الدخول الحالية وصلاحياتها ستبقى كما هي.'});if(answer.response!==1)return false;
      await autoBackup('before-restore');
      store.db.transaction(()=>{installBusiness(store,snapshot);store.audit('استعادة نسخة احتياطية',{});})();preview=null;return true;
    }
    default:throw new Error('عملية غير معروفة');
  }
}
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(async()=>{
  app.setAppUserModelId('com.kayan.payroll');
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!['file:','data:','blob:','devtools:'].some(protocol=>details.url.startsWith(protocol))}));
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  mkdirSync(dataDir,{recursive:true});mkdirSync(path.join(dataDir,'backups'),{recursive:true});
  dbPath=await prepareOfflineDatabase(dataDir);
  store=new Store(dbPath);
  const day=new Date().toISOString().slice(0,10);const daily=path.join(dataDir,'backups',`daily-${day}.sqlite`);if(!existsSync(daily)){mkdirSync(path.dirname(daily),{recursive:true});await store.backup(daily);}
  const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  const appIconPath=path.join(root,'assets/brand/icon.ico');
  win=new BrowserWindow({width:1440,height:950,minWidth:1050,minHeight:720,show:!process.env.KAYAN_TEST_DATA,backgroundColor:'#f5f6f8',title:`كيان | إدارة الرواتب — الإصدار ${pkg.version}`,icon:appIconPath,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  win.setIcon(appIconPath);
  restricted(win);
  ipcMain.handle('payroll',async(event,method,payload)=>{activeRequests++;try{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('مصدر غير مصرح');return {ok:true,data:await handle(method,payload)};}catch(e:any){return {ok:false,error:e?.name==='ZodError'?'راجع الحقول المطلوبة وصيغة البيانات':e.message||'تعذر إكمال العملية'};}finally{activeRequests--;}});
  await win.loadFile(path.join(root,'dist/renderer/index.html'));

}).catch(e=>{dialog.showErrorBox('تعذر تشغيل نظام الرواتب',e.message);app.quit();});
app.on('window-all-closed',()=>{store?.close();app.quit();});
}
