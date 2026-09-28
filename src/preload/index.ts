import { contextBridge,ipcRenderer } from 'electron';
const allowed=new Set(['cloud.configure','cloud.status','cloud.sync','cloud.seed','cloud.discard','account.password','admin.accounts','admin.account.save','admin.reset.preview','admin.reset','daily.overview','daily.save','daily.void','employee.history','employee.export.pdf','employee.export.excel','employee.export.print','state','employee.save','employee.delete','period.create','period.get','period.sync','period.refreshSnapshots','entry.save','entry.saveBatch','period.approve','period.pay','settings.save','import.preview','import.commit','export.pdf','export.excel','export.print','backup.create','backup.restore','auth.status','auth.setup','auth.login','auth.lock']);
contextBridge.exposeInMainWorld('payroll',{
  call:async(method:string,payload?:unknown)=>{if(!allowed.has(method))throw new Error('عملية غير مسموحة');const result=await ipcRenderer.invoke('payroll',method,payload);if(!result.ok)throw new Error(result.error);return result.data;},
  onAppEvent:(channel:string,cb:(data:any)=>void)=>{const valid=['cloud:changed','app:update-available','app:update-ready','remote:control','remote:disabled','remote:broadcast','remote:apply-credentials'];if(!valid.includes(channel))return ()=>{};const handler=(_:any,data:any)=>cb(data);ipcRenderer.on(channel,handler);return ()=>ipcRenderer.removeListener(channel,handler);},
  updateActivity:(busy:boolean)=>ipcRenderer.send('app:update-activity',busy),
  checkUpdate:()=>ipcRenderer.invoke('app:check-update'),
  installUpdate:()=>ipcRenderer.invoke('app:install-update'),
});
