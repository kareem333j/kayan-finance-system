import {it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {excelBuffer,printHtml} from '../src/main/exports';
import {calculate,emptyInputs,defaultFormulas} from '../src/domain/payroll';
import type {Period,ExportOptions} from '../src/shared/types';
it('يصدر الحقول المخصصة والتفاصيل والأعمدة المختارة بنفس الإجمالي',async()=>{
 const formulas={...defaultFormulas,customFields:[{id:'bonus',name:'حافز خاص',type:'earning' as const,mode:'fixed' as const,value:'123.45',formula:''}]};const inputs=emptyInputs('6000');const result=calculate(inputs,formulas);const p={id:'p',month:'2026-09',status:'draft',createdAt:'',approvedAt:null,policy:{company:'كيان',penaltiesEnabled:false,roundingAccepted:true,formulas},entries:[{id:'e',employeeId:'a',snapshot:{name:'موظف اختبار',code:'001',job:'عامل',costCenter:'مشروع',paymentMethod:'نقدي'},inputs,result,checked:false,version:1,paid:false}]} as Period;
 const opts:ExportOptions={periodId:'p',entryIds:['e'],template:'register',paper:'A4',hideZeros:true,monochrome:false,explanations:true,registerColumns:['name','bonus','net']};const book=new ExcelJS.Workbook();await book.xlsx.load(await excelBuffer(p,opts) as any);const full=book.getWorksheet('رواتب الشهر')!;const header=full.getRow(5).values as string[];expect(full.getCell(6,header.indexOf('حافز خاص (+)')).value).toBe(123.45);const selected=book.getWorksheet('كشف حسب الاختيار')!;expect(selected.getRow(3).values).toEqual([undefined,'موظف اختبار',123.45,6063.45]);expect(book.getWorksheet('قسائم تفصيلية')!.getSheetValues().some((r:any)=>r?.[1]==='حافز خاص'&&r[2]===123.45)).toBe(true);expect(printHtml(p,opts,'','')).toContain('6,063.45');
});
