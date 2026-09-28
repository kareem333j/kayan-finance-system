import { DatabaseSync,backup } from 'node:sqlite';
export interface DatabaseAdapter {
 exec(sql:string):void;
 prepare(sql:string):{run:(...args:any[])=>any;all:(...args:any[])=>any[];get:(...args:any[])=>any;pluck:()=>any};
 pragma(sql:string,options?:{simple?:boolean}):any;
 transaction<T>(fn:()=>T):()=>T;
 backup(destination:string):Promise<any>;
 close():void;
}
/** Small local adapter around the SQLite engine bundled with Electron/Node. */
export default class Database {
  private raw:DatabaseSync;
  private depth=0;
  constructor(filename:string,options?:{readonly?:boolean;fileMustExist?:boolean}){this.raw=new DatabaseSync(filename,{readOnly:!!options?.readonly});}
  exec(sql:string){this.raw.exec(sql);}
  prepare(sql:string){const statement=this.raw.prepare(sql);let pluck=false;return {run:(...args:any[])=>statement.run(...args),all:(...args:any[])=>statement.all(...args),get:(...args:any[])=>{const row=statement.get(...args);return pluck&&row?Object.values(row)[0]:row;},pluck(){pluck=true;return this;}};}
  pragma(sql:string,options?:{simple?:boolean}){const rows=this.raw.prepare('PRAGMA '+sql).all();return options?.simple?(rows.length?Object.values(rows[0])[0]:undefined):rows;}
  transaction<T>(fn:()=>T):()=>T{return ()=>{const nested=this.depth>0;const name=`sp_${this.depth}`;this.raw.exec(nested?`SAVEPOINT ${name}`:'BEGIN IMMEDIATE');this.depth++;try{const result=fn();this.raw.exec(nested?`RELEASE ${name}`:'COMMIT');return result;}catch(e){this.raw.exec(nested?`ROLLBACK TO ${name}`:'ROLLBACK');if(nested)this.raw.exec(`RELEASE ${name}`);throw e;}finally{this.depth--;}};}
  backup(destination:string){return backup(this.raw,destination);}
  close(){this.raw.close();}
}
