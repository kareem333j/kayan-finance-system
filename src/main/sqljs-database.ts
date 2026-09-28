import type {Database as SqlJsDatabase} from 'sql.js';
// In-memory SQLite adapter used by the server; never accesses a user's disk.
export class SqlJsAdapter {
 private depth=0;
 constructor(private raw:SqlJsDatabase){}
 exec(sql:string){this.raw.run(sql);}
 prepare(sql:string){let pluck=false;const raw=this.raw;return {
  run(...args:any[]){raw.run(sql,args);const result=raw.exec('SELECT last_insert_rowid()');return {changes:raw.getRowsModified(),lastInsertRowid:Number(result[0]?.values[0]?.[0]||0)};},
  all(...args:any[]){const statement=raw.prepare(sql);try{statement.bind(args);const rows:Record<string,any>[]=[];while(statement.step())rows.push(statement.getAsObject());return rows;}finally{statement.free();}},
  get(...args:any[]){const statement=raw.prepare(sql);try{statement.bind(args);if(!statement.step())return undefined;const row=statement.getAsObject();return pluck?Object.values(row)[0]:row;}finally{statement.free();}},
  pluck(){pluck=true;return this;}
 };}
 pragma(sql:string,options?:{simple?:boolean}){const rows=this.prepare('PRAGMA '+sql).all();return options?.simple?(rows.length?Object.values(rows[0])[0]:undefined):rows;}
 transaction<T>(fn:()=>T){return ()=>{const nested=this.depth>0,name=`cloud_${this.depth}`;this.exec(nested?`SAVEPOINT ${name}`:'BEGIN');this.depth++;try{const value=fn();this.exec(nested?`RELEASE ${name}`:'COMMIT');return value;}catch(e){this.exec(nested?`ROLLBACK TO ${name}`:'ROLLBACK');if(nested)this.exec(`RELEASE ${name}`);throw e;}finally{this.depth--;}};}
 async backup(_destination:string){throw Error('Server backups are managed centrally');}
 close(){this.raw.close();}
}
