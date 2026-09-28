import {autoUpdater} from 'electron-updater';
import {app,BrowserWindow,ipcMain,net,powerMonitor} from 'electron';
import {existsSync,appendFileSync} from 'node:fs';
import path from 'node:path';
export function setupAutoUpdater(win:BrowserWindow,canInstall:()=>boolean=()=>true){
 let checking=false,ready=false,editing=true,lastCheck=0;
 autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;
 const log=(message:string)=>{try{appendFileSync(path.join(app.getPath('userData'),'updates.log'),new Date().toISOString()+' '+message+'\n');}catch{}};
 const configured=()=>app.isPackaged&&existsSync(path.join(process.resourcesPath,'app-update.yml'));
 const check=async()=>{if(checking||!configured()||!net.isOnline()||Date.now()-lastCheck<15_000)return;checking=true;lastCheck=Date.now();try{await autoUpdater.checkForUpdates();}catch{log('Update check failed; will retry.');}finally{checking=false;}};
 const install=()=>{if(ready&&!editing&&canInstall()){autoUpdater.quitAndInstall(true,true);return true;}return false;};
 autoUpdater.on('update-available',info=>win.webContents.send('app:update-available',{version:info.version}));
 autoUpdater.on('update-downloaded',info=>{ready=true;win.webContents.send('app:update-ready',{version:info.version});setTimeout(install,15_000);});
 autoUpdater.on('error',()=>log('Update error; existing version retained.'));
 ipcMain.on('app:update-activity',(event,busy)=>{if(event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame)editing=busy!==false;});
 ipcMain.handle('app:check-update',async event=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('مصدر غير مصرح');await check();return {configured:configured()};});
 ipcMain.handle('app:install-update',event=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('مصدر غير مصرح');return install();});
 powerMonitor.on('resume',()=>{void check();});setTimeout(()=>{void check();},5_000);setInterval(()=>{void check();},5*60_000);setInterval(install,15_000);return {check};
}
