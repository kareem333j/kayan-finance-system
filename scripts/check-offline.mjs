import {listPackage,extractFile} from '@electron/asar';
import {existsSync} from 'node:fs';import path from 'node:path';
const archive='release/win-unpacked/resources/app.asar';
const names=listPackage(archive),main=extractFile(archive,path.join('dist','main','index.cjs')).toString();
if(names.some(p=>/cloud-config|node_modules[\\/](?:@supabase|electron-updater|sql.js)/.test(p))||existsSync('release/win-unpacked/resources/app-update.yml')||main.includes('checkForUpdates')||main.includes('class CloudClient'))throw Error('Online components remain in the offline build');
console.log('PASS offline package: no cloud config, updater config, cloud SDK or updater runtime');
