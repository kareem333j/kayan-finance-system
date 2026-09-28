import {build} from 'esbuild';
import {copyFileSync,mkdirSync} from 'node:fs';
mkdirSync('supabase/functions/payroll',{recursive:true});
await build({entryPoints:['supabase/functions/payroll/domain-entry.ts'],outfile:'supabase/functions/payroll/domain.js',bundle:true,format:'esm',platform:'neutral',target:'es2022',mainFields:['module','main'],external:['node:crypto','node:fs','node:path'],plugins:[{
 name:'cloud-sqlite-adapter',setup(builder){builder.onResolve({filter:/^\.\/database$/},()=>({path:'unused-native-database',namespace:'cloud'}));builder.onLoad({filter:/.*/,namespace:'cloud'},()=>({contents:'export default class Database {constructor(){throw new Error("Cloud requires in-memory adapter")}}',loader:'js'}));}
}]});
copyFileSync('node_modules/sql.js/dist/sql-wasm.wasm','supabase/functions/payroll/sql-wasm.wasm');
console.log('Cloud domain bundle and SQLite runtime ready.');
