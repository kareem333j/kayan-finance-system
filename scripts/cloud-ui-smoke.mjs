import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import path from 'node:path';
mkdirSync('test-results',{recursive:true});
const data=mkdtempSync(path.resolve('test-results/cloud-ui-'));
const env={...process.env,KAYAN_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({...(process.env.KAYAN_PACKAGED_TEST?{executablePath:process.env.KAYAN_PACKAGED_TEST,args:[]}:{args:['.']}),env});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByLabel('اسم الدخول',{exact:true}).fill('superadmin');
 await page.getByLabel('كلمة المرور',{exact:true}).fill(process.env.KAYAN_ADMIN_PASSWORD);
 await page.getByRole('button',{name:'دخول آمن',exact:true}).click();
 await page.getByRole('heading',{name:'أهلًا بك في مساحة الرواتب'}).waitFor();
 const call=(method)=>page.evaluate(method=>window.payroll.call(method),method);
 const state=await call('state'),status=await call('cloud.status'),auth=await call('auth.status');
 assert.ok(Array.isArray(state.employees));assert.ok(Array.isArray(state.periods));assert.equal(status.online,true);assert.equal(status.pending,0);assert.equal(auth.user.role,'super_admin');
 const accounts=await call('admin.accounts');assert.ok(accounts.length>=1);
 await page.screenshot({path:'test-results/cloud-dashboard.png',fullPage:true});
 await call('auth.lock');assert.equal((await call('auth.status')).unlocked,false);assert.deepEqual(errors,[]);
 console.log(`PASS desktop cloud login, ${state.employees.length} shared employees, ${accounts.length} accounts, sync status and logout`);
}finally{await app.close();}
