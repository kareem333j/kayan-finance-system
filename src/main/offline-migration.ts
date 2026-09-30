import {existsSync,readFileSync,renameSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from './database';
import {Store} from './store';
import {readCompatibleBackup} from './backup-compat';

export async function prepareOfflineDatabase(directory:string){
 mkdirSync(directory,{recursive:true});mkdirSync(path.join(directory,'backups'),{recursive:true});
 const destination=path.join(directory,'offline.sqlite');if(existsSync(destination))return destination;
 const original=path.join(directory,'payroll.sqlite');let source=existsSync(original)?original:null;
 const configFile=path.join(directory,'cloud-config.json');let pending=0;
 if(existsSync(configFile)){
  let config:any;try{config=JSON.parse(readFileSync(configFile,'utf8'));}catch{}
  if(/^[a-f0-9-]{36}$/i.test(config?.workspaceId||'')){
   const cached=path.join(directory,`cloud-${config.workspaceId}.sqlite`);
   if(existsSync(cached)){
    const db=new Database(cached,{readonly:true});try{
     const initialized=db.prepare("SELECT value FROM cloud_meta WHERE key='revision'").pluck().get();
     if(initialized!==undefined&&Number(initialized)>=0){source=cached;pending=Number(db.prepare('SELECT COUNT(*) FROM cloud_outbox WHERE applied=0').pluck().get());}
    }finally{db.close();}
   }
  }
 }
 if(!source){const fresh=new Store(destination);fresh.close();return destination;}
 const staging=path.join(directory,`offline-preparing-${randomUUID()}.sqlite`);
 await readCompatibleBackup(source,staging);
 const working=new Store(staging);
 try{
  // Recover local credentials only. Remote passwords never existed on this device.
  if(source!==original&&existsSync(original)){
   const local=new Database(original,{readonly:true});try{for(const key of ['accounts','auth']){const value=local.prepare('SELECT value FROM settings WHERE key=?').pluck().get(key);if(value)working.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}}finally{local.close();}
  }
  await working.backup(path.join(directory,'backups',`before-offline-${Date.now()}.sqlite`));
  // Keep former databases intact, including their pending operation details.
  working.db.exec('DROP TABLE IF EXISTS cloud_outbox;DROP TABLE IF EXISTS cloud_meta;');
  working.audit('التحويل إلى قاعدة محلية مستقلة',{source:path.basename(source),unappliedOperations:pending});
  working.db.pragma('wal_checkpoint(TRUNCATE)');
 }finally{working.close();}
 renameSync(staging,destination);
 writeFileSync(path.join(directory,'offline-migration.json'),JSON.stringify({source:path.basename(source),unappliedOperations:pending,createdAt:new Date().toISOString(),originalFilesPreserved:true},null,2));
 return destination;
}
