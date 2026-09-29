import ExcelJS from 'exceljs';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {normalizeSearch,type Store} from './store';
import {employeeFields} from './employee-export';
import {validDate} from '../domain/dates';
import type {Employee,ImportPreview} from '../shared/types';
const norm=(s:string)=>normalizeSearch(s).replace(/[\s_ـ\-:()]/g,'');
const aliases=new Map<string,keyof Employee>();
for(const [key,label] of [...employeeFields,['basic','الأساسي الشهري'],['active','نشط']] as [keyof Employee,string][])for(const name of [key,label])aliases.set(norm(name),key);
for(const [key,names] of Object.entries({name:['الاسم','اسم الموظف','اسم العامل'],code:['م','كود الموظف','رقم الموظف'],startDate:['تاريخ بداية العمل'],bankNote:['كارت البنك'],basic:['الراتب الأساسي','الاساسي'],active:['الحالة']}))for(const name of names)aliases.set(norm(name),key as keyof Employee);
const digits=(s:string)=>s.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
function dateValue(cell:ExcelJS.Cell){let raw:any=cell.value;if(raw&&typeof raw==='object'&&'result' in raw)raw=raw.result;if(raw instanceof Date)return raw.toISOString().slice(0,10);if(typeof raw==='number')return new Date(Date.UTC(1899,11,30)+Math.round(raw)*86400000).toISOString().slice(0,10);const s=digits(cell.text.trim());if(!s)return '';if(validDate(s))return s;const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);const result=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s;if(!validDate(result))throw Error('تاريخ غير صحيح: '+s);return result;}
export async function previewImport(filename:string,store:Store):Promise<ImportPreview & {fingerprint:string}>{
 const buffer=await readFile(filename);if(buffer.length>20*1024*1024)throw Error('الملف أكبر من 20 ميجابايت');
 const fingerprint=createHash('sha256').update(buffer).digest('hex'),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as any);
 let found:{sheet:ExcelJS.Worksheet;header:number;columns:Map<keyof Employee,number>;legacy:boolean}|undefined;
 for(const sheet of workbook.worksheets){if(sheet.state==='veryHidden')continue;for(let row=1;row<=Math.min(30,sheet.rowCount);row++){const columns=new Map<keyof Employee,number>();sheet.getRow(row).eachCell((cell,col)=>{const key=aliases.get(norm(cell.text));if(key&&!columns.has(key))columns.set(key,col);});if(columns.has('name')){const legacy=columns.size===1&&row===2&&columns.get('name')===2;if(legacy)for(const [key,col] of [['code',1],['bankNote',3],['startDate',4],['job',5],['costCenter',6],['graduation',7]] as [keyof Employee,number][])columns.set(key,col);found={sheet,header:row,columns,legacy:legacy||norm(sheet.getRow(row).getCell(columns.get('code')||1).text)==='م'};break;}}if(found)break;}
 if(!found)throw Error('لم نجد عمود اسم الموظف. استخدم «الاسم» أو «الاسم الكامل»؛ ترتيب الأعمدة غير مهم.');
 const {sheet,header,columns,legacy}=found;if(sheet.rowCount>10000)throw Error('الملف يتجاوز 10000 صف');
 const employees=store.employees(),seen=new Set<string>(),rows:ImportPreview['rows']=[];
 for(let row=header+1;row<=sheet.rowCount;row++){
  const nameCell=sheet.getRow(row).getCell(columns.get('name')!),name=nameCell.text.trim();if(!name||nameCell.isMerged||/^(?:(?:ال)?اجمال|اولا)/.test(normalizeSearch(name)))continue;
  const data:Partial<Employee>={},warnings:string[]=[];let invalid=false;
  for(const [key,col] of columns){const cell=sheet.getRow(row).getCell(col);try{let value:any=cell.text.trim();if(['startDate','endDate','birthDate','contractEnd'].includes(key))value=dateValue(cell);if(key==='basic')value=digits(value).replace(/[,٬\s]/g,'').replace('٫','.');if(key==='active'){if(!value)continue;const n=norm(value);if(['true','1','نعم','نشط','علي راس العمل'.replaceAll(' ','')].includes(n))value=true;else if(['false','0','لا','غيرنشط','موقوف','منتهي'].includes(n))value=false;else throw Error('حالة الموظف غير معروفة');}(data as any)[key]=value;}catch(e){invalid=true;warnings.push((e as Error).message);}}
  const code=data.code||'',match=!legacy&&code?employees.find(e=>e.code===code):undefined;
  const same=match&&Object.entries(data).every(([k,v])=>(match as any)[k]===v||((match as any)[k]??'')===v);
  const identity=code||normalizeSearch(name);const repeated=seen.has(identity);seen.add(identity);
  const duplicate=!!same||repeated||store.imported(fingerprint,row)||invalid;
  const special=/ايجار|إيجار|صندوق|مكتب المحاسبة|استشارى|استشاري/.test(name);
  if(special)warnings.push('قد يكون جهة أو مصروفًا؛ راجع التصنيف');
  if(match&&!same)warnings.push('سيتم تحديث الموظف بنفس الكود؛ الحقول غير الموجودة في الملف ستبقى كما هي');
  if(same)warnings.push('نفس البيانات موجودة بالفعل؛ لن تتكرر');if(repeated)warnings.push('سجل مكرر داخل الملف');
  if(!match&&employees.some(e=>normalizeSearch(e.name)===normalizeSearch(name)))warnings.push('اسم مشابه مسجل؛ راجع قبل الإضافة');
  if(legacy){if(!/^\d+$/.test(code))warnings.push('سيُنشأ كود داخلي');if(!data.startDate)warnings.push('تاريخ بداية غير مكتمل');if(!data.costCenter)warnings.push('مركز التكلفة ناقص');if(data.bankNote&&!/^QNB$/i.test(data.bankNote))warnings.push('راجع ملاحظة البنك والمستفيد');}
  rows.push({row,name,code,job:data.job||'',costCenter:data.costCenter||'',startDate:data.startDate||'',bankNote:data.bankNote||'',graduation:data.graduation||'',warnings,duplicate,suggested:!duplicate&&!special&&!match&&!employees.some(e=>normalizeSearch(e.name)===normalizeSearch(name)),...(!legacy?{employee:data,matchId:match?.id,matchVersion:match?.version}:{})});
 }
 if(!rows.length)throw Error('لا توجد صفوف موظفين في الملف');return {token:randomUUID(),filename:path.basename(filename),rows,fingerprint};
}
