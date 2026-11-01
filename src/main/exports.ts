import ExcelJS from 'exceljs';
import type { Period, ExportOptions, Entry, Settings, RegisterColumn, MonthlyReportColumn, MonthlyReportSection } from '../shared/types';
import { labels, earningKeys, deductionKeys, money, type AmountKey } from '../domain/payroll';
import { dailyLabels, type DailyKind } from '../shared/types';

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function selectedEntries(p: Period, opts: ExportOptions): Entry[] {
  const ids = new Set(opts.entryIds);
  const rows = p.entries.filter(e => ids.has(e.id)).map(e => {
    if (e.result) return e;
    return {
      ...e,
      error:e.error||'بيانات الحساب غير مكتملة',
      result: {
        amounts: { basic:0, assignment:0, overtime:0, incentive:0, living:0, transport:0, other:0, advance:0, absence:0, doubleAbsence:0, delay:0, fellowship:0, penalties:0, timePenalty:0, dailyDeduction:0 },
        customAmounts: {},
        gross: 0, deductions: 0, net: 0, explanations: {}, version: ''
      }
    };
  }) as Entry[];
  if (!rows.length) throw new Error('اختر موظفًا واحدًا على الأقل');
  return rows;
}

const DEFAULT_REPORT_SECTIONS: MonthlyReportSection[] = ['overview','quality','centers','payment','components','daily','employees'];
const DEFAULT_REPORT_COLUMNS: MonthlyReportColumn[] = ['code','name','employerCompany','job','department','costCenter','paymentMethod','basic','gross','deductions','net','checked','paid'];
const REPORT_COLUMN_LABELS: Record<MonthlyReportColumn,string> = {
  code:'الكود', name:'اسم الموظف', employerCompany:'الشركة', job:'الوظيفة', department:'الإدارة',
  costCenter:'مركز التكلفة', paymentMethod:'طريقة الدفع', basic:'الأساسي', gross:'إجمالي الاستحقاقات',
  deductions:'إجمالي الاستقطاعات', net:'صافي المستحق', checked:'المراجعة', paid:'الصرف'
};

function monthlyReportData(p:Period, rows:Entry[]) {
  const sum=(key:'gross'|'deductions'|'net')=>rows.reduce((total,e)=>total+(e.result?.[key]||0),0);
  const group=(key:'costCenter'|'paymentMethod'|'employerCompany')=>{
    const values=new Map<string,{name:string;count:number;gross:number;deductions:number;net:number}>();
    for(const e of rows){const name=String(e.snapshot[key]||'غير محدد');const item=values.get(name)||{name,count:0,gross:0,deductions:0,net:0};item.count++;item.gross+=e.result?.gross||0;item.deductions+=e.result?.deductions||0;item.net+=e.result?.net||0;values.set(name,item);}
    return [...values.values()].sort((a,b)=>b.net-a.net);
  };
  const components=[
    ...earningKeys.map(key=>({key,name:labels[key],type:'استحقاق',amount:rows.reduce((n,e)=>n+(e.result?.amounts[key]||0),0)})),
    ...deductionKeys.map(key=>({key,name:labels[key],type:'استقطاع',amount:rows.reduce((n,e)=>n+(e.result?.amounts[key]||0),0)})),
    ...(p.policy?.formulas.customFields||[]).map(f=>({key:f.id,name:f.name,type:f.type==='earning'?'استحقاق':'استقطاع',amount:rows.reduce((n,e)=>n+(e.result?.customAmounts?.[f.id]||0),0)}))
  ].filter(item=>item.amount!==0).sort((a,b)=>b.amount-a.amount);
  const daily=(Object.keys(dailyLabels) as DailyKind[]).map(key=>({key,name:dailyLabels[key],quantity:rows.reduce((n,e)=>n+Number(e.daily?.[key]||0),0)})).filter(item=>item.quantity!==0);
  const gross=sum('gross'), deductions=sum('deductions'), net=sum('net');
  return {
    gross,deductions,net,
    averages:{net:rows.length?Math.round(net/rows.length):0},
    counts:{employees:rows.length,reviewed:rows.filter(e=>e.checked&&!e.error&&!!e.result&&e.result.net>=0).length,pending:rows.filter(e=>!e.checked||!!e.error||!e.result||(e.result?.net||0)<0).length,incomplete:rows.filter(e=>!!e.error||!e.result).length,paid:rows.filter(e=>e.paid).length,unpaid:rows.filter(e=>!e.paid).length},
    centers:group('costCenter'), payment:group('paymentMethod'), companies:group('employerCompany'), components, daily
  };
}

function monthlyReportHtml(p:Period,opts:ExportOptions,logo:string,font:string,rows:Entry[]) {
  const esc=escapeHtml, data=monthlyReportData(p,rows), selected=new Set(opts.reportSections||DEFAULT_REPORT_SECTIONS);
  const company=esc(p.policy?.company||'كيان');
  const monthAr=new Date(`${p.month}-01T12:00:00`).toLocaleDateString('ar-EG',{month:'long',year:'numeric'});
  const accent=opts.monochrome?'#475569':'#EC671B', navy='#1C2A38', border='#E2E8F0';
  const isApproved = p.status === 'approved';

  const chart=(id:string,title:string,items:Array<{name:string;value:number;label:string}>)=>{
    if(!items.length)return `<div class="empty-chart">لا توجد بيانات كافية لعرض الرسم البياني</div>`;
    const max=Math.max(...items.map(x=>Math.abs(x.value)),1);
    const total=items.reduce((s,x)=>s+Math.abs(x.value),0);
    const height=66+items.length*46;
    const gradients = opts.monochrome ? `
      <linearGradient id="cGrad0_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#64748B"/></linearGradient>
      <linearGradient id="cGrad1_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#334155"/><stop offset="100%" stop-color="#475569"/></linearGradient>
      <linearGradient id="cGrad2_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#64748B"/><stop offset="100%" stop-color="#94A3B8"/></linearGradient>
    ` : `
      <linearGradient id="cGrad0_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#EC671B"/><stop offset="100%" stop-color="#FB923C"/></linearGradient>
      <linearGradient id="cGrad1_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#1C2A38"/><stop offset="100%" stop-color="#334E68"/></linearGradient>
      <linearGradient id="cGrad2_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#0D9488"/><stop offset="100%" stop-color="#2DD4BF"/></linearGradient>
      <linearGradient id="cGrad3_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#A78BFA"/></linearGradient>
      <linearGradient id="cGrad4_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#D97706"/><stop offset="100%" stop-color="#FBBF24"/></linearGradient>
      <linearGradient id="cGrad5_${id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="#E11D48"/><stop offset="100%" stop-color="#FB7185"/></linearGradient>
    `;

    return `<svg class="report-chart" data-report-chart="${esc(id)}" viewBox="0 0 960 ${height}" role="img" aria-label="${esc(title)}">
      <defs>
        ${gradients}
      </defs>
      <rect x="946" y="16" width="5" height="24" rx="2.5" fill="${accent}"/>
      <text x="932" y="34" text-anchor="start" direction="rtl" class="chart-title">${esc(title)}</text>
      <text x="25" y="34" text-anchor="end" direction="rtl" class="chart-subtitle">${items.length} تصنيفات${total>0&&id!=='payment'?` · الإجمالي: ${money(total)} جنيه`:''}</text>
      ${items.map((item,i)=>{
        const y=58+i*46;
        const barW=Math.max(8,Math.round((Math.abs(item.value)/max)*400));
        const pct=total>0?Math.round((Math.abs(item.value)/total)*100):0;
        const gradName=opts.monochrome?`cGrad${i%3}_${id}`:`cGrad${i%6}_${id}`;
        const displayName=item.name.length>38?item.name.slice(0,37)+'…':item.name;
        return `
        <g class="chart-row">
          <rect x="18" y="${y}" width="924" height="38" rx="7" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="0.8"/>
          <text x="922" y="${y+24}" text-anchor="start" direction="rtl" class="chart-label">${esc(displayName)}</text>
          <rect x="255" y="${y+13}" width="400" height="12" rx="6" fill="#EDF2F7"/>
          <rect x="${255+400-barW}" y="${y+13}" width="${barW}" height="12" rx="6" fill="url(#${gradName})"/>
          <rect x="198" y="${y+10}" width="46" height="19" rx="9.5" fill="#EEF2F6"/>
          <text x="221" y="${y+23}" text-anchor="middle" direction="ltr" class="chart-pct">${pct}%</text>
          <text x="32" y="${y+24}" text-anchor="start" direction="ltr" class="chart-value">${esc(item.label)}</text>
        </g>`;
      }).join('')}
    </svg>`;
  };

  const colKeys=(opts.reportColumns?.length?opts.reportColumns:DEFAULT_REPORT_COLUMNS).filter((key,index,list)=>Object.hasOwn(REPORT_COLUMN_LABELS,key)&&list.indexOf(key)===index);
  const employeeCell=(e:Entry,key:MonthlyReportColumn)=>{
    if(key==='gross'||key==='deductions'||key==='net')return money(e.result?.[key]||0);
    if(key==='basic')return money(e.result?.amounts.basic||0);
    if(key==='checked')return e.checked&&!e.error&&!!e.result&&e.result.net>=0?'تمت المراجعة':'بانتظار المراجعة';
    if(key==='paid')return e.paid?'تم الصرف':'لم يُصرف';
    return String((e.snapshot as any)[key]||'—');
  };

  const section=(title:string,content:string)=>`<section class="report-section"><h2>${esc(title)}</h2>${content}</section>`;

  const header=`<header class="report-header">
    <div class="header-brand">
      <img class="report-logo" src="${esc(logo)}" alt="شعار الشركة">
      <div class="brand-details">
        <h1>${company}</h1>
        <span class="report-title-label">التقرير الشهري للرواتب — الإدارة المالية</span>
      </div>
    </div>
    <div class="header-center">
      <div class="period-pill">
        <span class="period-label">عن مسير شهر</span>
        <strong class="period-name">${esc(monthAr)}</strong>
      </div>
    </div>
    <div class="header-meta">
      <div class="status-stamp ${isApproved?'approved':'draft'}">
        ${isApproved?'✓ نسخة رسمية معتمدة':'⚠ مسودة غير معتمدة'}
      </div>
      <div class="meta-details">
        <span>كود المرجع: <code>${esc(p.id.slice(0,8))}</code></span>
        <span>النطاق: <b>${rows.length}</b> موظف</span>
        <span>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}</span>
      </div>
    </div>
  </header>`;

  const overview=selected.has('overview')?section('الملخص التنفيذي',`
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-top"><span>إجمالي الاستحقاقات</span><span class="kpi-dot orange"></span></div>
        <strong class="kpi-val">${money(data.gross)}</strong>
        <small>جنيه مصري · الرواتب والبدلات</small>
      </div>
      <div class="kpi">
        <div class="kpi-top"><span>إجمالي الاستقطاعات</span><span class="kpi-dot slate"></span></div>
        <strong class="kpi-val">${money(data.deductions)}</strong>
        <small>جنيه مصري · الخصومات والسلف</small>
      </div>
      <div class="kpi highlight">
        <div class="kpi-top"><span>صافي المستحق للصرف</span><span class="kpi-badge">صافي الواجب سداده</span></div>
        <strong class="kpi-val net">${money(data.net)}</strong>
        <small>جنيه مصري · إجمالي الصرف</small>
      </div>
      <div class="kpi">
        <div class="kpi-top"><span>متوسط الصافي للموظف</span></div>
        <strong class="kpi-val">${money(data.averages.net)}</strong>
        <small>لكل موظف ضمن نطاق التقرير</small>
      </div>
      <div class="kpi">
        <div class="kpi-top"><span>إجمالي عدد الموظفين</span></div>
        <strong class="kpi-val count">${String(data.counts.employees)}</strong>
        <small>موظف وعامل مسجلين بالمسير</small>
      </div>
      <div class="kpi ${isApproved?'approved-card':'draft-card'}">
        <div class="kpi-top"><span>حالة اعتماد المسير</span></div>
        <strong class="kpi-val status">${isApproved?'معتمد رسمياً':'مسودة غير معتمدة'}</strong>
        <small>${p.approvedAt?`اعتمد بتاريخ ${p.approvedAt.slice(0,10)}`:'غير معتمد بعد'}</small>
      </div>
    </div>
  `):'';

  const quality=selected.has('quality')?section('المراجعة والصرف',`
    <div class="quality-grid">
      <div class="quality-card q-reviewed">
        <div class="q-icon">✓</div>
        <div class="q-body">
          <span class="q-label">تمت مراجعته</span>
          <strong class="q-num">${data.counts.reviewed}</strong>
          <small class="q-sub">جاهز للصرف</small>
        </div>
      </div>
      <div class="quality-card q-pending">
        <div class="q-icon">⏱</div>
        <div class="q-body">
          <span class="q-label">بانتظار المراجعة</span>
          <strong class="q-num">${data.counts.pending}</strong>
          <small class="q-sub">تحت التدقيق</small>
        </div>
      </div>
      <div class="quality-card q-incomplete">
        <div class="q-icon">⚠</div>
        <div class="q-body">
          <span class="q-label">بيانات ناقصة</span>
          <strong class="q-num">${data.counts.incomplete}</strong>
          <small class="q-sub">تتطلب استكمالاً</small>
        </div>
      </div>
      <div class="quality-card q-paid">
        <div class="q-icon">💳</div>
        <div class="q-body">
          <span class="q-label">تم الصرف</span>
          <strong class="q-num">${data.counts.paid}</strong>
          <small class="q-sub">تم تحويل مستحقاتهم</small>
        </div>
      </div>
      <div class="quality-card q-unpaid">
        <div class="q-icon">⏳</div>
        <div class="q-body">
          <span class="q-label">لم يُصرف بعد</span>
          <strong class="q-num">${data.counts.unpaid}</strong>
          <small class="q-sub">في انتظار الصرف</small>
        </div>
      </div>
    </div>
  `):'';

  const centers=selected.has('centers')?section('التوزيع حسب مركز التكلفة',`
    ${chart('centers','صافي المستحق حسب مركز التكلفة',data.centers.slice(0,12).map(x=>({name:x.name,value:x.net,label:money(x.net)})))}
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:28%">مركز التكلفة</th>
          <th style="width:12%">عدد الموظفين</th>
          <th style="width:18%">إجمالي الاستحقاقات</th>
          <th style="width:18%">إجمالي الاستقطاعات</th>
          <th style="width:18%">صافي المستحق</th>
          <th style="width:6%">النسبة</th>
        </tr>
      </thead>
      <tbody>
        ${data.centers.map(x=>{
          const pct=data.net>0?((x.net/data.net)*100).toFixed(1):'0';
          return `<tr>
            <td><strong>${esc(x.name)}</strong></td>
            <td class="num">${x.count}</td>
            <td class="num">${money(x.gross)}</td>
            <td class="num">${money(x.deductions)}</td>
            <td class="num strong-net">${money(x.net)}</td>
            <td class="num muted">${pct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr class="table-total-row">
          <td><strong>الإجمالي (${data.centers.length} مركز)</strong></td>
          <td class="num"><strong>${data.counts.employees}</strong></td>
          <td class="num"><strong>${money(data.gross)}</strong></td>
          <td class="num"><strong>${money(data.deductions)}</strong></td>
          <td class="num highlight-net"><strong>${money(data.net)}</strong></td>
          <td class="num"><strong>100%</strong></td>
        </tr>
      </tfoot>
    </table>
    <h3 class="subsection-title">التوزيع حسب الشركة التابعة</h3>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:40%">الشركة</th>
          <th style="width:15%">عدد الموظفين</th>
          <th style="width:30%">صافي المستحق</th>
          <th style="width:15%">النسبة</th>
        </tr>
      </thead>
      <tbody>
        ${data.companies.map(x=>{
          const pct=data.net>0?((x.net/data.net)*100).toFixed(1):'0';
          return `<tr>
            <td><strong>${esc(x.name)}</strong></td>
            <td class="num">${x.count}</td>
            <td class="num strong-net">${money(x.net)}</td>
            <td class="num muted">${pct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr class="table-total-row">
          <td><strong>الإجمالي</strong></td>
          <td class="num"><strong>${data.counts.employees}</strong></td>
          <td class="num highlight-net"><strong>${money(data.net)}</strong></td>
          <td class="num"><strong>100%</strong></td>
        </tr>
      </tfoot>
    </table>
  `):'';

  const payment=selected.has('payment')?section('التوزيع حسب طريقة الدفع',`
    ${chart('payment','عدد الموظفين حسب طريقة الدفع',data.payment.map(x=>({name:x.name,value:x.count,label:`${x.count} موظف`})))}
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:40%">طريقة الدفع / الصرف</th>
          <th style="width:15%">عدد الموظفين</th>
          <th style="width:30%">صافي المستحق</th>
          <th style="width:15%">نسبة الموظفين</th>
        </tr>
      </thead>
      <tbody>
        ${data.payment.map(x=>{
          const pct=data.counts.employees>0?((x.count/data.counts.employees)*100).toFixed(1):'0';
          return `<tr>
            <td><strong>${esc(x.name)}</strong></td>
            <td class="num">${x.count}</td>
            <td class="num strong-net">${money(x.net)}</td>
            <td class="num muted">${pct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr class="table-total-row">
          <td><strong>الإجمالي</strong></td>
          <td class="num"><strong>${data.counts.employees}</strong></td>
          <td class="num highlight-net"><strong>${money(data.net)}</strong></td>
          <td class="num"><strong>100%</strong></td>
        </tr>
      </tfoot>
    </table>
  `):'';

  const components=selected.has('components')?section('تفصيل بنود الرواتب',`
    ${chart('components','أعلى بنود الاستحقاق والاستقطاع',data.components.slice(0,12).map(x=>({name:`${x.name} · ${x.type}`,value:x.amount,label:money(x.amount)})))}
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:50%">بند الراتب</th>
          <th style="width:20%">نوع البند</th>
          <th style="width:30%">إجمالي المبلغ</th>
        </tr>
      </thead>
      <tbody>
        ${data.components.map(x=>`<tr>
          <td><strong>${esc(x.name)}</strong></td>
          <td><span class="type-pill ${x.type==='استحقاق'?'earn':'ded'}">${esc(x.type)}</span></td>
          <td class="num ${x.type==='استحقاق'?'num-earn':'num-ded'}">${money(x.amount)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr class="table-total-row">
          <td colspan="2"><strong>صافي المسير (الاستحقاقات − الاستقطاعات)</strong></td>
          <td class="num highlight-net"><strong>${money(data.net)}</strong></td>
        </tr>
      </tfoot>
    </table>
  `):'';

  const daily=selected.has('daily')?section('ملخص الحركات اليومية',data.daily.length?`
    <table class="report-table">
      <thead>
        <tr>
          <th style="width:60%">نوع الحركة اليومية</th>
          <th style="width:40%">الكمية المسجلة</th>
        </tr>
      </thead>
      <tbody>
        ${data.daily.map(x=>`<tr>
          <td><strong>${esc(x.name)}</strong></td>
          <td class="num">${esc(x.quantity.toLocaleString('ar-EG'))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `:'<p class="muted-box">لا توجد حركات يومية مسجلة في هذا المسير.</p>'):'';

  const employees=selected.has('employees')?section('تفاصيل الموظفين',`
    <table class="report-table employee-table">
      <thead>
        <tr>${colKeys.map(k=>`<th>${esc(REPORT_COLUMN_LABELS[k])}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(e=>`<tr>${colKeys.map(k=>{
          const isNum=['basic','gross','deductions','net'].includes(k);
          const isStatus=k==='checked'||k==='paid';
          const val=employeeCell(e,k);
          if(isStatus){
            const ok=val==='تمت المراجعة'||val==='تم الصرف';
            return `<td><span class="status-chip ${ok?'ok':'wait'}">${esc(val)}</span></td>`;
          }
          return `<td class="${isNum?'num':''} ${k==='net'?'strong-net':''}">${esc(val)}</td>`;
        }).join('')}</tr>`).join('')}
      </tbody>
      <tfoot>
        <tr class="table-total-row">
          <td><strong>إجمالي (${rows.length} موظف)</strong></td>
          ${colKeys.slice(1).map(k=>{
            if(k==='gross')return `<td class="num"><strong>${money(data.gross)}</strong></td>`;
            if(k==='deductions')return `<td class="num"><strong>${money(data.deductions)}</strong></td>`;
            if(k==='net')return `<td class="num highlight-net"><strong>${money(data.net)}</strong></td>`;
            return `<td></td>`;
          }).join('')}
        </tr>
      </tfoot>
    </table>
  `):'';

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${company} - التقرير الشهري ${esc(p.month)}</title><style>
  @font-face{font-family:Arabic;src:url('${font}') format('truetype')}
  *{box-sizing:border-box}
  @page{size:A4 landscape;margin:8mm 10mm 10mm 10mm}
  body{margin:0 auto;width:277mm;padding:0;color:#1C2A38;background:#fff;font:11px Arabic,'Noto Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif;line-height:1.55}
  
  /* ── Header ── */
  .report-header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:3.5px solid ${accent};padding:0 0 16px;margin-bottom:20px;break-inside:avoid}
  .header-brand{display:flex;align-items:center;gap:16px}
  .report-logo{width:88px;height:54px;object-fit:contain}
  .brand-details h1{font-size:20px;font-weight:800;color:${navy};margin:0 0 3px}
  .report-title-label{font-size:12px;color:#64748B;font-weight:500}
  .header-center{display:flex;justify-content:center}
  .period-pill{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px 20px;text-align:center}
  .period-label{display:block;font-size:10px;color:#94A3B8;margin-bottom:2px}
  .period-name{font-size:16px;font-weight:800;color:${navy}}
  .header-meta{text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
  .status-stamp{font-size:11px;font-weight:700;padding:5px 14px;border-radius:20px;white-space:nowrap}
  .status-stamp.approved{background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0}
  .status-stamp.draft{background:#FFFBEB;color:#92400E;border:1px solid #FDE68A}
  .meta-details{display:flex;gap:12px;font-size:9.5px;color:#64748B}
  .meta-details code{font-family:Consolas,monospace;background:#F1F5F9;padding:1px 5px;border-radius:4px;font-size:9.5px}
  
  /* ── Sections ── */
  .report-section{margin:0 0 22px;break-inside:avoid}
  .report-section h2{font-size:14.5px;font-weight:800;color:${navy};margin:0 0 12px;display:flex;align-items:center;gap:8px;padding-bottom:6px;border-bottom:2px solid #E2E8F0}
  .report-section h2::before{content:'';width:4px;height:16px;border-radius:2px;background:${accent}}
  .subsection-title{font-size:12.5px;font-weight:700;color:${navy};margin:16px 0 8px}

  /* ── KPIs ── */
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .kpi{border:1px solid ${border};border-radius:10px;padding:12px 14px;background:#FAFBFC;display:flex;flex-direction:column;gap:4px;box-shadow:0 1px 2px rgba(0,0,0,0.02)}
  .kpi.highlight{background:#FFF9F5;border:1.5px solid #FDBA74;border-top:3.5px solid ${accent}}
  .kpi.approved-card{border-top:3px solid #059669}
  .kpi.draft-card{border-top:3px solid #D97706}
  .kpi-top{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#64748B;font-weight:600}
  .kpi-dot{width:6px;height:6px;border-radius:50%}
  .kpi-dot.orange{background:${accent}}
  .kpi-dot.slate{background:#64748B}
  .kpi-badge{font-size:9px;background:#FFEDD5;color:#C2410C;padding:2px 8px;border-radius:10px;font-weight:700}
  .kpi-val{font-size:19px;font-weight:800;color:${navy};direction:ltr;text-align:right;font-variant-numeric:tabular-nums;margin:2px 0}
  .kpi-val.net{color:#C2410C;font-size:21px}
  .kpi-val.count{font-size:22px}
  .kpi-val.status{font-size:15px;direction:rtl}
  .kpi small{font-size:9px;color:#94A3B8}

  /* ── Quality Grid ── */
  .quality-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
  .quality-card{border:1px solid ${border};border-radius:9px;padding:10px 12px;display:flex;align-items:center;gap:10px;background:#FAFBFC}
  .quality-card.q-reviewed{border-top:3px solid #059669;background:#F0FDF4}
  .quality-card.q-pending{border-top:3px solid #D97706;background:#FFFBEB}
  .quality-card.q-incomplete{border-top:3px solid #DC2626;background:#FEF2F2}
  .quality-card.q-paid{border-top:3px solid #0284C7;background:#F0F9FF}
  .quality-card.q-unpaid{border-top:3px solid #64748B;background:#F8FAFC}
  .q-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:12px;flex-shrink:0;background:rgba(255,255,255,0.8);font-weight:700}
  .q-reviewed .q-icon{color:#059669}
  .q-pending .q-icon{color:#D97706}
  .q-incomplete .q-icon{color:#DC2626}
  .q-paid .q-icon{color:#0284C7}
  .q-unpaid .q-icon{color:#64748B}
  .q-body{display:flex;flex-direction:column}
  .q-label{font-size:10px;color:#475569;font-weight:600}
  .q-num{font-size:17px;font-weight:800;color:${navy};font-variant-numeric:tabular-nums;margin:1px 0}
  .q-sub{font-size:8.5px;color:#94A3B8}

  /* ── Charts ── */
  .report-chart{width:100%;max-height:480px;margin:6px 0 14px;overflow:visible}
  .chart-title{font:800 16px Arabic,'Segoe UI',sans-serif;fill:${navy}}
  .chart-subtitle{font:600 11.5px Arabic,'Segoe UI',sans-serif;fill:#64748B}
  .chart-label{font:700 12px Arabic,'Segoe UI',sans-serif;fill:#1C2A38}
  .chart-value{font:800 12.5px Arabic,'Segoe UI',sans-serif;fill:#1C2A38;font-variant-numeric:tabular-nums}
  .chart-pct{font:700 10.5px Arabic,'Segoe UI',sans-serif;fill:#475569}

  /* ── Tables ── */
  .report-table{width:100%;border-collapse:separate;border-spacing:0;margin:10px 0 14px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden}
  thead{display:table-header-group}
  th{background:${navy};color:#FFFFFF;font-weight:700;text-align:right;padding:8px 10px;font-size:9.5px;white-space:nowrap}
  td{border-bottom:1px solid #EDF2F7;padding:7px 10px;font-size:9.5px;vertical-align:middle;color:#334155}
  tbody tr:nth-child(even){background:#F8FAFC}
  tbody tr:hover{background:#F1F5F9}
  .num{direction:ltr;text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
  .strong-net{font-weight:700;color:${navy}}
  .highlight-net{color:#C2410C;font-weight:800;font-size:10.5px}
  .table-total-row td{background:#F1F5F9;border-top:2px solid ${navy};color:${navy};font-weight:700}
  .type-pill{display:inline-block;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700}
  .type-pill.earn{background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0}
  .type-pill.ded{background:#FFF1F2;color:#9F1239;border:1px solid #FECDD3}
  .num-earn{color:#065F46;font-weight:600}
  .num-ded{color:#9F1239;font-weight:600}
  .status-chip{display:inline-block;padding:2px 8px;border-radius:12px;font-size:8.5px;font-weight:700}
  .status-chip.ok{background:#ECFDF5;color:#065F46}
  .status-chip.wait{background:#FFFBEB;color:#92400E}
  .employee-table{font-size:8.5px}
  .employee-table th,.employee-table td{padding:5px 7px}
  .empty-chart,.muted-box{padding:14px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:8px;color:#94A3B8;text-align:center;font-size:10.5px}
  
  /* ── Footer ── */
  .report-footer{border-top:1.5px solid #E2E8F0;padding-top:10px;margin-top:20px;color:#94A3B8;font-size:9px;display:flex;justify-content:space-between;align-items:center;break-inside:avoid}
  .report-footer code{font-family:Consolas,monospace;background:#F1F5F9;padding:1px 4px;border-radius:3px}
  </style></head><body>${header}${overview}${quality}${centers}${payment}${components}${daily}${employees}<footer class="report-footer"><span>نظام كيان المالي · كود التقرير <code>${esc(p.id)}</code> · شهر ${esc(p.month)}${p.approvedAt?` · اعتماد رسمي ${esc(p.approvedAt.slice(0,10))}`:''}</span><span>إصدار رسمي معتمد · تاريخ الطباعة ${new Date().toLocaleDateString('ar-EG')}</span></footer></body></html>`;
}

// ─── Professional HTML export ────────────────────────────────────────────────
export function printHtml(p: Period, opts: ExportOptions, logo: string, font: string): string {
  const rows = selectedEntries(p, opts);
  if(opts.template==='monthly')return monthlyReportHtml(p,opts,logo,font,rows);
  const esc = escapeHtml;
  const company = esc(p.policy?.company || 'كيان');
  const formulas = p.policy?.formulas;
  const isApproved = p.status === 'approved' && p.view!=='accrued';

  // Brand colors — matches the logo (Orange and Dark Navy)
  const ACCENT = opts.monochrome ? '#475569' : '#EC671B';   // Brand Orange
  const ACCENT_LIGHT = opts.monochrome ? '#F1F5F9' : '#FFF5EB'; // Light Orange
  const ACCENT_BORDER = opts.monochrome ? '#CBD5E1' : '#FDE6C8'; // Pale Orange
  const TEXT_DARK = '#1C2A38';   // Brand Dark Navy
  const TEXT_MID  = '#475569';   // Slate
  const TEXT_MUTED = '#94A3B8';  // Light Slate
  const ROW_EVEN  = '#F8FAFC';   // Off-white
  const BORDER    = '#E2E8F0';   // Slate-200
  const EARN_HDR  = opts.monochrome ? '#334155' : '#1C2A38'; // Navy
  const DED_HDR   = opts.monochrome ? '#475569' : '#C05621'; // Burnt Orange
  const NET_BG    = opts.monochrome ? '#F1F5F9' : '#FFF5EB';
  const TFOOT_BG  = opts.monochrome ? '#E2E8F0' : '#FFF0E4';

  const baseCSS = `
    @font-face { font-family: Arabic; src: url('${font}') format('truetype'); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: ${opts.paper}${opts.template==='register'?' landscape':''}; margin: 10mm 15mm 10mm 15mm; }
    body {
      font-family: Arabic, 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 16px; color: ${TEXT_DARK}; background: white; direction: rtl;
    }
    /* ── Header ── */
    .doc-header {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      border-bottom: 3.5px solid ${ACCENT}; padding-bottom: 16px; margin-bottom: 24px;
    }
    .doc-header img { height: 65px; object-fit: contain; }
    .doc-header .co-info { flex: 1; text-align: left; }
    .doc-header .sub { font-size: 18px; font-weight: 700; color: ${TEXT_DARK}; margin-bottom: 4px; }
    .doc-header .sub small { display: block; font-size: 14px; color: ${TEXT_MUTED}; font-weight: 400; }
    .doc-header .status-badge {
      background: ${isApproved ? '#F0FDF4' : '#F8FAFC'};
      color: ${isApproved ? '#166534' : '#475569'};
      border: 1px solid ${isApproved ? '#BBF7D0' : '#CBD5E1'};
      border-radius: 20px; padding: 6px 14px; font-size: 13px; white-space: nowrap; font-weight: 600;
    }
    /* ── Slip ── */
    .slip {
      display: flex; flex-direction: column;
      min-height: 260mm; /* Use min-height to allow flex to push footer to bottom without clipping */
      page-break-after: always; padding-bottom: 15px;
    }
    .slip:last-child { page-break-after: auto; }
    .compact .slip { min-height: 130mm; padding-bottom: 15px; page-break-after: auto; }
    .compact .slip:nth-child(2n+1) { border-bottom: 1.5px dashed ${BORDER}; margin-bottom: 8mm; }
    .compact .slip:nth-child(2n) { page-break-after: always; }
    /* Employee info bar — light version */
    .emp-bar {
      display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: 0;
      background: #F8FAFC; border: 1px solid #E2E8F0;
      border-radius: 8px; margin-bottom: 24px; overflow: hidden;
    }
    .emp-cell { padding: 14px 16px; }
    .emp-cell:not(:last-child) { border-left: 1px solid #E2E8F0; }
    .emp-cell .lbl { font-size: 11px; color: ${TEXT_MUTED}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
    .emp-cell .val { font-size: 16px; color: ${TEXT_DARK}; font-weight: 700; }
    .emp-cell .val.lg { font-size: 18px; color: ${ACCENT}; }
    /* Month badge */
    .month-badge { display: none; /* Removed since it's now in the header */ }
    /* Two-column tables */
    .slip-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      padding: 12px 14px; font-size: 15px; font-weight: 700; text-align: right; color: white;
    }
    thead th:first-child { border-radius: 0 6px 0 0; }
    thead th:last-child  { border-radius: 6px 0 0 0; }
    .earn-table thead th { background: ${EARN_HDR}; }
    .ded-table  thead th { background: ${DED_HDR};  }
    thead th.num { text-align: left; }
    tbody td { padding: 12px 14px; border-bottom: 1px solid ${BORDER}; vertical-align: top; font-size: 15px; }
    tbody td.num { direction: ltr; text-align: left; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 16px; font-weight: 600; }
    tbody tr:nth-child(even) td { background: ${ROW_EVEN}; }
    tfoot td {
      background: ${TFOOT_BG};
      font-weight: 700; padding: 12px 14px; font-size: 16px;
      border-top: 1.5px solid ${ACCENT};
    }
    tfoot td.num { direction: ltr; text-align: left; }
    .note-cell { font-size: 12px; color: ${TEXT_MUTED}; display: block; margin-top: 4px; }
    /* Net box */
    .net-box {
      display: flex; align-items: center; justify-content: space-between;
      background: ${NET_BG}; border: 1.5px solid ${ACCENT_BORDER};
      border-right: 6px solid ${ACCENT}; border-radius: 8px;
      padding: 20px 24px; margin: 0 0 16px;
    }
    .net-box .label { font-size: 18px; font-weight: 700; color: ${TEXT_DARK}; }
    .net-box .amount { direction: ltr; font-size: 32px; font-weight: 800; color: ${ACCENT}; letter-spacing: -0.5px; }
    .net-box .currency { font-size: 13px; color: ${TEXT_MUTED}; display: block; }
    /* Notes */
    .note { margin: 16px 0; padding: 16px 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 14px; color: #475569; }
    /* ── Register ── */
    .register-wrap { width: 100%; display: flex; flex-direction: column; min-height: 260mm; padding-bottom: 15px; }
    .reg-table thead th { background: ${ACCENT}; font-size: 13px; padding: 10px 12px; }
    .reg-table td { padding: 10px 12px; font-size: 13.5px; }
    .total-row td { background: ${TFOOT_BG} !important; font-weight: 700; }
    /* ── Footer — sticky at page bottom ── */
    .doc-footer {
      margin-top: auto;
      padding-top: 12px; border-top: 1px solid ${BORDER};
      font-size: 12px; color: ${TEXT_MUTED};
      display: flex; justify-content: space-between;
      page-break-inside: avoid;
    }
    ${opts.paper === 'A5' ? 'body { font-size: 13px; } .emp-cell .val.lg { font-size: 15px; } .net-box .amount { font-size: 24px; } .slip-tables { gap: 12px; } table th, table td { padding: 8px 10px; } .doc-footer { font-size: 10px; }' : ''}
    ${opts.template === 'compact' ? 'body { font-size: 9.5px; } .compact .slip-tables { gap: 6px; margin-bottom: 4px; } .compact table th, .compact table td { padding: 2px 4px; font-size: 9px; } .compact .net-box { padding: 4px 8px; margin-bottom: 4px; } .compact .net-box .amount { font-size: 18px; }' : ''}
  
    body{width:${opts.template==='register'?(opts.paper==='A4'?'267mm':'180mm'):(opts.paper==='A4'?'180mm':'118mm')};line-height:1.6}
    ${opts.paper==='A5'?'.slip{line-height:1.35}.slip-tables{gap:8px;margin-bottom:10px}.slip table th,.slip table td,.slip tbody td.num,.slip tfoot td{font-size:10px;padding:5px 6px}.slip .note-cell{font-size:8px;margin-top:2px}.slip .emp-cell{padding:6px}.slip .emp-cell .val,.slip .emp-cell .val.lg{font-size:11px}.slip .emp-cell .lbl{font-size:8px;margin-bottom:2px}.slip .doc-header .sub small{font-size:9px}.slip .status-badge{font-size:9px;padding:4px 6px}.slip .net-box{padding:8px 12px;margin-bottom:8px}.slip .net-box .label{font-size:13px}.slip .net-box .amount{font-size:21px}.slip .note{font-size:9px;padding:6px;margin:6px 0}.slip .doc-footer{font-size:8px;padding-top:5px}':''}
    .compact{line-height:1.3}.compact tbody td.num{font-size:9.5px}.compact .emp-cell .lbl{font-size:7.5px;margin-bottom:1px}.compact .slip>*{flex-shrink:0}.compact .signatures{font-size:8.5px;margin:3px 0}
    .signatures{display:flex;justify-content:space-between;margin:10px 0;font-size:11px}.register-wrap{min-height:0}.reg-table{table-layout:fixed}.reg-table th,.reg-table td{overflow-wrap:anywhere;font-size:10px;padding:7px 4px}.reg-table td.num{font-size:10px;white-space:normal}
    .cutoff-banner{padding:7px 10px;background:#fff0e4;margin-bottom:10px;font-size:12px;font-weight:700}
    .slip{min-height:0;break-inside:avoid}
    ${opts.paper==='A5'?'.slip{font-size:11px}.doc-header{margin-bottom:12px;padding-bottom:8px}.doc-header img{height:42px}.emp-bar{margin-bottom:10px}.doc-header .sub{font-size:14px}':''}
    .compact .slip{height:138mm;min-height:0;padding:0 0 1mm;margin:0;break-inside:avoid;font-size:9px}
    .compact .slip:nth-child(2n+1){margin-bottom:2mm}
    .compact .doc-header{padding-bottom:3px;margin-bottom:4px;gap:6px}
    .compact .doc-header img{height:28px}.compact .doc-header .sub{font-size:11.5px}.compact .doc-header .sub small{font-size:8px}.compact .status-badge{font-size:8px;padding:2px 6px}
    .compact .emp-bar{margin-bottom:4px}.compact .emp-cell{padding:2px 5px}.compact .emp-cell .val,.compact .emp-cell .val.lg{font-size:9.5px}.compact .emp-cell .key{font-size:8px}.compact .net-box{padding:3px 6px;margin-bottom:3px}.compact .net-box .amount{font-size:16px}.compact .net-box .label{font-size:10px}.compact .note-cell{font-size:7px;margin-top:1px}.compact .doc-footer{font-size:7.5px;padding-top:3px}.compact .note{font-size:8px;margin:2px 0;padding:3px}.compact .month-badge{font-size:8.5px;margin-bottom:3px}.compact .slip-tables{margin-bottom:3px;gap:6px}.compact tfoot td{font-size:9.5px;padding:2px 4px}.compact th,.compact td{padding:2px 4px;font-size:9px}
`;

  const monthAr = new Date(`${p.month}-01T12:00:00`).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });

  const docHeader = (label: string) => `
    <div class="doc-header">
      <img src="${logo}" alt="شعار الشركة"/>
      <div class="status-badge">${isApproved ? 'نسخة معتمدة' : '⚠ مسودة غير معتمدة'}</div>
      <div class="co-info">
        <div class="sub">${label} <small>شهر ${monthAr}${p.view==='accrued'?` — مستحق حتى ${esc(p.asOf)} (بيان مرحلي)`:''}</small></div>
      </div>
    </div>`;

  const docFooter = (entryId = '') => `
    <div class="doc-footer">
      <span>شهر ${esc(p.month)} · مرجع ${p.id.slice(0, 8)}${entryId ? ` · ${entryId.slice(0, 6)}` : ''} · ${isApproved ? 'اعتماد ' + esc(p.approvedAt?.slice(0, 10) || '') : 'للمراجعة فقط'}</span>
      <span>طُبع: ${new Date().toLocaleDateString('ar-EG')}</span>
    </div>`;

  const show=(key:string)=>!opts.slipFields||opts.slipFields.includes(key);
  const line = (e: Entry, k: AmountKey) => {
    if(!show(k))return '';
    const v = e.result!.amounts[k];
    if (opts.hideZeros && k !== 'basic' && v === 0) return '';
    const exp = opts.explanations && e.result!.explanations[k]
      ? `<span class="note-cell">${esc(e.result!.explanations[k])}</span>` : '';
    return `<tr><td>${esc(labels[k])}${exp}</td><td class="num">${money(v)}</td></tr>`;
  };

  let body = '';

  if (opts.template === 'register') {
    // Configurable column register
    const cols: RegisterColumn[] = opts.registerColumns || ['code','name','costCenter','basic','gross','deductions','net','signature'];
    if(!cols.length||cols.length>20)throw new Error('اختر من عمود واحد إلى 20 عمودًا للكشف الجدولي');

    const colLabel: Record<string, string> = {
      code: 'الكود', name: 'الاسم', job: 'الوظيفة', costCenter: 'مركز التكلفة',
      paymentMethod: 'طريقة الدفع',
      basic: 'الأساسي', assignment: 'التكليف', overtime:'أيام عمل إضافية', incentive: 'حافز',
      living: 'إعاشة', transport: 'مواصلات', other: 'أخرى',
      advance: 'السلف', absence: 'خصم الغياب', doubleAbsence:'غياب بخصم يومين', delay: 'خصم التأخير',
      fellowship: 'صندوق الزمالة', penalties: 'جزاءات بمبلغ',timePenalty:'جزاءات بالساعات/الأيام',dailyDeduction:'خصومات يومية',
      gross: 'إجمالي الاستحقاقات', deductions: 'إجمالي الاستقطاعات',
      net: 'صافي المرتب', signature: 'التوقيع'
    };
    if (formulas?.customFields) {
      for (const f of formulas.customFields) {
        colLabel[f.id] = f.name;
      }
    }

    if(cols.some(c=>!Object.hasOwn(colLabel,c))||new Set(cols).size!==cols.length)throw new Error('أعمدة التصدير غير صالحة أو مكررة');
    const numCols = new Set(['basic', 'assignment', 'overtime', 'incentive', 'living', 'transport', 'other', 'advance', 'absence', 'doubleAbsence', 'delay', 'fellowship', 'penalties', 'timePenalty', 'dailyDeduction', 'gross', 'deductions', 'net', ...(formulas?.customFields?.map((f: any)=>f.id) || [])]);

    const getCellVal = (e: Entry, col: RegisterColumn): string => {
      switch (col) {
        case 'code': return esc(e.snapshot.code);
        case 'name': return esc(e.snapshot.name);
        case 'job': return esc(e.snapshot.job || '—');
        case 'costCenter': return esc(e.snapshot.costCenter || '—');
        case 'paymentMethod': return esc(e.snapshot.paymentMethod);
        case 'signature': return '';
        case 'gross': return money(e.result!.gross);
        case 'deductions': return money(e.result!.deductions);
        case 'net': return money(e.result!.net);
        default: {
          const k = col as AmountKey;
          if (e.result?.amounts[k] !== undefined) return money(e.result.amounts[k]);
          if (e.result?.customAmounts?.[col] !== undefined) return money(e.result.customAmounts[col]);
          return '—';
        }
      }
    };

    const totals: Record<string, number> = {};
    numCols.forEach(c => {
      if (cols.includes(c)) {
        if (c === 'gross') totals[c] = rows.reduce((s, e) => s + e.result!.gross, 0);
        else if (c === 'deductions') totals[c] = rows.reduce((s, e) => s + e.result!.deductions, 0);
        else if (c === 'net') totals[c] = rows.reduce((s, e) => s + e.result!.net, 0);
        else totals[c] = rows.reduce((s, e) => s + ((e.result?.amounts[c as AmountKey] !== undefined ? e.result.amounts[c as AmountKey] : e.result?.customAmounts?.[c]) || 0), 0);
      }
    });

    body = `
      <div class="register-wrap">
        ${docHeader('كشف صرف الرواتب')}
        <table class="reg-table">
          <thead>
            <tr>
              <th>#</th>
              ${cols.map(c => `<th class="${numCols.has(c) ? 'num' : ''}">${esc(colLabel[c] || c)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((e, i) => `
              <tr>
                <td>${i + 1}</td>
                ${cols.map(c => `<td class="${numCols.has(c) ? 'num' : ''} ${c === 'signature' ? 'signature' : ''}">${getCellVal(e, c)}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="2">الإجمالي — ${rows.length} موظف</td>
              ${cols.slice(1).map(c => `<td class="${numCols.has(c) ? 'num' : ''}">${totals[c] !== undefined ? money(totals[c]) : ''}</td>`).join('')}
            </tr>
          </tfoot>
        </table>
        ${docFooter()}
      </div>`;
  } else {
    // Slip per employee
    body = rows.map(e => `
      <div class="slip">
        ${docHeader('بيان راتب موظف')}
        <div class="month-badge">شهر ${monthAr}</div>
        <div class="emp-bar">
${show('name')?`          <div class="emp-cell">
            <div class="lbl">اسم الموظف</div>
            <div class="val lg">${esc(e.snapshot.name)}</div>
          </div>`:''}
${show('job')?`          <div class="emp-cell">
            <div class="lbl">الوظيفة</div>
            <div class="val">${esc(e.snapshot.job || '—')}</div>
          </div>`:''}
${show('costCenter')?`          <div class="emp-cell">
            <div class="lbl">مركز التكلفة</div>
            <div class="val">${esc(e.snapshot.costCenter || '—')}</div>
          </div>`:''}
          <div class="emp-cell">
            <div class="lbl">كود · طريقة الدفع</div>
            <div class="val">${show('code')?esc(e.snapshot.code):''} ${show('paymentMethod')?esc(e.snapshot.paymentMethod):''}</div>
          </div>
        </div>
        <div class="slip-tables">
          <table class="earn-table">
            <thead><tr><th>الاستحقاقات</th><th class="num">جنيه مصري</th></tr></thead>
            <tbody>${earningKeys.map(k => line(e, k)).join('')}
            ${Object.keys(e.result!.customAmounts || {}).filter(ck => formulas?.customFields?.find((f: any) => f.id === ck && f.type === 'earning')).map(ck => {
              const cf = formulas?.customFields?.find((f: any) => f.id === ck);
              const v = e.result!.customAmounts[ck];
              if (opts.hideZeros && v === 0) return '';
              return `<tr><td>${esc(cf?.name || ck)}</td><td class="num">${money(v)}</td></tr>`;
            }).join('')}</tbody>
            ${show('gross')?`<tfoot><tr><td>إجمالي الاستحقاقات</td><td class="num">${money(e.result!.gross)}</td></tr></tfoot>`:''}
          </table>
          <table class="ded-table">
            <thead><tr><th>الاستقطاعات</th><th class="num">جنيه مصري</th></tr></thead>
            <tbody>${deductionKeys.map(k => line(e, k)).join('')}
            ${Object.keys(e.result!.customAmounts || {}).filter(ck => formulas?.customFields?.find((f: any) => f.id === ck && f.type === 'deduction')).map(ck => {
              const cf = formulas?.customFields?.find((f: any) => f.id === ck);
              const v = e.result!.customAmounts[ck];
              if (opts.hideZeros && v === 0) return '';
              return `<tr><td>${esc(cf?.name || ck)}</td><td class="num">${money(v)}</td></tr>`;
            }).join('')}</tbody>
            ${show('deductions')?`<tfoot><tr><td>إجمالي الاستقطاعات</td><td class="num">${money(e.result!.deductions)}</td></tr></tfoot>`:''}
          </table>
        </div>
${show('net')?`        <div class="net-box">
          <div>
            <div class="label">صافي المرتب المستحق</div>
            <span class="currency">جنيه مصري</span>
          </div>
          <div class="amount">${money(e.result!.net)}</div>
        </div>`:''}
        ${show('note') && e.inputs.note ? `<div class="note">ملاحظات: ${esc(e.inputs.note)}</div>` : ''}
        ${show('signs')?'<div class="signatures"><span>توقيع الموظف: ................</span><span>المراجعة: ................</span></div>':''}
        ${opts.slipFields?'<small>الإجماليات تشمل جميع البنود حتى غير المعروضة.</small>':''}${docFooter(e.id)}
      </div>`).join('');
  }

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
  <title>${company} - رواتب ${p.month}</title>
  <style>${baseCSS}</style>
</head>
<body class="${opts.template === 'compact' ? 'compact' : ''}">${body}</body>
</html>`;
}

// ─── Professional Excel export ────────────────────────────────────────────────
type ReportChartBuffers = Partial<Record<'centers'|'payment'|'components',Buffer>>;

async function monthlyReportExcelBuffer(p:Period,opts:ExportOptions,logoPng?:Buffer,chartPngs:ReportChartBuffers={}) {
  const rows=selectedEntries(p,opts),data=monthlyReportData(p,rows),sections=new Set(opts.reportSections||DEFAULT_REPORT_SECTIONS);
  const cols=(opts.reportColumns?.length?opts.reportColumns:DEFAULT_REPORT_COLUMNS).filter((key,index,list)=>Object.hasOwn(REPORT_COLUMN_LABELS,key)&&list.indexOf(key)===index);
  const navyArgb=opts.monochrome?'FF475569':'FF1C2A38',secondaryArgb=opts.monochrome?'FF64748B':'FF2E4259',accentArgb=opts.monochrome?'FF64748B':'FFEC671B';
  const book=new ExcelJS.Workbook();book.creator='Kayan Payroll';book.created=new Date();
  const company=p.policy?.company||'كيان';
  const summary=book.addWorksheet('ملخص التقرير',{views:[{rightToLeft:true,state:'frozen',ySplit:3}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  summary.columns=Array.from({length:8},()=>({width:20}));
  summary.mergeCells(1,1,1,8);summary.getCell('A1').value=`${company} — التقرير الشهري ${p.month}`;
  summary.mergeCells(2,1,2,8);summary.getCell('A2').value=`${p.status==='approved'?'نسخة معتمدة':'مسودة غير معتمدة'} | ${rows.length} موظف | مرجع ${p.id.slice(0,8)} | جنيه مصري | إصدار ${new Date().toLocaleDateString('ar-EG')}`;
  for(const [row,color,size] of [[1,navyArgb,18],[2,secondaryArgb,10]] as const){summary.getRow(row).height=row===1?38:25;summary.getRow(row).eachCell(c=>{c.font={name:'Arial',size,bold:row===1,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};c.alignment={vertical:'middle',horizontal:'right'};});}
  if(logoPng){const id=book.addImage({buffer:logoPng as any,extension:'png'});summary.addImage(id,{tl:{col:6.6,row:0.15},ext:{width:110,height:52}});}
  if(sections.has('overview')){
    const cards=[['إجمالي الاستحقاقات',data.gross],['إجمالي الاستقطاعات',data.deductions],['صافي المستحق',data.net],['متوسط الصافي',data.averages.net],['الموظفون',data.counts.employees],['حالة الكشف',p.status==='approved'?'معتمد':'مسودة']];
    cards.forEach(([label,value],i)=>{const start=1+(i%3)*2,row=4+Math.floor(i/3)*2;summary.mergeCells(row,start,row,start+1);summary.mergeCells(row+1,start,row+1,start+1);const labelCell=summary.getCell(row,start),valueCell=summary.getCell(row+1,start);labelCell.value=label;valueCell.value=typeof value==='number'&&i<4?value/100:value;labelCell.font={name:'Arial',size:10,bold:true,color:{argb:'FF475569'}};valueCell.font={name:'Arial',size:14,bold:true,color:{argb:i===2?accentArgb:navyArgb}};labelCell.alignment=valueCell.alignment={horizontal:'center',vertical:'middle'};valueCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:opts.monochrome?'FFF1F5F9':'FFFFF5EB'}};valueCell.numFmt=typeof value==='number'&&i<4?'#,##0.00':'General';});
    summary.getRow(4).height=22;summary.getRow(5).height=30;summary.getRow(6).height=22;summary.getRow(7).height=30;
  }
  let row=sections.has('overview')?9:4;
  const title=(text:string)=>{summary.mergeCells(row,1,row,5);const c=summary.getCell(row,1);c.value=text;c.font={name:'Arial',size:12,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:navyArgb}};c.alignment={vertical:'middle',horizontal:'right'};summary.getRow(row).height=25;row++;};
  const table=(headers:string[],values:(string|number)[][])=>{summary.addRow(headers);summary.getRow(row).height=24;summary.getRow(row).eachCell(c=>{c.font={name:'Arial',size:9,bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:accentArgb}};c.alignment={horizontal:'right',vertical:'middle'};});row++;for(const valuesRow of values){const r=summary.addRow(valuesRow);r.eachCell(c=>{c.font={name:'Arial',size:9,color:{argb:navyArgb}};c.alignment={horizontal:'right',vertical:'middle'};if(typeof c.value==='number')c.numFmt='#,##0.00';});row++;}};
  if(sections.has('quality')){title('حالة المراجعة والصرف');table(['تمت المراجعة','بانتظار المراجعة','بيانات ناقصة','تم الصرف','لم يُصرف'],[[data.counts.reviewed,data.counts.pending,data.counts.incomplete,data.counts.paid,data.counts.unpaid]]);row++;}
  if(sections.has('centers')){title('ملخص مراكز التكلفة');table(['مركز التكلفة','عدد الموظفين','الاستحقاقات','الاستقطاعات','صافي المستحق'],data.centers.map(x=>[x.name,x.count,x.gross/100,x.deductions/100,x.net/100]));row++;title('ملخص الشركات');table(['الشركة','عدد الموظفين','الاستحقاقات','الاستقطاعات','صافي المستحق'],data.companies.map(x=>[x.name,x.count,x.gross/100,x.deductions/100,x.net/100]));row++;}
  if(sections.has('payment')){title('ملخص طرق الدفع');table(['طريقة الدفع','عدد الموظفين','الاستحقاقات','الاستقطاعات','صافي المستحق'],data.payment.map(x=>[x.name,x.count,x.gross/100,x.deductions/100,x.net/100]));row++;}
  if(sections.has('components')){title('ملخص بنود الرواتب');table(['البند','النوع','الإجمالي'],data.components.map(x=>[x.name,x.type,x.amount/100]));row++;}
  if(sections.has('daily')){title('ملخص الحركات اليومية');table(['نوع الحركة','الكمية المسجلة'],data.daily.map(x=>[x.name,x.quantity]));row++;}
  const chartList=[['centers',chartPngs.centers],['payment',chartPngs.payment],['components',chartPngs.components]].filter((x):x is [string,Buffer]=>!!x[1]);
  if(chartList.length){title('الرسوم البيانية');for(const [name,buffer] of chartList){const imageId=book.addImage({buffer:buffer as any,extension:'png'});summary.addImage(imageId,{tl:{col:0.2,row:row-0.35},ext:{width:640,height:Math.min(300,Math.max(150,rows.length*18))}});row+=Math.ceil(Math.min(300,Math.max(150,rows.length*18))/18)+2;} }
  summary.headerFooter.oddFooter=`&Rصفحة &P من &N&L${company} — ${p.month}`;
  if(sections.has('employees')){
    const details=book.addWorksheet('تفاصيل الموظفين',{views:[{rightToLeft:true,state:'frozen',ySplit:2}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
    details.mergeCells(1,1,1,cols.length);details.getCell(1,1).value=`${company} — تفاصيل الموظفين · ${p.month}`;
    details.addRow(cols.map(c=>REPORT_COLUMN_LABELS[c]));
    for(const e of rows){details.addRow(cols.map(c=>{
      if(c==='gross'||c==='deductions'||c==='net')return (e.result?.[c]||0)/100;
      if(c==='basic')return (e.result?.amounts.basic||0)/100;
      if(c==='checked')return e.checked&&!e.error&&!!e.result&&e.result.net>=0?'تمت المراجعة':'بانتظار المراجعة';
      if(c==='paid')return e.paid?'تم الصرف':'لم يُصرف';
      return String((e.snapshot as any)[c]||'—');
    }));}
    details.columns=cols.map(key=>({key,width:['name','employerCompany','department','costCenter'].includes(key)?24:16}));
    details.eachRow((r,n)=>{r.height=n===1?34:n===2?28:24;r.eachCell(c=>{c.font={name:'Arial',size:n===1?15:10,bold:n<=2,color:{argb:n<=2?'FFFFFFFF':navyArgb}};c.alignment={horizontal:'right',vertical:'middle',wrapText:true};if(n<=2)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:n===1?navyArgb:accentArgb}};if(n>2&&typeof c.value==='number')c.numFmt='#,##0.00';});});
    details.autoFilter={from:{row:2,column:1},to:{row:rows.length+2,column:cols.length}};
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function excelBuffer(p: Period, opts: ExportOptions, logoPng?: Buffer, reportChartPngs?:ReportChartBuffers) {
  if(opts.template==='monthly')return monthlyReportExcelBuffer(p,opts,logoPng,reportChartPngs);
  const rows = selectedEntries(p, opts);
  const book = new ExcelJS.Workbook();
  book.creator = 'Kayan Payroll';
  book.created = new Date();

  const company = p.policy?.company || 'كيان';
  const monthAr = new Date(`${p.month}-01T12:00:00`).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });

  // ── Sheet 1: Full detail ──────────────────────────────────────────────────
  const s = book.addWorksheet('رواتب الشهر', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 5, xSplit: 2 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const ALL_KEYS: AmountKey[] = [...earningKeys as AmountKey[], ...deductionKeys as AmountKey[]];
  const infoHeaders = ['م', 'الكود', 'الاسم', 'الوظيفة', 'مركز التكلفة', 'طريقة الدفع'];
  const moneyHeaders = ALL_KEYS.map(k => labels[k]);
  const summaryHeaders = ['إجمالي الاستحقاقات', 'إجمالي الاستقطاعات', 'صافي المرتب'];
  const custom=p.policy?.formulas.customFields||[];
  const heads = [...infoHeaders, ...moneyHeaders, ...custom.map(f=>`${f.name} (${f.type==='earning'?'+':'−'})`), ...summaryHeaders];
  const totalCols = heads.length;

  // Row 1 – Company title (merged, styled)
  s.mergeCells(1, 1, 1, totalCols);
  const r1 = s.getCell('A1');
  r1.value = `${company} — كشف رواتب شهر ${monthAr}`;
  r1.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.alignment = { vertical: 'middle', horizontal: 'center' };
  r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C2A38' } };
  s.getRow(1).height = 44;

  // Row 2 – subtitle
  s.mergeCells(2, 1, 2, totalCols);
  const r2 = s.getCell('A2');
  r2.value = `${p.view==='accrued'?`مستحق حتى ${p.asOf} — بيان مرحلي | `:''}${p.status === 'approved' ? '✓ معتمد' : '⚠ مسودة'} | ${rows.length} موظف | جميع المبالغ بالجنيه المصري | مرجع: ${p.id.slice(0, 8)} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}`;
  r2.font = { name: 'Arial', size: 11, color: { argb: 'FFFFEEDD' } };
  r2.alignment = { vertical: 'middle', horizontal: 'center' };
  r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4259' } };
  s.getRow(2).height = 28;

  // Row 3 – section labels
  s.mergeCells(3, infoHeaders.length + 1, 3, infoHeaders.length + earningKeys.length);
  s.getCell(3, infoHeaders.length + 1).value = 'الاستحقاقات';
  s.getCell(3, infoHeaders.length + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D52' } };
  s.getCell(3, infoHeaders.length + 1).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  s.getCell(3, infoHeaders.length + 1).alignment = { horizontal: 'center', vertical: 'middle' };

  const dedsStart = infoHeaders.length + earningKeys.length + 1;
  s.mergeCells(3, dedsStart, 3, dedsStart + deductionKeys.length - 1);
  s.getCell(3, dedsStart).value = 'الاستقطاعات';
  s.getCell(3, dedsStart).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9B3A2A' } };
  s.getCell(3, dedsStart).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  s.getCell(3, dedsStart).alignment = { horizontal: 'center', vertical: 'middle' };

  const summStart = dedsStart + deductionKeys.length + custom.length;
  s.mergeCells(3, summStart, 3, totalCols);
  s.getCell(3, summStart).value = 'الملخص';
  s.getCell(3, summStart).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEC671B' } };
  s.getCell(3, summStart).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  s.getCell(3, summStart).alignment = { horizontal: 'center', vertical: 'middle' };
  s.getRow(3).height = 24;

  // Row 4 – section headers for info columns
  for (let i = 1; i <= infoHeaders.length; i++) {
    const c = s.getCell(3, i);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C2A38' } };
  }
  s.mergeCells(3, 1, 4, 1);
  s.getCell(3, 1).value = 'م';
  s.getCell(3, 1).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  s.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 5 – column headers
  s.getRow(5).values = ['م', ...heads.slice(1)];
  s.getRow(5).height = 34;
  s.getRow(5).eachCell(c => {
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C2A38' } };
    c.border = { bottom: { style: 'medium', color: { argb: 'FFEC671B' } } };
  });

  // Data rows
  rows.forEach((e, idx) => {
    const dataRow = s.addRow([
      idx + 1,
      e.snapshot.code,
      e.snapshot.name,
      e.snapshot.job,
      e.snapshot.costCenter,
      e.snapshot.paymentMethod,
      ...ALL_KEYS.map(k => (e.result!.amounts[k]||0) / 100),
      ...custom.map(f=>(e.result!.customAmounts?.[f.id]||0)/100),
      e.result!.gross / 100,
      e.result!.deductions / 100,
      e.result!.net / 100,
    ]);
    dataRow.height = 26;
    dataRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF2A3A49' } };
      cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'right' };
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right', readingOrder: 'ltr' };
      }
      if (idx % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      // Color net negative
      if (colNum === totalCols && typeof cell.value === 'number' && cell.value < 0) {
        cell.font = { ...cell.font as any, color: { argb: 'FFCC3311' }, bold: true };
      }
    });
  });

  // Total row
  const totalRow = s.addRow([
    '', 'الإجمالي', '', '', '', '',
    ...ALL_KEYS.map(k => rows.reduce((s, e) => s + (e.result!.amounts[k]||0), 0) / 100),
    ...custom.map(f=>rows.reduce((s,e)=>s+(e.result!.customAmounts?.[f.id]||0),0)/100),
    rows.reduce((s, e) => s + e.result!.gross, 0) / 100,
    rows.reduce((s, e) => s + e.result!.deductions, 0) / 100,
    rows.reduce((s, e) => s + e.result!.net, 0) / 100,
  ]);
  totalRow.height = 32;
  totalRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1C2A38' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEDD' } };
    cell.border = { top: { style: 'medium', color: { argb: 'FFEC671B' } } };
    if (typeof cell.value === 'number') {
      cell.numFmt = '#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right', readingOrder: 'ltr' };
    }
  });

  // Column widths
  s.columns.forEach((col, i) => {
    if (i === 0) col.width = 5;
    else if (i === 1) col.width = 12;
    else if (i === 2) col.width = 28;
    else if (i === 3 || i === 4) col.width = 18;
    else if (i === 5) col.width = 12;
    else col.width = 14;
  });

  // Auto-filter
  s.autoFilter = { from: { row: 5, column: 1 }, to: { row: rows.length + 5, column: totalCols } };
  s.pageSetup.printTitlesRow = '5:5';
  s.headerFooter.oddHeader = `&C&B${company} — كشف رواتب ${p.month}`;
  s.headerFooter.oddFooter = `&Rصفحة &P من &N&L${new Date().toLocaleDateString('ar-EG')}`;

  // Logo
  if (logoPng) {
    const imgId = book.addImage({ buffer: logoPng as any, extension: 'png' });
    s.addImage(imgId, { tl: { col: totalCols - 3, row: 0 }, ext: { width: 100, height: 58 } });
  }

  // ── Sheet 2: Per-employee slips data ─────────────────────────────────────
  const slipSheet = book.addWorksheet('قسائم تفصيلية', {
    views: [{ rightToLeft: true }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
  });

  let slipRow = 1;
  rows.forEach((e, idx) => {
    if (idx > 0) { slipRow += 2; } // gap between employees

    // Employee title bar
    slipSheet.mergeCells(slipRow, 1, slipRow, 4);
    const titleCell = slipSheet.getCell(slipRow, 1);
    titleCell.value = `${e.snapshot.name} — ${e.snapshot.job || '—'} — ${e.snapshot.costCenter || '—'} — شهر ${monthAr}`;
    titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C2A38' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'right' };
    slipSheet.getRow(slipRow).height = 32;
    slipRow++;

    // Headers
    const hRow = slipSheet.getRow(slipRow);
    hRow.values = ['البيان', 'المبلغ (ج.م)', '', 'الملاحظة'];
    hRow.height = 24;
    hRow.eachCell(c => {
      c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4259' } };
      c.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    slipRow++;

    // Earnings
    const earnTitleRow = slipSheet.getRow(slipRow);
    slipSheet.mergeCells(slipRow, 1, slipRow, 4);
    earnTitleRow.getCell(1).value = '▼ الاستحقاقات';
    earnTitleRow.getCell(1).font = { name: 'Arial', bold: true, color: { argb: 'FF2E7D52' } };
    earnTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5EE' } };
    earnTitleRow.height = 20;
    slipRow++;

    earningKeys.forEach(k => {
      const amt = e.result!.amounts[k as AmountKey];
      if (opts.hideZeros && k !== 'basic' && amt === 0) return;
      const dr = slipSheet.getRow(slipRow);
      dr.values = [labels[k as AmountKey], amt / 100, '', e.result!.explanations[k as AmountKey] || ''];
      dr.getCell(2).numFmt = '#,##0.00';
      dr.getCell(2).alignment = { readingOrder: 'ltr' };
      dr.height = 22;
      slipRow++;
    });

    custom.filter(f=>f.type==='earning').forEach(f=>{const amount=e.result!.customAmounts?.[f.id]||0;if(opts.hideZeros&&!amount)return;const row=slipSheet.getRow(slipRow++);row.values=[f.name,amount/100,'',e.result!.explanations[f.id]||''];row.getCell(2).numFmt='#,##0.00';row.height=22;});
    // Gross subtotal
    const grossRow = slipSheet.getRow(slipRow);
    slipSheet.mergeCells(slipRow, 1, slipRow, 1);
    grossRow.values = ['إجمالي الاستحقاقات', e.result!.gross / 100];
    grossRow.getCell(2).numFmt = '#,##0.00';
    grossRow.height = 24;
    grossRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FF1C6B40' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5EE' } }; });
    slipRow++;

    // Deductions
    const dedTitleRow = slipSheet.getRow(slipRow);
    slipSheet.mergeCells(slipRow, 1, slipRow, 4);
    dedTitleRow.getCell(1).value = '▼ الاستقطاعات';
    dedTitleRow.getCell(1).font = { name: 'Arial', bold: true, color: { argb: 'FF9B3A2A' } };
    dedTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEE9' } };
    dedTitleRow.height = 20;
    slipRow++;

    deductionKeys.forEach(k => {
      const amt = e.result!.amounts[k as AmountKey];
      if (opts.hideZeros && amt === 0) return;
      const dr = slipSheet.getRow(slipRow);
      dr.values = [labels[k as AmountKey], amt / 100, '', e.result!.explanations[k as AmountKey] || ''];
      dr.getCell(2).numFmt = '#,##0.00';
      dr.getCell(2).alignment = { readingOrder: 'ltr' };
      dr.height = 22;
      slipRow++;
    });

    custom.filter(f=>f.type==='deduction').forEach(f=>{const amount=e.result!.customAmounts?.[f.id]||0;if(opts.hideZeros&&!amount)return;const row=slipSheet.getRow(slipRow++);row.values=[f.name,amount/100,'',e.result!.explanations[f.id]||''];row.getCell(2).numFmt='#,##0.00';row.height=22;});
    // Deductions subtotal
    const dedRow = slipSheet.getRow(slipRow);
    dedRow.values = ['إجمالي الاستقطاعات', e.result!.deductions / 100];
    dedRow.getCell(2).numFmt = '#,##0.00';
    dedRow.height = 24;
    dedRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FF9B3A2A' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEE9' } }; });
    slipRow++;

    // Net
    const netRow = slipSheet.getRow(slipRow);
    slipSheet.mergeCells(slipRow, 1, slipRow, 1);
    netRow.values = ['★ صافي المرتب', e.result!.net / 100];
    netRow.getCell(2).numFmt = '#,##0.00';
    netRow.height = 32;
    netRow.eachCell(c => {
      c.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEC671B' } };
      c.alignment = { vertical: 'middle' };
    });
    slipRow++;
  });

  slipSheet.columns = [
    { width: 28 }, { width: 16 }, { width: 4 }, { width: 35 }
  ];

  if(opts.registerColumns?.length){
    const cols=opts.registerColumns;const names:Record<string,string>={code:'الكود',name:'الاسم',job:'الوظيفة',costCenter:'مركز التكلفة',paymentMethod:'طريقة الدفع',...labels,gross:'إجمالي الاستحقاقات',deductions:'إجمالي الاستقطاعات',net:'الصافي',signature:'التوقيع',...Object.fromEntries(custom.map(f=>[f.id,f.name]))};
    if(cols.some(c=>!Object.hasOwn(names,c))||new Set(cols).size!==cols.length)throw new Error('أعمدة غير صالحة');
    const view=book.addWorksheet('كشف حسب الاختيار',{views:[{rightToLeft:true,state:'frozen',ySplit:2}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});view.mergeCells(1,1,1,cols.length);view.getCell(1,1).value=`${company} — ${p.month}${p.view==='accrued'?` حتى ${p.asOf}`:''}`;view.addRow(cols.map(c=>names[c]));
    for(const e of rows)view.addRow(cols.map(c=>c==='signature'?'':['gross','deductions','net'].includes(c)?e.result![c as 'net']/100:Object.hasOwn(e.result!.amounts,c)?e.result!.amounts[c as AmountKey]/100:Object.hasOwn(e.result!.customAmounts||{},c)?e.result!.customAmounts[c]/100:String(e.snapshot[c as keyof typeof e.snapshot]??'')));
    view.columns.forEach(c=>{c.width=22;c.numFmt='#,##0.00';});view.eachRow((r,n)=>{r.height=n===1?32:27;r.eachCell(c=>{c.font={name:'Arial',size:11,bold:n<=2,color:{argb:n<=2?'FFFFFFFF':'FF1C2A38'}};c.alignment={horizontal:'right',vertical:'middle',wrapText:true};if(n<=2)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1C2A38'}};});});view.autoFilter={from:{row:2,column:1},to:{row:rows.length+2,column:cols.length}};
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
