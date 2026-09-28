import { it,expect } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtempSync,rmSync,existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/main/store';
import { previewImport } from '../src/main/importer';
it('يعرض الصفوف الملتبسة دون اختيار ويمنع الاستيراد المكرر',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'kayan-import-'));const store=new Store(path.join(dir,'data.sqlite'));
 try{const w=new ExcelJS.Workbook(),s=w.addWorksheet('شيت');s.getCell('B2').value='الاسم';s.getCell('A4').value='الإدارة';s.mergeCells('A4:G4');s.getRow(5).values=[1,'موظف تجريبي','QNB',new Date('2026-01-01'),'مهندس','مشروع','2020'];s.getRow(6).values=['','ايجار شقة','ملاحظة بنك','','','',''];s.getRow(7).values=[111,'صندوق الزمالة'];s.getRow(8).values=['الاجمالى','الاجمالى'];const file=path.join(dir,'source.xlsx');await w.xlsx.writeFile(file);
 const p=await previewImport(file,store);expect(p.rows).toHaveLength(3);expect(p.rows.filter(r=>r.suggested)).toHaveLength(1);expect(p.rows[1].warnings.length).toBeGreaterThan(0);const rows=p.rows.filter(r=>r.suggested);expect(store.importRows(p.fingerprint,rows)).toBe(1);expect(store.importRows(p.fingerprint,rows)).toBe(0);expect(store.employees()[0].basic).toBe('');expect(store.employees()[0].paymentMethod).toBe('غير محدد');expect((await previewImport(file,store)).rows[0].duplicate).toBe(true);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
it.skipIf(!existsSync('reference/private/العمال.xlsx'))('الملف المرجعي: 77 سجلًا ولا اختيار تلقائي للبنود الخاصة',async()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'kayan-source-'));const s=new Store(path.join(dir,'data.sqlite'));try{const p=await previewImport('reference/private/العمال.xlsx',s);expect(p.rows).toHaveLength(77);for(const row of [7,34,36,88,97])expect(p.rows.find(r=>r.row===row)?.suggested).toBe(false);}finally{s.close();rmSync(dir,{recursive:true,force:true});}});
