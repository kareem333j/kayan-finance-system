export type CloudConfig = { url:string; publishableKey:string; workspaceId:string };
export type CloudUser = { id:string; username:string; name:string; role:'operator'|'admin'|'super_admin'; active:boolean; is_hidden:boolean };
export type CloudStatus = { configured:boolean; online:boolean; pending:number; conflict:null|{id:string;method:string;message:string;payload:unknown}; lastSync:string|null; message:string; revision:number };
export const cloudWrites = new Set(['employee.save','employee.delete','period.create','period.sync','period.refreshSnapshots','daily.save','daily.void','entry.save','entry.saveBatch','settings.save','period.approve','period.pay','import.rows','admin.reset']);
export const onlineWrites = new Set(['period.approve','period.pay','admin.reset','settings.save','period.sync','period.refreshSnapshots','employee.delete']);
export const adminWrites = new Set(['settings.save','period.approve','admin.reset']);
export type CloudOperation = { id:string; method:string; payload:any; actor:string; baseRevision:number; createdAt:string };
export type BusinessSnapshot = Record<string,Record<string,any>[]>;
