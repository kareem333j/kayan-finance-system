import ExcelJS from 'exceljs';
import type { Period, ExportOptions, Entry, Settings, RegisterColumn } from '../shared/types';
import { labels, earningKeys, deductionKeys, money, type AmountKey } from '../domain/payroll';

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function selectedEntries(p: Period, opts: ExportOptions): Entry[] {
  const ids = new Set(opts.entryIds);
  const rows = p.entries.filter(e => ids.has(e.id));
  if (!rows.length) throw new Error('اختر موظفًا واحدًا على الأقل');
  if (rows.some(e => !e.result)) throw new Error('أكمل البيانات المالية قبل التصدير');
  return rows;
}

// ─── Professional HTML export ────────────────────────────────────────────────
export function printHtml(p: Period, opts: ExportOptions, logo: string, font: string): string {
  const rows = selectedEntries(p, opts);
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
    ${opts.template === 'compact' ? 'body { font-size: 13px; } .emp-cell { padding: 10px 12px; } .slip-tables { gap: 12px; margin-bottom: 12px; } table th, table td { padding: 8px 10px; font-size: 13px; } .net-box { padding: 12px 16px; margin-bottom: 12px; } .net-box .amount { font-size: 24px; }' : ''}
  
    body{width:${opts.template==='register'?(opts.paper==='A4'?'267mm':'180mm'):(opts.paper==='A4'?'180mm':'118mm')};line-height:1.6}
    ${opts.paper==='A5'?'.slip{line-height:1.35}.slip-tables{gap:8px;margin-bottom:10px}.slip table th,.slip table td,.slip tbody td.num,.slip tfoot td{font-size:10px;padding:5px 6px}.slip .note-cell{font-size:8px;margin-top:2px}.slip .emp-cell{padding:6px}.slip .emp-cell .val,.slip .emp-cell .val.lg{font-size:11px}.slip .emp-cell .lbl{font-size:8px;margin-bottom:2px}.slip .doc-header .sub small{font-size:9px}.slip .status-badge{font-size:9px;padding:4px 6px}.slip .net-box{padding:8px 12px;margin-bottom:8px}.slip .net-box .label{font-size:13px}.slip .net-box .amount{font-size:21px}.slip .note{font-size:9px;padding:6px;margin:6px 0}.slip .doc-footer{font-size:8px;padding-top:5px}':''}
    .compact{line-height:1.4}.compact tbody td.num{font-size:11px}.compact .emp-cell .lbl{font-size:8px;margin-bottom:2px}.compact .slip>*{flex-shrink:0}.compact .signatures{font-size:9px;margin:4px 0}
    .signatures{display:flex;justify-content:space-between;margin:10px 0;font-size:11px}.register-wrap{min-height:0}.reg-table{table-layout:fixed}.reg-table th,.reg-table td{overflow-wrap:anywhere;font-size:10px;padding:7px 4px}.reg-table td.num{font-size:10px;white-space:normal}
    .cutoff-banner{padding:7px 10px;background:#fff0e4;margin-bottom:10px;font-size:12px;font-weight:700}
    .slip{min-height:0;break-inside:avoid}
    ${opts.paper==='A5'?'.slip{font-size:11px}.doc-header{margin-bottom:12px;padding-bottom:8px}.doc-header img{height:42px}.emp-bar{margin-bottom:10px}.doc-header .sub{font-size:14px}':''}
    .compact .slip{height:132mm;min-height:0;padding:0 0 3mm;margin:0;break-inside:avoid;font-size:10px}
    .compact .slip:nth-child(2n+1){margin-bottom:3mm}
    .compact .doc-header{padding-bottom:5px;margin-bottom:7px;gap:8px}
    .compact .doc-header img{height:35px}.compact .doc-header .sub{font-size:13px}.compact .doc-header .sub small{font-size:9px}.compact .status-badge{font-size:9px;padding:3px 8px}
    .compact .emp-bar{margin-bottom:8px}.compact .emp-cell{padding:4px 7px}.compact .emp-cell .val,.compact .emp-cell .val.lg{font-size:11px}.compact .emp-cell .key{font-size:9px}.compact .net-box{padding:5px 10px;margin-bottom:6px}.compact .net-box .amount{font-size:19px}.compact .net-box .label{font-size:12px}.compact .note-cell{font-size:8px;margin-top:1px}.compact .doc-footer{font-size:8px;padding-top:5px}.compact .note{font-size:9px;margin:5px 0;padding:5px}.compact .month-badge{font-size:10px;margin-bottom:5px}.compact .slip-tables{margin-bottom:6px}.compact tfoot td{font-size:11px;padding:4px 6px}.compact th,.compact td{padding:3px 6px;font-size:10px}
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
      basic: 'الأساسي', assignment: 'التكليف', incentive: 'حافز',
      living: 'إعاشة', transport: 'مواصلات', other: 'أخرى',
      advance: 'السلف', absence: 'خصم الغياب', delay: 'خصم التأخير',
      fellowship: 'صندوق الزمالة', penalties: 'جزاءات',dailyDeduction:'خصومات يومية',
      gross: 'إجمالي الاستحقاقات', deductions: 'إجمالي الاستقطاعات',
      net: 'صافي المرتب', signature: 'التوقيع'
    };
    if (formulas?.customFields) {
      for (const f of formulas.customFields) {
        colLabel[f.id] = f.name;
      }
    }

    if(cols.some(c=>!Object.hasOwn(colLabel,c))||new Set(cols).size!==cols.length)throw new Error('أعمدة التصدير غير صالحة أو مكررة');
    const numCols = new Set(['basic', 'assignment', 'incentive', 'living', 'transport', 'other', 'advance', 'absence', 'delay', 'fellowship', 'penalties', 'dailyDeduction', 'gross', 'deductions', 'net', ...(formulas?.customFields?.map((f: any)=>f.id) || [])]);

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
export async function excelBuffer(p: Period, opts: ExportOptions, logoPng?: Buffer) {
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
