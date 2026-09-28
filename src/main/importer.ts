import ExcelJS from 'exceljs';
import { createHash,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeSearch, type Store } from './store';
import type { ImportPreview } from '../shared/types';
export async function previewImport(filename:string,store:Store):Promise<ImportPreview & {fingerprint:string}> {
  const buffer=await readFile(filename);if(buffer.length>20*1024*1024) throw new Error('الملف أكبر من 20 ميجابايت');
  const fingerprint=createHash('sha256').update(buffer).digest('hex');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as any);
  const sheet=workbook.worksheets.find(s=>String(s.getCell('B2').text).trim()==='الاسم');if(!sheet) throw new Error('استخدم ملف العمال بنفس الأعمدة: م، الاسم، كارت البنك، تاريخ بداية العمل، الوظيفة، مركز التكلفة، دفعة التخرج');
  if(sheet.rowCount>10000) throw new Error('الملف يتجاوز 10000 صف');
  const existing=new Set(store.employees().map(e=>normalizeSearch(e.name)));
  const rows:ImportPreview['rows']=[];
  for(let row=4;row<=sheet.rowCount;row++){
    const get=(col:number)=>sheet.getRow(row).getCell(col);const name=get(2).text.trim();if(!name||get(2).isMerged||/^(?:(?:ال)?اجمال|اولا)/.test(normalizeSearch(name)))continue;
    const raw=get(4).value;let startDate='';if(raw instanceof Date && !Number.isNaN(raw.getTime())) startDate=raw.toISOString().slice(0,10);
    const bankNote=get(3).text.trim();const costCenter=get(6).text.trim();const code=get(1).text.trim();const warnings:string[]=[];
    const special=/ايجار|إيجار|صندوق|مكتب المحاسبة|استشارى|استشاري/.test(name);
    if(special) warnings.push('قد يكون جهة أو مصروفًا؛ راجع التصنيف');if(!/^\d+$/.test(code))warnings.push('سيُنشأ كود داخلي');if(!startDate)warnings.push('تاريخ بداية غير مكتمل');if(!costCenter)warnings.push('مركز التكلفة ناقص');if(bankNote && !/^QNB$/i.test(bankNote))warnings.push('راجع ملاحظة البنك والمستفيد');
    const duplicate=store.imported(fingerprint,row);if(existing.has(normalizeSearch(name)))warnings.push('اسم مشابه مسجل؛ تحقق من أنه شخص مختلف');
    rows.push({row,name,code,job:get(5).text.trim(),costCenter,startDate,bankNote,graduation:get(7).text.trim(),warnings,suggested:!special&&!duplicate&&!existing.has(normalizeSearch(name)),duplicate});
  }
  if(!rows.length)throw new Error('لم يعثر على سجلات أسماء في الملف');return {token:randomUUID(),filename:path.basename(filename),rows,fingerprint};
}
