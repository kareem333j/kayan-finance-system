import ExcelJS from 'exceljs';
import type {Employee} from '../shared/types';
import {escapeHtml} from './exports';
const fields:[keyof Employee,string][]=[['code','الكود'],['name','الاسم الكامل'],['job','الوظيفة'],['costCenter','مركز التكلفة'],['department','الإدارة'],['startDate','تاريخ التعيين'],['endDate','تاريخ انتهاء العمل'],['contractType','نوع التعاقد'],['contractEnd','انتهاء العقد'],['birthDate','تاريخ الميلاد'],['gender','النوع'],['maritalStatus','الحالة الاجتماعية'],['nationality','الجنسية'],['nationalId','الرقم القومي'],['phone','الهاتف'],['email','البريد الإلكتروني'],['address','العنوان'],['emergencyName','جهة اتصال الطوارئ'],['emergencyPhone','هاتف الطوارئ'],['qualification','المؤهل'],['graduation','دفعة التخرج'],['insuranceNumber','الرقم التأميني'],['paymentMethod','طريقة الدفع'],['bankName','البنك'],['accountNumber','رقم الحساب'],['accountHolder','صاحب الحساب'],['walletNumber','رقم المحفظة'],['instapayAddress','عنوان إنستا باي'],['bankNote','ملاحظات البنك'],['notes','الملاحظات']];
export const employeeFields = fields;
export function employeeHtml(employees:Employee[],company:string,logo:string,font:string,includeSalary:boolean,selectedFields?:string[]){
  const esc=escapeHtml;
  
  // Brand colors
  const ACCENT = '#EC671B';   // Brand Orange
  const TEXT_DARK = '#1C2A38';   // Brand Dark Navy
  const TEXT_MUTED = '#94A3B8';  // Light Slate
  const ROW_EVEN  = '#F8FAFC';   // Off-white
  const BORDER    = '#E2E8F0';   // Slate-200

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';img-src data:;font-src data:;style-src 'unsafe-inline'">
  <style>
    @font-face { font-family: Arabic; src: url('${font}') format('truetype'); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 10mm 15mm; }
    body { font-family: Arabic, 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 14px; color: ${TEXT_DARK}; line-height: 1.6; }
    section { display: flex; flex-direction: column; min-height: 260mm; page-break-after: always; padding-bottom: 15px; }
    section:last-child { page-break-after: auto; }
    
    /* Header */
    .doc-header {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      border-bottom: 3.5px solid ${ACCENT}; padding-bottom: 16px; margin-bottom: 24px;
    }
    .doc-header img { height: 65px; object-fit: contain; }
    .doc-header .sub { font-size: 18px; font-weight: 700; color: ${TEXT_DARK}; margin-bottom: 4px; }
    .doc-header .sub small { display: block; font-size: 14px; color: ${TEXT_MUTED}; font-weight: 400; }
    .status-badge {
      background: #F8FAFC; color: #475569; border: 1px solid #CBD5E1;
      border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: 600;
    }
    
    /* Employee Name */
    h2 { font-size: 22px; margin-bottom: 8px; color: ${TEXT_DARK}; }
    .emp-meta { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .emp-meta.active { background: #F0FDF4; color: #166534; border: 1px solid #BBF7D0; }
    .emp-meta.inactive { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }
    
    /* Data Grid */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin-bottom: 24px; }
    .field { padding: 12px 14px; background: ${ROW_EVEN}; border: 1px solid ${BORDER}; border-radius: 8px; break-inside: avoid; }
    .field small { color: ${TEXT_MUTED}; display: block; font-size: 11px; margin-bottom: 4px; font-weight: 600; }
    .field strong { display: block; font-size: 15px; font-weight: 700; color: ${TEXT_DARK}; }
    
    /* Footer */
    .doc-footer {
      margin-top: auto; padding-top: 12px; border-top: 1px solid ${BORDER};
      font-size: 12px; color: ${TEXT_MUTED}; display: flex; justify-content: space-between;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  ${employees.map(e => `
  <section>
    <div class="doc-header">
      <img src="${logo}">
      <div class="status-badge">بيانات الموظف</div>
      <div>
        <div class="sub">${esc(company)} <small>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</small></div>
      </div>
    </div>
    
    <h2>${esc(e.name)}</h2>
    <div class="emp-meta ${e.active ? 'active' : 'inactive'}">
      ${e.active ? 'على رأس العمل' : 'موقوف / منتهي'} · الكود: ${esc(e.code)}
    </div>
    
    <div class="grid">
      ${fields.filter(([k])=>!selectedFields||selectedFields.includes(k)).map(([key, label]) => `
      <div class="field">
        <small>${label}</small>
        <strong>${esc(e[key] || '—')}</strong>
      </div>
      `).join('')}
      ${includeSalary ? `
      <div class="field" style="border-right: 4px solid ${ACCENT}; background: #FFF5EB;">
        <small>الأساسي الشهري المرجعي</small>
        <strong style="color: ${ACCENT}; font-size: 18px;">${esc(e.basic || '—')} ج.م</strong>
      </div>
      ` : ''}
    </div>
    
    <div class="doc-footer">
      <span>بيانات داخلية · مرجع الموظف ${esc(e.code)}</span>
      <span>نظام كيان لإدارة الرواتب</span>
    </div>
  </section>
  `).join('')}
</body>
</html>`;
}
export async function employeeExcel(employees:Employee[],company:string,includeSalary:boolean,logoPng?:Buffer,selectedFields?:string[]){const w=new ExcelJS.Workbook();const s=w.addWorksheet('بيانات الموظفين',{views:[{rightToLeft:true,state:'frozen',ySplit:3,xSplit:2}]});const displayFields=[...fields.filter(([k])=>k==='code'||k==='name'||!selectedFields||selectedFields.includes(k)),['active','نشط'] as [keyof Employee,string]];const columns=[...displayFields,...(includeSalary?[['basic','الأساسي الشهري'] as [keyof Employee,string]]:[])];s.mergeCells(1,1,1,columns.length);s.getCell('A1').value=`${company} — ملف بيانات الموظفين`;s.getRow(1).height=35;s.getCell('A1').font={name:'Arial',size:18,bold:true,color:{argb:'FF1C2A38'}};s.getRow(3).values=columns.map(x=>x[1]);employees.forEach(e=>s.addRow(columns.map(([key])=>key==='basic'&&e.basic?Number(e.basic):String(e[key]??''))));s.columns.forEach((c,i)=>{c.width=i===1?32:23;if(columns[i][0]==='basic')c.numFmt='#,##0.00';});s.eachRow((r,n)=>{if(n<3)return;r.height=30;r.eachCell(c=>{c.font={name:'Arial',size:11,color:{argb:n===3?'FFFFFFFF':'FF1C2A38'},bold:n===3};c.alignment={vertical:'middle',wrapText:true};if(n===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1C2A38'}};else if(n%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F5F8'}};});});s.autoFilter={from:{row:3,column:1},to:{row:3+employees.length,column:columns.length}};if(logoPng){const id=w.addImage({buffer:logoPng as any,extension:'png'});s.addImage(id,{tl:{col:columns.length-3,row:0},ext:{width:100,height:55}});s.getRow(1).height=48;}return Buffer.from(await w.xlsx.writeBuffer());}
