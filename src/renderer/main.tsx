import {employeeCompanies,dailyLabels} from '../shared/types';

import type {CloudStatus} from '../shared/cloud';
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/700.css';
import './style.css';
import FormulasForm from './FormulaStudio';
import DailyPanel from './DailyPanel';
import {EmployeeExtraFields,EmployeeHistory} from './EmployeeDetails';
import {todayLocal,defaultCutoff,accrualDays,monthEnd} from '../domain/dates';
import AdminPanel,{PasswordPanel} from './AdminPanel';
import BulkEditor from './BulkEditor';
import logo from '../../assets/brand/logo.svg';
import icon from '../../assets/brand/icon.png';
import pkg from '../../package.json';
import { calculate, emptyInputs, money, labels, earningKeys, deductionKeys, type Inputs } from '../domain/payroll';
import type { Employee, Period, Entry, State, ImportPreview, ExportOptions, FormulaSettings, RegisterColumn, MonthlyReportSection, MonthlyReportColumn } from '../shared/types';

const api = window.payroll;

const navItems = [
  ['admin', 'إدارة النظام', 'lock'],
  ['dashboard', 'نظرة عامة', 'dashboard'],
  ['daily', 'المتابعة اليومية', 'clock'],
  ['payroll', 'رواتب الشهر', 'wallet'],
  ['employees', 'الموظفون', 'users'],
  ['reports', 'التقارير', 'chart'],
  ['settings', 'الإعدادات والنسخ', 'settings'],
  ['formulas', 'المعادلات', 'formula'],
] as const;

// ── Icons ──────────────────────────────────────────────────────────────────────
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V5a2 2 0 0 1 2-2h12M21 11h-6v5h6"/></>,
    chart: <><path d="M3 3v18h18M7 16v-4M12 16V7M17 16v-7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1v4l-2 1 2 2v3l3 1 1 3h5l1-3 3-1v-3l3-2-3-1V7l-3-1-1-3Z"/></>,
    formula: <><path d="M3 5h18M3 12h9M3 19h18M15 9l3 3-3 3"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="m14 5-7 7 7 7M7 12h14"/>,
    print: <><path d="M7 8V3h10v5M7 17H3V9h18v8h-4M7 14h10v7H7z"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sliders: <><path d="M4 6h16M8 12h8M11 18h2"/><circle cx="7" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></>,
    columns: <><path d="M3 3h8v18H3zM13 3h8v18h-8"/></>,
    export: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></>,
    refresh: <><path d="M21 12a9 9 0 1 1-2-6.5l-3 3M21 3v6h-6"/></>,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.dashboard}
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const monthName = (s: string) => new Date(`${s}-01T12:00:00`).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
const norm = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').trim().toLowerCase();

// ── UI Components ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false, eyebrow = 'كيان / إدارة الرواتب' }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; eyebrow?: string }) {
  return (
    <div className="overlay" role="presentation">
      <section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
          <button className="icon-btn" aria-label="إغلاق" onClick={onClose}><Icon name="close"/></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Stat({ title, value, subtitle, icon, warm = false }: { title: string; value: string; subtitle: string; icon: string; warm?: boolean }) {
  return (
    <section className={`stat ${warm ? 'warm' : ''}`}>
      <div className="stat-top"><span>{title}</span><div><Icon name={icon}/></div></div>
      <strong>{value}</strong><small>{subtitle}</small>
    </section>
  );
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return <span className={`badge ${ok ? 'ok' : 'waiting'}`}><i/>{text}</span>;
}

function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div><Icon name="wallet" size={32}/></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Toolbar({ search, setSearch, center, setCenter, centers, count, extraFilters }: {
  search: string; setSearch: (s: string) => void;
  center: string; setCenter: (s: string) => void;
  centers: string[]; count: number;
  extraFilters?: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="toolbar-wrap sticky-toolbar">
      <div className="toolbar">
        <div className="search">
          <Icon name="search"/>
          <input aria-label="بحث" placeholder="ابحث بالاسم أو الكود أو الوظيفة أو الإدارة…" value={search} onChange={e => setSearch(e.target.value)}/>
          {search && <button className="search-clear" onClick={() => setSearch("")}>×</button>}
        </div>
        <select aria-label="مركز التكلفة" value={center} onChange={e => setCenter(e.target.value)}>
          <option value="">كل مراكز التكلفة</option>
          {[...new Set(centers)].filter(Boolean).sort().map(cc => <option key={cc}>{cc}</option>)}
        </select>
        <button className={"filter-toggle " + (expanded ? "active" : "")} onClick={() => setExpanded(x => !x)} title="فلاتر متقدمة"><Icon name="sliders" size={15}/>{expanded ? "إخفاء الفلاتر" : "فلاتر متقدمة"}</button>
        <span className="toolbar-count">{count} سجل</span>
      </div>
      {expanded && <div className="advanced-filters">{extraFilters}<div className="filter-hint">كل فلتر يُطبّق فورًا مع نص البحث، ويمكن جمع أكثر من شرط.</div></div>}
    </div>
  );
}

const employeeFields = [['code','الكود'],['name','الاسم الكامل'],['employerCompany','الشركة التابع لها الموظف'],['job','الوظيفة'],['costCenter','مركز التكلفة'],['department','الإدارة'],['startDate','تاريخ التعيين'],['endDate','تاريخ انتهاء العمل'],['contractType','نوع التعاقد'],['contractEnd','انتهاء العقد'],['birthDate','تاريخ الميلاد'],['gender','النوع'],['maritalStatus','الحالة الاجتماعية'],['nationality','الجنسية'],['nationalId','الرقم القومي'],['phone','الهاتف'],['email','البريد الإلكتروني'],['address','العنوان'],['emergencyName','جهة اتصال الطوارئ'],['emergencyPhone','هاتف الطوارئ'],['qualification','المؤهل'],['graduation','دفعة التخرج'],['insuranceNumber','الرقم التأميني'],['paymentMethod','طريقة الدفع'],['bankName','البنك'],['accountNumber','رقم الحساب'],['accountHolder','صاحب الحساب'],['walletNumber','رقم المحفظة'],['instapayAddress','عنوان إنستا باي'],['bankNote','ملاحظات البنك'],['notes','الملاحظات']];

function EmployeeExportModal({ employees, onClose, onExport, busy }: { employees: Employee[], onClose: () => void, onExport: (format: string, fields: string[], includeSalary: boolean) => void, busy: boolean }) {
  const [fields, setFields] = useState<string[]>(employeeFields.map(f => f[0]));
  const [includeSalary, setIncludeSalary] = useState(true);
  
  const toggle = (k: string) => setFields(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k]);
  
  return (
    <Modal title={`إعدادات الطباعة والتصدير (${employees.length === 1 ? employees[0].name : employees.length + ' موظفين'})`} onClose={onClose} wide>
      <div className="modal-body">
        <p style={{marginBottom: 16}}>اختر البيانات التي ترغب في ظهورها في الملف المصدر أو المطبوع:</p>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px', marginBottom: 20}}>
          {employeeFields.map(([k, lbl]) => (
            <label key={k} style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 4}}>
              <input type="checkbox" checked={fields.includes(k)} onChange={() => toggle(k)} />
              {lbl}
            </label>
          ))}
        </div>
        <hr style={{margin: '16px 0', borderColor: '#e2e8f0'}} />
        <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 'bold'}}>
          <input type="checkbox" checked={includeSalary} onChange={e => setIncludeSalary(e.target.checked)} />
          تضمين الراتب الأساسي الشهري المرجعي
        </label>
      </div>
      <div className="modal-foot">
        <div className="actions" style={{width: '100%', justifyContent: 'flex-start', gap: 12}}>
          <button className="primary" disabled={busy || !fields.length} onClick={() => onExport('print', fields, includeSalary)}>🖨️ معاينة وطباعة</button>
          <button className="secondary" disabled={busy || !fields.length} onClick={() => onExport('pdf', fields, includeSalary)}>تصدير كـ PDF</button>
          <button className="secondary" disabled={busy || !fields.length} onClick={() => onExport('excel', fields, includeSalary)}>تصدير كـ Excel</button>
          <div style={{flex: 1}}></div>
          <button className="secondary" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Formula Settings Screen ────────────────────────────────────────────────────
// ── Employee Form ──────────────────────────────────────────────────────────────
function EmployeeForm({ employee, busy, onClose, save, remove, onExport }: {
  employee: Partial<Employee>; busy: boolean;
  onClose: () => void; save: (v: any) => void; remove: () => void;
  onExport: (employee: Partial<Employee>) => void;
}) {
  const [v, setV] = useState(employee);
  const field = (k: keyof Employee, label: string, type = 'text') => (
    <Field key={k} label={label}>
      <input type={type} value={String(v[k] ?? '')} onChange={e => setV({ ...v, [k]: e.target.value })} required={['name', 'code'].includes(k)}/>
    </Field>
  );
  return (
    <Modal title={v.id ? 'ملف الموظف' : 'إضافة موظف جديد'} onClose={onClose} wide>
      <form onSubmit={e => { e.preventDefault(); save(v); }}>
        <div className="modal-body">
          <div className="form-grid three-cols">
            {field('name', 'الاسم الكامل')}
            {field('code', 'كود الموظف')}
            <Field label="الشركة التابع لها الموظف">
              <select required value={v.employerCompany||''} onChange={e=>setV({...v,employerCompany:e.target.value as Employee['employerCompany']})}>
                <option value="" disabled>اختر الشركة</option>
                {employeeCompanies.map(company=><option key={company} value={company}>{company}</option>)}
              </select>
            </Field>
            {field('job', 'الوظيفة')}
            {field('costCenter', 'مركز التكلفة / المشروع')}
            {field('basic', 'الراتب الأساسي — جنيه')}
            {field('startDate', 'تاريخ بداية العمل', 'date')}
            {field('endDate', 'تاريخ انتهاء العمل', 'date')}
            <Field label="طريقة الدفع">
              <select value={v.paymentMethod} onChange={e => setV({ ...v, paymentMethod: e.target.value })}>
                <option>نقدي</option><option>بنكي</option><option>فودافون كاش</option><option>إنستا باي</option><option>غير محدد</option>
              </select>
            </Field>
            <Field label="حالة الموظف">
              <select value={v.active ? 'active' : 'inactive'} onChange={e => setV({ ...v, active: e.target.value === 'active' })}>
                <option value="active">نشط</option><option value="inactive">متوقف</option>
              </select>
            </Field>
            {field('bankNote', 'بيانات البنك / رقم الكارت')}
            {field('graduation', 'دفعة التخرج / المؤهل')}
            {field('phone', 'رقم الهاتف')}
            {field('nationalId', 'الرقم القومي')}
            {field('address', 'العنوان')}
          </div>
          <EmployeeExtraFields value={v} onChange={setV}/>{v.id&&<EmployeeHistory id={v.id}/>}
          <Field label="ملاحظات">
            <textarea value={v.notes || ''} onChange={e => setV({ ...v, notes: e.target.value })}/>
          </Field>
          <small className="muted">الأساسي هنا يستخدم للكشوف الجديدة. الموظف الجديد يُضاف تلقائيًا إلى كشوف المسودات المؤهلة. الاستحقاق الجزئي يحسب حسب تاريخ التعيين والانتهاء.</small>
        </div>
        <div className="modal-foot">
          <div style={{display: 'flex', gap: 12}}>
            {v.id && <button type="button" className="danger" onClick={remove}>حذف الموظف وحفظ تاريخه</button>}
            {v.id && <button type="button" className="secondary" onClick={() => onExport(v)}>🖨️ طباعة أو تصدير</button>}
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={onClose}>إلغاء</button>
            <button className="primary" disabled={busy}>حفظ بيانات الموظف</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── Entry Form ─────────────────────────────────────────────────────────────────
function EntryForm({ entry, period, busy, close, save }: {
  entry: Entry; period: Period; busy: boolean;
  close: () => void; save: (v: any) => void;
}) {
  const [v, setV] = useState<Inputs>(entry.effectiveInputs||entry.inputs);
  const [checked, setChecked] = useState(entry.checked);
  const [effectiveDate,setEffectiveDate]=useState(`${period.month}-01`);
  const locked = period.status === 'approved';
  const penaltiesEnabled = !!period.policy?.penaltiesEnabled;
  const snapshotStart=entry.snapshot.startDate.startsWith(period.month)?entry.snapshot.startDate:'';
  const payrollStart=v.accrualStartDate||snapshotStart;
  let result = entry.result, error = '';
  try { if (!locked) result = calculate(v, period.policy!.formulas, penaltiesEnabled,{daily:entry.daily,accrualDays:accrualDays(period.month,monthEnd(period.month),payrollStart,entry.snapshot.endDate,period.policy!.formulas.daysInMonth)}); } catch (e: any) { result = null; error = e.message; }
  const update = (k: keyof Inputs, value: string) => { setV({ ...v, [k]: value }); setChecked(false); };
  const f = (key: keyof Inputs, label: string, hint?: string) => (
    <Field key={key} label={label} hint={hint}>
      <input disabled={locked} inputMode={key==='delayQuantity'||key==='penaltyQuantity'?'text':'decimal'} placeholder={key==='delayQuantity'||key==='penaltyQuantity'?'2:45 أو 2.75':''} value={String(v[key]??'')} onChange={e => update(key, e.target.value)} className="number-input"/>
    </Field>
  );
  const partial = entry.snapshot.startDate.startsWith(period.month) || entry.snapshot.endDate.startsWith(period.month);

  return (
    <Modal title={`راتب ${entry.snapshot.name}`} onClose={close} wide>
      <div className="entry-meta">
        <span>{entry.snapshot.code}</span>
        <span>{entry.snapshot.job}</span>
        <span>{entry.snapshot.costCenter || 'مشروع غير محدد'}</span>
        <b>{monthName(period.month)}</b>
      </div>
      <div className="modal-body entry-layout">
        <div>
          {partial && <div className="alert">تعيين أو انتهاء خلال هذا الشهر. أدخل الأساسي الشهري الكامل؛ يحسب الاستحقاق الجزئي تلقائيًا من تواريخ العمل.</div>}
          <h3 className="section-title">الاستحقاقات</h3>
          <div className="form-grid three-cols">
            {f('basic', 'الراتب الأساسي')}
            <Field label="بداية الاستحقاق في هذا الكشف" hint="اتركها كما هي لاستخدام لقطة ملف الموظف. تعديلها يؤثر على هذا الشهر فقط.">
              <input type="date" min={`${period.month}-01`} max={monthEnd(period.month)} disabled={locked} value={payrollStart} onChange={e=>update('accrualStartDate',e.target.value)}/>
            </Field>
            <Field label="طريقة حساب التكليف">
              <select disabled={locked} value={v.assignmentMode} onChange={e => update('assignmentMode', e.target.value)}>
                <option value="amount">مبلغ مباشر</option><option value="days">عدد أيام</option>
              </select>
            </Field>
            {v.assignmentMode === 'amount' ? f('assignmentAmount', 'مبلغ التكليف') : f('assignmentDays', 'أيام التكليف', `عدد الأيام × الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            {f('overtimeDays', 'أيام عمل إضافية', `اليوم بنفس أجر اليوم العادي: الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            {f('incentive', 'الحافز')}
            {f('livingDays', 'أيام الإعاشة', `اليوم = ${period.policy?.formulas?.livingDayRate ?? 75} جنيهاً`)}
            {f('transport', 'المواصلات')}
            {f('other', 'استحقاقات أخرى')}
          </div>
          <h3 className="section-title">الاستقطاعات</h3>
          <div className="form-grid three-cols">
            {f('advance', 'السلف المخصومة هذا الشهر', 'مبلغ الخصم من المالية')}
            {f('absenceDays', 'أيام الغياب الإضافية غير المسجلة يوميًا', `عدد الأيام × الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            {f('doubleAbsenceDays', 'غياب بخصم يومين', `كل يوم غياب × 2 × الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            <Field label="وحدة التأخير">
              <select disabled={locked} value={v.delayUnit} onChange={e => update('delayUnit', e.target.value)}>
                <option value="hours">ساعات</option><option value="days">أيام</option>
              </select>
            </Field>
            {f('delayQuantity', v.delayUnit === 'hours' ? 'عدد ساعات التأخير' : 'عدد أيام التأخير', v.delayUnit==='hours'?`يمكن إدخال 2:45 أو 2.75. الساعة = أجر اليوم ÷ ${period.policy?.formulas?.workingHours??8}`:`الكمية × الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            {penaltiesEnabled&&<>
              <Field label="وحدة الجزاء"><select disabled={locked} value={v.penaltyUnit} onChange={e=>update('penaltyUnit',e.target.value)}><option value="hours">ساعات</option><option value="days">أيام</option></select></Field>
              {f('penaltyQuantity',v.penaltyUnit==='hours'?'جزاء بالساعات':'جزاء بالأيام',v.penaltyUnit==='hours'?`الساعة = أجر اليوم ÷ ${period.policy?.formulas?.workingHours??8}`:`اليوم × الأساسي ÷ ${period.policy?.formulas?.daysInMonth??30}`)}
              {f('penalties', 'جزاءات بمبلغ', 'اكتب السبب في الملاحظات')}
            </>}
          </div>
          <div className="alert">الحركات اليومية تُضاف تلقائيًا. المسجل: {entry.daily?.absence||0} يوم غياب عادي، {entry.daily?.doubleAbsence||0} يوم بخصم يومين، {entry.daily?.delay||0} ساعة تأخير، {entry.daily?.deduction||0} جنيه خصم مباشر. أدخل هنا الإضافات الشهرية فقط حتى لا تتكرر الخصومات.</div><Field label="تاريخ سريان القيم المعدلة"><input type="date" min={`${period.month}-01`} max={monthEnd(period.month)} disabled={locked} value={effectiveDate} onChange={e=>{const date=e.target.value;setEffectiveDate(date);setChecked(false);if(date)api.call('period.get',{id:period.id,asOf:date}).then((p:Period)=>{const row=p.entries.find(x=>x.id===entry.id);if(row)setV(row.effectiveInputs||row.inputs);});}}/></Field>{period.policy?.formulas.customFields.filter(f=>f.mode==='manual').map(f=><Field key={f.id} label={f.name}><input disabled={locked} value={v.customValues?.[f.id]||'0'} onChange={e=>{setV({...v,customValues:{...v.customValues,[f.id]:e.target.value}});setChecked(false);}}/></Field>)}
          <Field label="ملاحظات الشهر / سبب الجزاءات">
            <textarea disabled={locked} value={v.note} onChange={e => update('note', e.target.value)}/>
          </Field>
          {!locked && (
            <label className="review-checkbox">
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>
              <span>راجعت الأساسي والمتغيرات والسلف وأهلية الموظف، وجميع الأصفار تعني عدم وجود مبالغ.</span>
            </label>
          )}
        </div>
        <aside className="calculation-panel">
          <span className="eyebrow">الحساب الفوري</span>
          <h3>تفصيل المستحق</h3>
          {error ? <div className="alert error">{error}</div> : result && <>
            {[...earningKeys, ...deductionKeys].filter(k => result!.amounts[k] !== 0).map(k => (
              <div className="calc-line" key={k}>
                <div>
                  <span>{labels[k]}</span>
                  {result!.explanations[k] && <small>{result!.explanations[k]}</small>}
                </div>
                <b className={deductionKeys.includes(k) ? 'deduct' : ''}>{deductionKeys.includes(k) ? '− ' : ''}{money(result!.amounts[k])}</b>
              </div>
            ))}
            {Object.keys(result!.customAmounts || {}).filter(k => result!.customAmounts[k] !== 0).map(k => {
              const field = period.policy?.formulas?.customFields?.find((f: any) => f.id === k);
              const isDeduct = field?.type === 'deduction';
              return (
                <div className="calc-line" key={k}>
                  <div>
                    <span>{field?.name || k}</span>
                    {result!.explanations[k] && <small>{result!.explanations[k]}</small>}
                  </div>
                  <b className={isDeduct ? 'deduct' : ''}>{isDeduct ? '− ' : ''}{money(result!.customAmounts[k])}</b>
                </div>
              );
            })}
            <div className="calc-totals">
              <span>إجمالي الاستحقاقات <b>{money(result.gross)}</b></span>
              <span>إجمالي الاستقطاعات <b>{money(result.deductions)}</b></span>
            </div>
            <div className="calc-net">
              <small>صافي المستحق</small>
              <strong>{money(result.net)}</strong>
              <span>جنيه مصري</span>
            </div>
            {result.net < 0 && <div className="alert error">الصافي سالب. يجب معالجته قبل الاعتماد.</div>}
          </>}
          <p className="muted">يُقرب كل بند إلى قرشين، ثم تُجمع البنود.</p>
        </aside>
      </div>
      <div className="modal-foot">
        <span className="muted">{locked ? 'نسخة معتمدة محفوظة' : 'التغييرات لا تُحفظ إلا بعد الضغط على حفظ'}</span>
        <div className="actions">
          <button className="secondary" onClick={close}>{locked ? 'إغلاق' : 'إلغاء'}</button>
          {!locked && <button className="primary" disabled={busy || !!error} onClick={() => save({ periodId: period.id, id: entry.id, version: entry.version, inputs: v, checked, effectiveDate })}>حفظ راتب الموظف</button>}
        </div>
      </div>
    </Modal>
  );
}

// ── Settings Form ──────────────────────────────────────────────────────────────
function SettingsForm({ initial, busy, save }: { initial: State['settings']; busy: boolean; save: (v: State['settings']) => void }) {
  const [v, setV] = useState(initial);
  return (
    <section className="card settings-card">
      <h3>بيانات الشركة وقواعد الحساب</h3>
      <Field label="اسم الشركة في القسائم">
        <input value={v.company} onChange={e => setV({ ...v, company: e.target.value })}/>
      </Field>
      <div className="fixed-rules">
        <div><span>أجر اليوم</span><b>الأساسي ÷ 30</b></div>
        <div><span>الإعاشة</span><b>{v.formulas?.livingDayRate ?? 75} جنيهاً / يوم</b></div>
        <div><span>التأخير بالساعات</span><b>الساعات × الأساسي ÷ مقام الشهر ÷ ساعات العمل</b></div>
        <div><span>صندوق الزمالة</span><b>{((v.formulas?.fellowshipRate ?? 0.01) * 100).toFixed(1)}%، بحد أدنى {v.formulas?.fellowshipMin ?? 50}</b></div>
      </div>
      <label className="review-checkbox">
        <input type="checkbox" checked={v.roundingAccepted} onChange={e => setV({ ...v, roundingAccepted: e.target.checked })}/>
        <span>اعتماد تقريب كل بند إلى قرشين بطريقة النصف لأعلى، ثم جمع البنود المعروضة.</span>
      </label>
      <label className="review-checkbox">
        <input type="checkbox" checked={v.penaltiesEnabled} onChange={e => setV({ ...v, penaltiesEnabled: e.target.checked })}/>
        <span>تفعيل الجزاءات المالية والزمنية مع سبب إلزامي.</span>
      </label>
      <button className="primary" disabled={busy} onClick={() => save(v)}>حفظ الإعدادات</button>
    </section>
  );
}

// ── Export Modal ───────────────────────────────────────────────────────────────
const ALL_REGISTER_COLS: { key: RegisterColumn; label: string; group: string }[] = [
  { key: 'code', label: 'الكود', group: 'بيانات الموظف' },
  { key: 'name', label: 'الاسم', group: 'بيانات الموظف' },
  { key: 'job', label: 'الوظيفة', group: 'بيانات الموظف' },
  { key: 'costCenter', label: 'مركز التكلفة', group: 'بيانات الموظف' },
  { key: 'paymentMethod', label: 'طريقة الدفع', group: 'بيانات الموظف' },
  { key: 'basic', label: 'الأساسي', group: 'الاستحقاقات' },
  { key: 'assignment', label: 'أوامر التكليف', group: 'الاستحقاقات' },
  { key: 'overtime', label: 'أيام عمل إضافية', group: 'الاستحقاقات' },
  { key: 'incentive', label: 'حافز', group: 'الاستحقاقات' },
  { key: 'living', label: 'إعاشة', group: 'الاستحقاقات' },
  { key: 'transport', label: 'مواصلات', group: 'الاستحقاقات' },
  { key: 'other', label: 'أخرى', group: 'الاستحقاقات' },
  { key: 'advance', label: 'السلف', group: 'الاستقطاعات' },
  { key: 'absence', label: 'خصم الغياب', group: 'الاستقطاعات' },
  { key: 'doubleAbsence', label: 'غياب بخصم يومين', group: 'الاستقطاعات' },
  { key: 'delay', label: 'خصم التأخير', group: 'الاستقطاعات' },
  { key: 'fellowship', label: 'صندوق الزمالة', group: 'الاستقطاعات' },
  { key: 'penalties', label: 'جزاءات بمبلغ', group: 'الاستقطاعات' },
  { key: 'timePenalty', label: 'جزاءات بالساعات/الأيام', group: 'الاستقطاعات' },
  {key:'dailyDeduction',label:'خصومات يومية بمبلغ',group:'الاستقطاعات'},
  { key: 'gross', label: 'إجمالي الاستحقاقات', group: 'الملخص' },
  { key: 'deductions', label: 'إجمالي الاستقطاعات', group: 'الملخص' },
  { key: 'net', label: 'صافي المرتب', group: 'الملخص' },
  { key: 'signature', label: 'خانة التوقيع', group: 'الملخص' },
];

const DEFAULT_REGISTER_COLS: RegisterColumn[] = ['code', 'name', 'costCenter', 'basic', 'gross', 'deductions', 'net', 'signature'];

const ALL_SLIP_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'اسم الموظف' }, { key: 'job', label: 'الوظيفة' },
  { key: 'costCenter', label: 'مركز التكلفة' }, { key: 'code', label: 'الكود' },
  { key: 'paymentMethod', label: 'طريقة الدفع' },
  ...earningKeys.map(k => ({ key: k, label: labels[k] })),
  ...deductionKeys.map(k => ({ key: k, label: labels[k] })),
  { key: 'gross', label: 'إجمالي الاستحقاقات' }, { key: 'deductions', label: 'إجمالي الاستقطاعات' },
  { key: 'net', label: 'الصافي' }, { key: 'note', label: 'الملاحظات' },
  { key: 'signs', label: 'خانات التوقيع' },
];

const MONTHLY_REPORT_SECTIONS: {key:MonthlyReportSection;label:string}[]=[
  {key:'overview',label:'الملخص والمؤشرات المالية'},{key:'quality',label:'حالة المراجعة والصرف'},
  {key:'centers',label:'توزيع مراكز التكلفة'},{key:'payment',label:'طرق الدفع'},
  {key:'components',label:'تفصيل بنود الرواتب'},{key:'daily',label:'الحركات اليومية'},
  {key:'employees',label:'تفاصيل الموظفين'}
];
const MONTHLY_REPORT_COLUMNS:{key:MonthlyReportColumn;label:string}[]=[
  {key:'code',label:'الكود'},{key:'name',label:'الاسم'},{key:'employerCompany',label:'الشركة'},
  {key:'job',label:'الوظيفة'},{key:'department',label:'الإدارة'},{key:'costCenter',label:'مركز التكلفة'},
  {key:'paymentMethod',label:'طريقة الدفع'},{key:'basic',label:'الأساسي'},
  {key:'gross',label:'الاستحقاقات'},{key:'deductions',label:'الاستقطاعات'},
  {key:'net',label:'الصافي'},{key:'checked',label:'المراجعة'},{key:'paid',label:'الصرف'}
];

function ExportModal({ period, ids, busy, close, perform, defaultTemplate }: {
  period: Period; ids: string[]; busy: boolean;
  close: () => void;
  perform: (method: string, opts: ExportOptions) => void;
  defaultTemplate?: 'slip' | 'compact' | 'register' | 'monthly';
}) {
  const [opts, setOpts] = useState<ExportOptions>({
    periodId: period.id, entryIds: ids, template: defaultTemplate || 'slip', paper: 'A4',
    hideZeros: true, monochrome: false, explanations: true,asOf:period.asOf,view:'monthly',
    registerColumns: DEFAULT_REGISTER_COLS,
    slipFields: ALL_SLIP_FIELDS.map(f => f.key),
    reportSections: MONTHLY_REPORT_SECTIONS.map(x=>x.key),
    reportColumns: MONTHLY_REPORT_COLUMNS.map(x=>x.key),
  });
  const [activeTab, setActiveTab] = useState<'general' | 'columns'>('general');
  const e = period.entries.find(en => ids.includes(en.id));
  const reportRows=period.entries.filter(entry=>ids.includes(entry.id));
  const reportGross=reportRows.reduce((sum,entry)=>sum+(entry.result?.gross||0),0);
  const reportDeductions=reportRows.reduce((sum,entry)=>sum+(entry.result?.deductions||0),0);
  const reportNet=reportRows.reduce((sum,entry)=>sum+(entry.result?.net||0),0);
  const reportCenters=Array.from(new Set(reportRows.map(entry=>entry.snapshot.costCenter||'غير محدد'))).map(name=>({name,value:reportRows.filter(entry=>(entry.snapshot.costCenter||'غير محدد')===name).reduce((sum,entry)=>sum+(entry.result?.net||0),0)})).sort((a,b)=>b.value-a.value).slice(0,5);
  const reportPayment=Array.from(new Set(reportRows.map(entry=>entry.snapshot.paymentMethod||'غير محدد'))).map(name=>({name,value:reportRows.filter(entry=>(entry.snapshot.paymentMethod||'غير محدد')===name).length})).sort((a,b)=>b.value-a.value);
  const reportComponents=[...earningKeys.map(key=>({name:labels[key],value:reportRows.reduce((sum,row)=>sum+(row.result?.amounts[key]||0),0)})),...deductionKeys.map(key=>({name:labels[key],value:reportRows.reduce((sum,row)=>sum+(row.result?.amounts[key]||0),0)})),...(period.policy?.formulas.customFields||[]).map(field=>({name:field.name,value:reportRows.reduce((sum,row)=>sum+(row.result?.customAmounts?.[field.id]||0),0)}))].filter(item=>item.value!==0).sort((a,b)=>b.value-a.value).slice(0,5);
  const reportDaily=Object.entries(dailyLabels).map(([key,label])=>({name:label,value:reportRows.reduce((sum,row)=>sum+Number((row.daily as any)?.[key]||0),0)})).filter(item=>item.value!==0);
  const reportInvalid=opts.template==='monthly'&&(!(opts.reportSections||[]).length||((opts.reportSections||[]).includes('employees')&&!(opts.reportColumns||[]).length));

  const toggleRegCol = (col: RegisterColumn) => {
    const cols = opts.registerColumns || DEFAULT_REGISTER_COLS;
    setOpts({ ...opts, registerColumns: cols.includes(col) ? cols.filter(c => c !== col) : [...cols, col] });
  };

  const toggleSlipField = (field: string) => {
    const fields = opts.slipFields || ALL_SLIP_FIELDS.map(f => f.key);
    setOpts({ ...opts, slipFields: fields.includes(field) ? fields.filter(f => f !== field) : [...fields, field] });
  };
  const toggleReportSection=(key:MonthlyReportSection)=>{const current=opts.reportSections||MONTHLY_REPORT_SECTIONS.map(x=>x.key);setOpts({...opts,reportSections:current.includes(key)?current.filter(x=>x!==key):[...current,key]});};
  const toggleReportColumn=(key:MonthlyReportColumn)=>{const current=opts.reportColumns||MONTHLY_REPORT_COLUMNS.map(x=>x.key);setOpts({...opts,reportColumns:current.includes(key)?current.filter(x=>x!==key):[...current,key]});};

  // Group columns
  const colGroups = [...new Set(ALL_REGISTER_COLS.map(c => c.group))];

  return (
    <Modal title="مركز الطباعة والتصدير" wide onClose={close} eyebrow="كيان / تصدير">
      <div className="modal-body export-layout">
        <div>
          {/* Tabs */}
          <div className="export-tabs">
            <button className={activeTab === 'general' ? 'active' : ''} onClick={() => setActiveTab('general')}>
              <Icon name="settings" size={14}/> الإعدادات العامة
            </button>
            <button className={activeTab === 'columns' ? 'active' : ''} onClick={() => setActiveTab('columns')}>
              <Icon name="columns" size={14}/> اختيار الأعمدة والحقول
            </button>
          </div>

          {activeTab === 'general' && <>
            <span className="eyebrow" style={{ display: 'block', marginTop: 16 }}>إعدادات المستند</span>
            <h3>{monthName(period.month)}</h3>
            <p style={{ fontSize: 10, color: '#87949f', marginBottom: 16 }}>{ids.length} موظف · {period.status === 'approved' ? 'نسخة معتمدة' : 'مسودة غير معتمدة'}</p>

            {opts.template!=='monthly'&&<><Field label="نطاق الحساب"><select value={opts.view} onChange={e=>setOpts({...opts,view:e.target.value as any})}><option value="monthly">تسوية الشهر كاملة</option><option value="accrued">المستحق حتى التاريخ المحدد</option></select></Field>{opts.view==='accrued'&&<Field label="تاريخ المستحق"><input type="date" min={`${period.month}-01`} max={monthEnd(period.month)} value={opts.asOf} onChange={e=>setOpts({...opts,asOf:e.target.value})}/></Field>}</>}
            <Field label="قالب التصدير">
              <select value={opts.template} onChange={e => {const template=e.target.value as ExportOptions['template'];setOpts({ ...opts, template, view:template==='monthly'?'monthly':opts.view, paper:template==='compact'||template==='monthly'?'A4':opts.paper });}}>
                <option value="monthly">التقرير الشهري المتكامل</option>
                <option value="slip">قسيمة مفصلة لكل موظف</option>
                <option value="compact">قسيمتان على ورقة A4</option>
                <option value="register">كشف صرف جدولي (كل الموظفين)</option>
              </select>
            </Field>
            {opts.template!=='monthly'&&<Field label="حجم الورق">
              <select disabled={opts.template === 'compact'} value={opts.paper} onChange={e => setOpts({ ...opts, paper: e.target.value as any })}>
                <option>A4</option><option>A5</option>
              </select>
            </Field>}
            {[
              ...(opts.template==='monthly'?[]:[['hideZeros', 'إخفاء البنود الصفرية'],['explanations', 'إظهار شرح الحساب في القسيمة']]),
              ['monochrome', 'نسخة أبيض وأسود'],
            ].map(([key, label]) => (
              <label className="review-checkbox" key={key}>
                <input type="checkbox" checked={opts[key as keyof ExportOptions] as boolean}
                  onChange={e => setOpts({ ...opts, [key]: e.target.checked })}/>
                {label}
              </label>
            ))}
            <div className="alert" style={{ marginTop: 12 }}>
              {opts.template==='monthly'?'يشمل التقرير ملخصًا ورسومًا وجداول قابلة للاختيار، ويُحفظ Excel مع صفحات تفصيلية.':'ملف PDF يفتح بعد التصدير للمراجعة قبل الطباعة. Excel يحتوي كشفًا إجماليًا وقسائم تفصيلية.'}
            </div>
          </>}

          {activeTab === 'columns' && <>
            <div style={{ marginTop: 16 }}>
              {opts.template === 'monthly' ? (
                <>
                  <div className="report-option-group"><b>أقسام التقرير</b>{MONTHLY_REPORT_SECTIONS.map(section=><label key={section.key} className="review-checkbox"><input type="checkbox" checked={(opts.reportSections||[]).includes(section.key)} onChange={()=>toggleReportSection(section.key)}/>{section.label}</label>)}</div>
                  {(opts.reportSections||[]).includes('employees')&&<div className="report-option-group"><b>حقول تفاصيل الموظفين</b><div className="report-column-options">{MONTHLY_REPORT_COLUMNS.map(column=><label key={column.key} className="review-checkbox"><input type="checkbox" checked={(opts.reportColumns||[]).includes(column.key)} onChange={()=>toggleReportColumn(column.key)}/>{column.label}</label>)}</div></div>}
                </>
              ) : opts.template === 'register' ? (
                <>
                  <p style={{ fontSize: 11, color: '#87949f', marginBottom: 12 }}>اختر الأعمدة التي تظهر في كشف الصرف الجدولي:</p>
                  {colGroups.map(group => (
                    <div key={group} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#EC671B', marginBottom: 8, borderBottom: '1px solid #eee', paddingBottom: 5 }}>{group}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {ALL_REGISTER_COLS.filter(c => c.group === group).map(col => (
                          <label key={col.key} className="review-checkbox" style={{ margin: 0, fontSize: 11 }}>
                            <input type="checkbox"
                              checked={(opts.registerColumns || DEFAULT_REGISTER_COLS).includes(col.key)}
                              onChange={() => toggleRegCol(col.key)}/>
                            {col.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <p style={{ fontSize: 11, color: '#87949f', marginBottom: 12 }}>اختر الحقول التي تظهر في قسيمة الراتب:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {ALL_SLIP_FIELDS.map(field => (
                      <label key={field.key} className="review-checkbox" style={{ margin: 0, fontSize: 11 }}>
                        <input type="checkbox"
                          checked={(opts.slipFields || ALL_SLIP_FIELDS.map(f => f.key)).includes(field.key)}
                          onChange={() => toggleSlipField(field.key)}/>
                        {field.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>}
        </div>

        {/* Preview — mirrors actual print output */}
        <div className="receipt-preview">
          {opts.template === 'monthly' ? <div className="print-preview-label">معاينة التقرير الشهري · {monthName(period.month)}</div> : opts.template === 'register' ? <div className="print-preview-label">معاينة الكشف الجدولي</div> : <div className="print-preview-label">معاينة القسيمة الأولى من {ids.length}</div>}
          {opts.template === 'monthly' ? (
            <div className="monthly-report-preview">
              <header>
                <img src={logo} alt="شعار الشركة" style={{ height: 50, objectFit: 'contain', borderRadius: 8 }}/>
                <div>
                  <b>{period.policy?.company||'كيان'}</b>
                  <span>التقرير الشهري للرواتب · {monthName(period.month)}</span>
                </div>
                <span className={period.status==='approved'?'approved':'draft'}>
                  {period.status==='approved'?'معتمد':'مسودة'}
                </span>
              </header>

              {(opts.reportSections||[]).includes('overview') && (
                <div className="monthly-preview-kpis">
                  <div><small>إجمالي الاستحقاقات</small><b>{money(reportGross)}</b></div>
                  <div><small>إجمالي الاستقطاعات</small><b>{money(reportDeductions)}</b></div>
                  <div className="highlight"><small>صافي المستحق</small><b>{money(reportNet)}</b></div>
                  <div><small>متوسط الصافي</small><b>{money(reportRows.length ? Math.round(reportNet / reportRows.length) : 0)}</b></div>
                  <div><small>عدد الموظفين</small><b>{reportRows.length} موظف</b></div>
                  <div><small>حالة الاعتماد</small><b style={{fontSize: 9}}>{period.status === 'approved' ? 'معتمد رسمياً' : 'مسودة قيد المراجعة'}</b></div>
                </div>
              )}

              {(opts.reportSections||[]).includes('quality') && (
                <div className="monthly-preview-quality">
                  <span className="q-tag-reviewed">✓ مراجَع {reportRows.filter(x=>x.checked&&!x.error&&!!x.result&&x.result.net>=0).length}</span>
                  <span className="q-tag-pending">⏱ بانتظار {reportRows.filter(x=>!x.checked||!!x.error||!x.result||(x.result?.net||0)<0).length}</span>
                  <span className="q-tag-incomplete">⚠ ناقص {reportRows.filter(x=>!!x.error||!x.result).length}</span>
                  <span className="q-tag-paid">💳 صُرف {reportRows.filter(x=>x.paid).length}</span>
                  <span className="q-tag-unpaid">⏳ لم يُصرف {reportRows.filter(x=>!x.paid).length}</span>
                </div>
              )}

              {(opts.reportSections||[]).includes('centers') && (
                <div className="monthly-preview-chart">
                  <b>صافي المستحق حسب مركز التكلفة</b>
                  {reportCenters.map((x, i) => {
                    const maxVal = Math.max(1, ...reportCenters.map(y => y.value));
                    const pct = reportNet > 0 ? Math.round((x.value / reportNet) * 100) : 0;
                    return (
                      <div key={x.name} className="preview-chart-row">
                        <span title={x.name}>{x.name}</span>
                        <i><em style={{ width: `${Math.max(2, (x.value / maxVal) * 100)}%`, background: i === 0 ? '#EC671B' : i === 1 ? '#1C2A38' : '#0D9488' }}/></i>
                        <small className="preview-pct">{pct}%</small>
                        <small className="preview-val">{money(x.value)}</small>
                      </div>
                    );
                  })}
                </div>
              )}

              {(opts.reportSections||[]).includes('payment') && (
                <div className="monthly-preview-chart">
                  <b>الموظفون حسب طريقة الدفع</b>
                  {reportPayment.map((x, i) => {
                    const maxVal = Math.max(1, ...reportPayment.map(y => y.value));
                    const pct = reportRows.length > 0 ? Math.round((x.value / reportRows.length) * 100) : 0;
                    return (
                      <div key={x.name} className="preview-chart-row">
                        <span>{x.name}</span>
                        <i><em style={{ width: `${Math.max(2, (x.value / maxVal) * 100)}%`, background: i === 0 ? '#EC671B' : '#0D9488' }}/></i>
                        <small className="preview-pct">{pct}%</small>
                        <small className="preview-val">{x.value} موظف</small>
                      </div>
                    );
                  })}
                </div>
              )}

              {(opts.reportSections||[]).includes('components') && (
                <div className="monthly-preview-chart">
                  <b>أبرز بنود الراتب</b>
                  {reportComponents.map((x, i) => {
                    const maxVal = Math.max(1, ...reportComponents.map(y => y.value));
                    return (
                      <div key={x.name} className="preview-chart-row">
                        <span title={x.name}>{x.name}</span>
                        <i><em style={{ width: `${Math.max(2, (x.value / maxVal) * 100)}%`, background: i % 2 === 0 ? '#EC671B' : '#C05621' }}/></i>
                        <small className="preview-val">{money(x.value)}</small>
                      </div>
                    );
                  })}
                </div>
              )}

              {(opts.reportSections||[]).includes('daily') && (
                <div className="monthly-preview-chart">
                  <b>الحركات اليومية</b>
                  {reportDaily.length ? reportDaily.map(x => (
                    <div key={x.name} className="preview-chart-row">
                      <span>{x.name}</span>
                      <i><em style={{ width: `${Math.max(2, (x.value / Math.max(1, ...reportDaily.map(y => y.value))) * 100)}%`, background: '#EC671B' }}/></i>
                      <small className="preview-val">{x.value.toLocaleString('ar-EG')}</small>
                    </div>
                  )) : <small style={{ color: '#94A3B8' }}>لا توجد حركات مسجلة في هذا الشهر.</small>}
                </div>
              )}

              {(opts.reportSections||[]).includes('employees') && (
                <div className="monthly-preview-table">
                  <b>تفاصيل الموظفين · أول 5 صفوف</b>
                  <table>
                    <thead>
                      <tr>{MONTHLY_REPORT_COLUMNS.filter(x => (opts.reportColumns||[]).includes(x.key)).map(x => <th key={x.key}>{x.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {reportRows.slice(0, 5).map(row => (
                        <tr key={row.id}>
                          {MONTHLY_REPORT_COLUMNS.filter(x => (opts.reportColumns||[]).includes(x.key)).map(column => (
                            <td key={column.key}>
                              {column.key==='net'?money(row.result?.net||0):column.key==='basic'?money(row.result?.amounts.basic||0):column.key==='gross'?money(row.result?.gross||0):column.key==='deductions'?money(row.result?.deductions||0):column.key==='paid'?(row.paid?'تم الصرف':'لم يُصرف'):column.key==='checked'?(row.checked?'تمت':'بانتظار'):(row.snapshot as any)[column.key]||'—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(opts.reportSections||[]).length === 0 && <p className="muted">اختر قسمًا واحدًا على الأقل لعرضه في التقرير.</p>}
            </div>
          ) : opts.template === 'register' ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 20, fontSize: 13, background: '#F8FAFC', borderRadius: 8, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{fontSize:24,marginBottom:12}}>📊</div>
              <div style={{color:'#1C2A38',fontWeight:600,marginBottom:4}}>تقرير الرواتب الشامل</div>
              <div style={{fontSize:11}}>سيتم تصدير جدول احترافي يحتوي على بيانات {ids.length} موظف.</div>
            </div>
          ) : e ? (e.result ? (
            <div className="print-slip-preview" style={{ background: opts.monochrome ? '#fff' : '#fff', fontFamily: 'inherit', direction: 'rtl', fontSize: 13 }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: `3px solid ${opts.monochrome ? '#475569' : '#EC671B'}`, paddingBottom: 12, marginBottom: 16 }}>
                <img src={logo} style={{ height: 55, objectFit: 'contain' }}/>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, background: period.status === 'approved' ? '#F0FDF4' : '#F8FAFC', color: period.status === 'approved' ? '#166534' : '#475569', border: `1px solid ${period.status === 'approved' ? '#BBF7D0' : '#CBD5E1'}`, borderRadius: 20, padding: '5px 12px', fontWeight: 600 }}>
                    {period.status === 'approved' ? 'نسخة معتمدة' : '⚠ مسودة غير معتمدة'}
                  </span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1C2A38', marginBottom: 4 }}>بيان راتب موظف</div>
                    <div style={{ fontSize: 10.5, color: '#94A3B8' }}>شهر {new Date(`${period.month}-01T12:00:00`).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</div>
                  </div>
                </div>
              </div>
              {/* Employee bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 0, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
                {[
                  ['اسم الموظف', e.snapshot.name],
                  ['الوظيفة', e.snapshot.job || '—'],
                  ['مركز التكلفة', e.snapshot.costCenter || '—'],
                  ['كود · طريقة الدفع', `${e.snapshot.code} · ${e.snapshot.paymentMethod}`],
                ].map(([lbl, val], i) => (
                  <div key={i} style={{ padding: '12px 14px', borderLeft: i % 2 === 0 ? '1px solid #E2E8F0' : undefined }}>
                    <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>{lbl}</div>
                    <div style={{ fontSize: i === 0 ? 13.5 : 12.5, fontWeight: 700, color: i === 0 ? (opts.monochrome ? '#475569' : '#EC671B') : '#1C2A38' }}>{val}</div>
                  </div>
                ))}
              </div>
              {/* Tables */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* Earnings */}
                <div style={{ fontSize: 12 }}>
                  <div style={{ background: opts.monochrome ? '#334155' : '#1C2A38', color: 'white', padding: '9px 12px', borderRadius: '0 6px 0 0', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>الاستحقاقات</span><span>جنيه مصري</span>
                  </div>
                  {earningKeys.filter(k => !opts.hideZeros || k === 'basic' || e.result!.amounts[k] !== 0).map((k, i) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: i % 2 === 0 ? '#F8FAFC' : 'white', borderBottom: '1px solid #E2E8F0' }}>
                      <span>{labels[k]}</span>
                      <b style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{money(e.result!.amounts[k])}</b>
                    </div>
                  ))}
                  <div style={{ background: opts.monochrome ? '#E2E8F0' : '#FFF0E4', padding: '9px 12px', fontWeight: 700, fontSize: 12.5, display: 'flex', justifyContent: 'space-between', borderTop: `1.5px solid ${opts.monochrome ? '#475569' : '#EC671B'}` }}>
                    <span>إجمالي الاستحقاقات</span><b>{money(e.result!.gross)}</b>
                  </div>
                </div>
                {/* Deductions */}
                <div style={{ fontSize: 12 }}>
                  <div style={{ background: opts.monochrome ? '#475569' : '#C05621', color: 'white', padding: '9px 12px', borderRadius: '0 6px 0 0', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>الاستقطاعات</span><span>جنيه مصري</span>
                  </div>
                  {deductionKeys.filter(k => !opts.hideZeros || e.result!.amounts[k] !== 0).map((k, i) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: i % 2 === 0 ? '#F8FAFC' : 'white', borderBottom: '1px solid #E2E8F0' }}>
                      <span>{labels[k]}</span>
                      <b style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{money(e.result!.amounts[k])}</b>
                    </div>
                  ))}
                  <div style={{ background: opts.monochrome ? '#E2E8F0' : '#FFF0E4', padding: '9px 12px', fontWeight: 700, fontSize: 12.5, display: 'flex', justifyContent: 'space-between', borderTop: `1.5px solid ${opts.monochrome ? '#475569' : '#EC671B'}` }}>
                    <span>إجمالي الاستقطاعات</span><b>{money(e.result!.deductions)}</b>
                  </div>
                </div>
              </div>
              {/* Net box */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: opts.monochrome ? '#F1F5F9' : '#FFF5EB', border: `1.5px solid ${opts.monochrome ? '#CBD5E1' : '#FDE6C8'}`, borderRight: `5px solid ${opts.monochrome ? '#475569' : '#EC671B'}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1C2A38' }}>صافي المرتب المستحق</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>جنيه مصري</div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: opts.monochrome ? '#475569' : '#EC671B', fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>{money(e.result!.net)}</div>
              </div>
              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8', borderTop: '1px solid #E2E8F0', paddingTop: 10, marginTop: 4 }}>
                <span>مرجع: {period.id.slice(0, 8)}</span>
                <span>طُبع: {new Date().toLocaleDateString('ar-EG')}</span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 20, fontSize: 12, background: '#F8FAFC', borderRadius: 8 }}>
              <div style={{fontSize:20,marginBottom:8}}>📋</div>
              <div>بيانات هذا الموظف غير مكتملة</div>
              <small style={{color:'#CBD5E1'}}>سيتم تصدير البيانات المتاحة فقط</small>
            </div>
          )) : (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 32, fontSize: 13 }}>
              لا يوجد موظفون محددون
            </div>
          )}
        </div>
      </div>
      <div className="modal-foot">
        <span className="muted">كل المخرجات من نفس أرقام الشهر.</span>
        <div className="actions">
          <button className="secondary" disabled={busy || !ids.length || reportInvalid} onClick={() => perform('export.excel', opts)}>
            <Icon name="download" size={15}/> {opts.template==='monthly'?'تصدير التقرير الشهري Excel':'تصدير Excel'}
          </button>
          <button className="secondary" disabled={busy || !ids.length || reportInvalid} onClick={() => perform('export.pdf', opts)}>
            <Icon name="export" size={15}/> {opts.template==='monthly'?'تصدير PDF':'حفظ PDF'}
          </button>
          <button className="primary" disabled={busy || !ids.length || reportInvalid} onClick={() => perform('export.print', opts)}>
            <Icon name="print" size={15}/> {opts.template==='monthly'?'معاينة / طباعة التقرير':'طباعة'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
function App() {
  const [auth, setAuth] = useState<{ configured: boolean; unlocked: boolean; cloud?:boolean; user?:{id:string;username:string;name:string;role:string}|null } | null>(null);
  const [cloudStatus,setCloudStatus]=useState<CloudStatus|null>(null);
  const [password, setPassword] = useState('');
  const [username,setUsername]=useState('admin');
  const isSuperAdmin=auth?.user?.role==='super_admin';
  const isAdmin=isSuperAdmin||auth?.user?.role==='admin';
  const [state, setState] = useState<State | null>(null);
  const [page, setPage] = useState('dashboard');
  const [period, setPeriod] = useState<Period | null>(null);
  const [search, setSearch] = useState('');
  const [center, setCenter] = useState('');
  const [payFilterJob,setPayFilterJob]=useState('');
  const [payFilterDept,setPayFilterDept]=useState('');
  const [payFilterCompany,setPayFilterCompany]=useState('');
  const [payFilterPayment,setPayFilterPayment]=useState('');
  const [payFilterReview,setPayFilterReview]=useState('');
  const [payFilterPaid,setPayFilterPaid]=useState('');
  const [payFilterWorkStatus,setPayFilterWorkStatus]=useState('');
  const [payBasicMin,setPayBasicMin]=useState('');
  const [payBasicMax,setPayBasicMax]=useState('');
  const [payGrossMin,setPayGrossMin]=useState('');
  const [payGrossMax,setPayGrossMax]=useState('');
  const [payDeductionMin,setPayDeductionMin]=useState('');
  const [payDeductionMax,setPayDeductionMax]=useState('');
  const [payNetMin,setPayNetMin]=useState('');
  const [payNetMax,setPayNetMax]=useState('');
  const [employee, setEmployee] = useState<Partial<Employee> | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [imported, setImported] = useState<ImportPreview | null>(null);
  const [importIds, setImportIds] = useState<number[]>([]);
  const [newMonth, setNewMonth] = useState(false);
  const [deletePeriodConfirm, setDeletePeriodConfirm] = useState(false);
  const [deletePeriodInput, setDeletePeriodInput] = useState('');
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [exporting, setExporting] = useState(false);
  const [exportingEmployees, setExportingEmployees] = useState<Employee[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => Promise<void> } | null>(null);
  // Remote control state
  const [updateReady, setUpdateReady] = useState<{ version: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string } | null>(null);
  const [remoteDisabled, setRemoteDisabled] = useState<{ message: string } | null>(null);
  const [broadcast, setBroadcast] = useState<{ title: string; body: string; type: string } | null>(null);

  const notify = (text: string, bad = false) => setNotice({ text, bad });
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e: any) { notify(e.message, true); } finally { setBusy(false); } };
  const refresh = async () => {
    const next = await api.call('state') as State;
    setState(next);
    if(period){
      if(next.periods.some(item=>item.id===period.id))setPeriod(await api.call('period.get',{id:period.id,asOf:period.asOf}));
      else setPeriod(null);
    }
    return next;
  };
  const openPeriod = async (id: string) => { const p = await api.call('period.get', id); setPeriod(p); setSelected([]); setSearch(''); setCenter('');setPayFilterJob('');setPayFilterDept('');setPayFilterCompany('');setPayFilterPayment('');setPayFilterReview('');setPayFilterPaid('');setPayFilterWorkStatus('');setPayBasicMin('');setPayBasicMax('');setPayGrossMin('');setPayGrossMax('');setPayDeductionMin('');setPayDeductionMax('');setPayNetMin('');setPayNetMax(''); };

  useEffect(() => { api.call('auth.status').then(setAuth).catch((e: any) => notify(e.message, true)); }, []);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(null), 7000); return () => clearTimeout(t); } }, [notice]);

  // Wire up remote control + auto-update events from main process
  useEffect(() => {
    const off1 = api.onAppEvent('app:update-ready',    (d) => setUpdateReady(d));
    const off2 = api.onAppEvent('app:update-available',(d) => setUpdateAvailable(d));
    return () => {off1();off2();};
  }, []);

  useEffect(()=>{api.call('cloud.status').then(setCloudStatus);return api.onAppEvent('cloud:changed',(status)=>{setCloudStatus(status);if(auth?.unlocked){api.call('auth.status').then(setAuth);api.call('state').then(setState).catch(()=>{});if(period&&!editEntry&&!employee&&!bulk)api.call('period.get',period.id).then(setPeriod).catch(()=>{});}});},[auth?.unlocked,period?.id,editEntry,employee,bulk]);
  useEffect(()=>{api.updateActivity(!auth?.unlocked||busy||!!employee||!!editEntry||newMonth||!!imported||bulk||!!confirm||page!=='dashboard');},[auth?.unlocked,busy,employee,editEntry,newMonth,imported,bulk,confirm,page]);
  const signIn = () => run(async () => {
    const user=await api.call(auth?.configured ? 'auth.login' : 'auth.setup', auth?.configured?{username,password}:password);
    setPassword('');setPage('dashboard');setPeriod(null); setAuth({ configured: true, unlocked: true,user,cloud:auth?.cloud });
    const next = await refresh();
    if (next.periods.length) await openPeriod(next.periods[0].id);
  });

  const [filterStatus, setFilterStatus] = React.useState("");
  const [filterPayment, setFilterPayment] = React.useState("");
  const [filterDept, setFilterDept] = React.useState("");
  const [filterJob, setFilterJob] = React.useState("");
  const [filterCompany, setFilterCompany] = React.useState("");
  const [filterNationality,setFilterNationality]=React.useState("");
  const [filterGender,setFilterGender]=React.useState("");
  const [filterContract,setFilterContract]=React.useState("");
  const [filterQualification,setFilterQualification]=React.useState("");
  const [filterStartAfter,setFilterStartAfter]=React.useState("");
  const [filterStartBefore,setFilterStartBefore]=React.useState("");

  const filterChoices=(key:keyof Employee)=>Array.from(new Set((state?.employees||[]).map(e=>String(e[key]||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ar'));
  const periodChoices=(key:keyof Employee)=>Array.from(new Set((period?.entries||[]).map(e=>String(e.snapshot[key]||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ar'));

  const employees = useMemo(() => state?.employees.filter(e =>
    (!search || norm(Object.values(e).filter(v=>typeof v==='string'||typeof v==='number').join(' ')).includes(norm(search))) &&
    (!center || e.costCenter === center) &&
    (!filterCompany || norm(e.employerCompany || "").includes(norm(filterCompany))) &&
    (!filterStatus || (filterStatus === "active" ? e.active : !e.active)) &&
    (!filterPayment || e.paymentMethod === filterPayment) &&
    (!filterDept || norm(e.department || "").includes(norm(filterDept))) &&
    (!filterJob || norm(e.job || "").includes(norm(filterJob))) &&
    (!filterNationality || e.nationality===filterNationality) &&
    (!filterGender || e.gender===filterGender) &&
    (!filterContract || e.contractType===filterContract) &&
    (!filterQualification || e.qualification===filterQualification) &&
    (!filterStartAfter || !!e.startDate&&e.startDate>=filterStartAfter) &&
    (!filterStartBefore || !!e.startDate&&e.startDate<=filterStartBefore)
  ) || [], [state, search, center, filterStatus, filterPayment, filterDept, filterJob, filterCompany,filterNationality,filterGender,filterContract,filterQualification,filterStartAfter,filterStartBefore]);

  const entries = useMemo(() => period?.entries.filter(e => {
    const snapshot=e.snapshot, result=e.result;
    const searchable=`${Object.values(snapshot).filter(v=>typeof v==='string'||typeof v==='number').join(' ')} ${Object.values(e.inputs).filter(v=>typeof v==='string'||typeof v==='number').join(' ')} ${result?.gross||0} ${result?.deductions||0} ${result?.net||0}`;
    const basic=Number(e.inputs.basic||0),gross=(result?.gross||0)/100,deductions=(result?.deductions||0)/100,net=(result?.net||0)/100,reviewed=e.checked&&!!result&&result.net>=0;
    return (!search||norm(searchable).includes(norm(search)))&&(!center||snapshot.costCenter===center)&&
      (!payFilterJob||snapshot.job===payFilterJob)&&(!payFilterDept||snapshot.department===payFilterDept)&&
      (!payFilterCompany||snapshot.employerCompany===payFilterCompany)&&(!payFilterPayment||snapshot.paymentMethod===payFilterPayment)&&
      (!payFilterReview||(payFilterReview==='reviewed'?reviewed:!reviewed))&&
      (!payFilterPaid||(payFilterPaid==='paid'?e.paid:!e.paid))&&
      (!payFilterWorkStatus||(payFilterWorkStatus==='active'?snapshot.active:!snapshot.active))&&
      (!payBasicMin||basic>=Number(payBasicMin))&&(!payBasicMax||basic<=Number(payBasicMax))&&
      (!payGrossMin||gross>=Number(payGrossMin))&&(!payGrossMax||gross<=Number(payGrossMax))&&
      (!payDeductionMin||deductions>=Number(payDeductionMin))&&(!payDeductionMax||deductions<=Number(payDeductionMax))&&
      (!payNetMin||net>=Number(payNetMin))&&(!payNetMax||net<=Number(payNetMax));
  })||[],[period,search,center,payFilterJob,payFilterDept,payFilterCompany,payFilterPayment,payFilterReview,payFilterPaid,payFilterWorkStatus,payBasicMin,payBasicMax,payGrossMin,payGrossMax,payDeductionMin,payDeductionMax,payNetMin,payNetMax]);

  useEffect(()=>{setSelected(current=>current.filter(id=>entries.some(entry=>entry.id===id)));},[entries]);

  const total = (key: 'net' | 'gross' | 'deductions') => period?.entries.reduce((s, e) => s + (e.result?.[key] || 0), 0) || 0;
  const pending = period?.entries.filter(e => !e.checked || !e.result || e.result.net < 0 || e.result.amounts.basic === 0) || [];
  const changePage = (id: string) => { setPage(id); setSearch(""); setCenter(""); setFilterStatus(""); setFilterPayment(""); setFilterDept(""); setFilterJob(""); setFilterCompany("");setFilterNationality('');setFilterGender('');setFilterContract('');setFilterQualification('');setFilterStartAfter('');setFilterStartBefore('');setPayFilterJob('');setPayFilterDept('');setPayFilterCompany('');setPayFilterPayment('');setPayFilterReview('');setPayFilterPaid('');setPayFilterWorkStatus('');setPayBasicMin('');setPayBasicMax('');setPayGrossMin('');setPayGrossMax('');setPayDeductionMin('');setPayDeductionMax('');setPayNetMin('');setPayNetMax(''); };

  const chooseImport = () => run(async () => {
    const result = await api.call('import.preview');
    if (result) { setImported(result); setImportIds(result.rows.filter((r: any) => r.suggested).map((r: any) => r.row)); }
  });

  const blankEmployee = () => setEmployee({
    code: `EMP-${String((state?.employees.length || 0) + 1).padStart(4, '0')}`,
    name: '', job: '', costCenter: '', startDate: '', endDate: '',
    paymentMethod: 'نقدي', bankNote: '', graduation: '', phone: '',
    nationalId: '', address: '', basic: '', active: true, notes: '',
  });

  const toast = notice && (
    <div role="status" className={`toast ${notice.bad ? 'bad' : ''}`}>
      {notice.text}
      <button onClick={() => setNotice(null)} aria-label="إخفاء">×</button>
    </div>
  );

  if (remoteDisabled) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: 'white', padding: '40px', textAlign: 'center' }}>
      <Icon name="lock" />
      <h1 style={{ marginTop: '20px', color: '#ef4444' }}>تم إيقاف النظام مؤقتاً</h1>
      <p style={{ marginTop: '10px', color: '#94a3b8', maxWidth: '500px', lineHeight: '1.8' }}>{remoteDisabled.message}</p>
      <small style={{ marginTop: '40px', color: '#475569' }}>Kayan Payroll</small>
    </div>
  );

  const globalOverlays = (
    <>
      {broadcast && (
        <Modal title={broadcast.title} onClose={() => setBroadcast(null)}>
          <div className="modal-body">
            <p>{broadcast.body}</p>
          </div>
          <div className="modal-foot">
            <button className="primary" onClick={() => setBroadcast(null)}>حسناً</button>
          </div>
        </Modal>
      )}
      {updateReady && (
        <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: 'white', padding: '16px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 9999, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
          <div>
            <b style={{ display: 'block', marginBottom: '4px' }}>تحديث جديد جاهز للتثبيت ({updateReady.version})</b>
            <small style={{ color: '#94a3b8' }}>احفظ عملك وارجع للرئيسية؛ سيُثبت التحديث تلقائيًا بعد اكتمال المزامنة.</small>
          </div>
          <button className="primary" style={{ background: '#ec671b', border: 'none' }} onClick={() => api.installUpdate()}>تحديث الآن</button>
          
        </div>
      )}
    </>
  );

  if (!auth) return <div className="loading">جارٍ فتح نظام كيان…</div>;

  if (!auth.unlocked) return (
    <div className="login-page">
      <div className="login-orb login-orb-1"></div>
      <div className="login-orb login-orb-2"></div>
      <div className="login-orb login-orb-3"></div>
      <div className="login-grid-overlay"></div>
      <div className="login-container">
        <div className="login-brand-panel">
          <div className="login-brand-content">
            <div className="login-brand-logo"><img src={icon} alt="كيان"/></div>
            <h1 className="login-brand-title">كيان</h1>
            <p className="login-brand-sub">نظام إدارة الرواتب المتكامل</p>
            <div className="login-brand-features">
              <div className="login-feature"><span className="login-feature-dot"></span>إدارة رواتب الموظفين بدقة</div>
              <div className="login-feature"><span className="login-feature-dot"></span>تتبع الحضور والغياب يومياً</div>
              <div className="login-feature"><span className="login-feature-dot"></span>تقارير مالية احترافية</div>
              <div className="login-feature"><span className="login-feature-dot"></span>حماية البيانات ونسخ احتياطي</div>
            </div>
            <div className="login-version-pill">
              <div className="login-status-dot"></div>
              <span>الإصدار {pkg.version} · {auth.cloud?'سحابي':'محلي'}</span>
            </div>
          </div>
        </div>
        <div className="login-form-panel">
          <div className="login-form-card">
            <div className="login-mobile-logo"><img src={icon} alt="كيان"/></div>
            <div className="login-form-header">
              <div className="login-lock-icon"><Icon name="lock" size={22}/></div>
              <h2>{auth.configured ? 'تسجيل الدخول' : 'إعداد مساحة العمل'}</h2>
              <p>{auth.configured ? 'أدخل بياناتك للوصول إلى النظام بأمان.' : 'أنشئ بيانات دخول قوية لحماية بيانات الرواتب.'}</p>
            </div>
            <form onSubmit={e => { e.preventDefault(); signIn(); }} className="login-form">
              <Field label="اسم الدخول">
                <input value={username} disabled={!auth.configured} required onChange={e=>setUsername(e.target.value)} autoComplete="username" className="login-input"/>
              </Field>
              {!auth.configured && <small className="login-hint">الحساب الافتراضي: <strong>admin</strong></small>}
              <Field label="كلمة المرور">
                <input type="password" autoFocus minLength={auth.configured ? 1 : 8} value={password} onChange={e => setPassword(e.target.value)} placeholder={auth.configured ? '' : '8 أحرف على الأقل'} required className="login-input"/>
              </Field>
              <button className="login-submit" disabled={busy}>
                {busy ? <><span className="login-spinner"></span> جاري التحقق…</> : (auth.configured ? 'دخول آمن' : 'حفظ وبدء العمل')}
              </button>
            </form>
            <div className="login-footer">
              <span className="login-status-indicator">
                <div className="login-status-dot active"></div>
                {cloudStatus?.configured?'متصل بالشركة':'متصل محلياً'}
              </span>
              <span>© كيان {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>
      </div>
      {toast}
      {globalOverlays}
    </div>
  );

  if (!state) return <div className="loading">جارٍ تحميل البيانات…</div>;

  return (
    <div className="app">
      {cloudStatus?.configured&&<div style={{position:'fixed',bottom:12,right:16,zIndex:50,background:'#fff',padding:'8px 14px',borderRadius:8,boxShadow:'0 2px 12px #0002'}} role="status">{cloudStatus.message} · {cloudStatus.pending} معلّقة</div>}
      {globalOverlays}
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <img src={icon}/>
          <div className="brand-caption">إدارة الرواتب<span>PAYROLL WORKSPACE</span></div>
        </div>
        <span className="nav-label">مساحة العمل</span>
        <nav>
          {navItems.filter(([id])=>isAdmin||!['admin','formulas'].includes(id)).map(([id, title, icon]) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => changePage(id)}>
              <Icon name={icon}/>
              <span>{title}</span>
              {id === 'payroll' && period?.status === 'draft' && <i/>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status"><span/> {cloudStatus?.configured?(cloudStatus.online?'متصل بالشركة':'تعديلات محفوظة على الجهاز'):'يعمل محليًا'} <small>{auth.user?.name} · {auth.user?.role==='super_admin'?'سوبر أدمن':isAdmin?'أدمن':'حساب عادي'}</small></div>
          <button className="lock-button" onClick={() => run(async () => {
            await api.call('auth.lock');
            setAuth({ configured: true, unlocked: false });
            setState(null); setPeriod(null);
          })}>
            <Icon name="lock"/>قفل مساحة العمل
          </button>
          <span className="version">KAYAN PAYROLL · {pkg.version}</span>
        </div>
      </aside>

      {/* Main */}
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <span style={{background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'}}>
              <div style={{width: '6px', height: '6px', background: '#ec671b', borderRadius: '50%'}}></div>
              Kayan Payroll v{pkg.version}
            </span>
            <span style={{color: '#94a3b8', margin: '0 8px'}}>/</span>
            <strong>{navItems.find(i => i[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">{new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <div className="avatar">ك</div>
            <div><b>{state.settings.company}</b><small>{cloudStatus?.configured?'مساحة الشركة المشتركة':'إدارة محلية'}</small></div>
          </div>
        </header>

        <div className="content">
          {/* ── Quick Toolbar ── */}
          {page === 'payroll' && period?.status === 'draft' && (
            <div className="quick-toolbar">
              <button className="secondary" onClick={() => setBulk(true)}>
                إدخال سريع / لصق من Excel
              </button>
              <span>للموظفين المحددين، أو نتائج البحث الحالية</span>
            </div>
          )}

          {/* ── Page Heading ── */}
          <div className="page-heading">
            <div>
              <span className="eyebrow">{page === 'dashboard' ? 'نظرة أوضح. عمل أسرع.' : 'إدارة الرواتب / كيان'}</span>
              <h1>{page === 'dashboard' ? 'أهلًا بك في مساحة الرواتب' : navItems.find(i => i[0] === page)?.[1]}</h1>
              <p>{page === 'dashboard' ? 'تابع جاهزية الشهر، وراجع الأرقام قبل الاعتماد.' : page === 'daily' ? 'سجّل الاستثناءات فقط، وتابع المستحق في أي يوم.' : page === 'employees' ? 'كل موظف ببياناته، وكل تغيير محفوظ في سجله.' : page === 'payroll' ? 'أدخل المتغيرات، راجع الحسابات، ثم اعتمد الشهر.' : page === 'reports' ? 'تفاصيل واضحة تساعدك على مراجعة تكلفة كل مشروع.' : page === 'formulas' ? 'تحكم كامل في معادلات الحساب والحقول المخصصة.' : 'بيانات الشركة، سياسة الحساب، وحماية نسخ العمل.'}</p>
            </div>
            <div className="actions">
              <button className="icon-btn" style={{ fontSize: 13 }} onClick={() => run(async () => { await refresh(); })} title="تحديث البيانات (Refresh)">
                <Icon name="refresh"/>
              </button>
              {page === 'employees' ? <>
                <button className="secondary" disabled={busy||!employees.length} onClick={() => setExportingEmployees(employees)}>
                  🖨️ طباعة وتصدير الموظفين
                </button>
                <button className="secondary" onClick={chooseImport} disabled={busy}>
                  <Icon name="download"/>استيراد Excel
                </button>
                <button className="primary" onClick={blankEmployee}>
                  <Icon name="plus"/>إضافة موظف
                </button>
              </> : page !== 'settings' && page !== 'formulas' && (
                <button className="primary" onClick={() => setNewMonth(true)}>
                  <Icon name="plus"/>إنشاء كشف شهر
                </button>
              )}
            </div>
          </div>

          {/* ─────────── Dashboard ─────────── */}
          {page === 'dashboard' && <>
            <div className="hero">
              <div>
                <span className="hero-eyebrow">كشف الرواتب الحالي</span>
                <h2>{period ? monthName(period.month) : 'ابدأ أول شهر رواتب'}</h2>
                <p>{period ? `${period.entries.length} موظف في هذا الكشف · ${period.status === 'approved' ? 'تم الاعتماد وحفظ الأرقام' : 'مسودة قابلة للتعديل'}` : 'أضف الموظفين أو استورد ملف العمال، ثم أنشئ كشف الشهر.'}</p>
                <button onClick={() => period ? changePage('payroll') : changePage('employees')}>
                  {period ? 'متابعة كشف الشهر' : 'الانتقال إلى الموظفين'}<Icon name="arrow"/>
                </button>
              </div>
              <div className="hero-total">
                <span>إجمالي صافي المستحق</span>
                <strong>{money(total('net'))}</strong>
                <small>جنيه مصري {period?.entries.some(e => !e.result) && '· إجمالي جزئي لوجود بيانات ناقصة'}</small>
              </div>
              <div className="hero-pattern"/>
            </div>
            <div className="stats">
              <Stat title="الموظفون النشطون" value={state.employees.filter(e => e.active).length.toString()} subtitle="ملفات مسجلة في النظام" icon="users"/>
              <Stat title="إجمالي الاستحقاقات" value={money(total('gross'))} subtitle="الأساسي والبدلات والحوافز" icon="wallet"/>
              <Stat title="إجمالي الاستقطاعات" value={money(total('deductions'))} subtitle="السلف والغياب والتأخير والصندوق" icon="chart"/>
              <Stat title="بانتظار المراجعة" value={String(pending.length)} subtitle="سجلات تحتاج مراجعة أو استكمال" icon="clock" warm/>
            </div>
            <div className="dashboard-grid">
              <section className="card">
                <div className="card-head">
                  <h3>كشوف الرواتب</h3>
                  <span className="count">{state.periods.length} شهر</span>
                </div>
                {!state.periods.length ? <Empty title="لا توجد كشوف بعد" text="أول كشف يبدأ بإضافة الموظفين وتحديد الشهر."/> : (
                  <div className="period-list">
                    {state.periods.slice(0, 6).map(p => (
                      <button key={p.id} onClick={() => run(async () => { await openPeriod(p.id); changePage('payroll'); })}>
                        <div className="period-icon"><Icon name="wallet"/></div>
                        <div><strong>{monthName(p.month)}</strong><small>أُنشئ {p.createdAt.slice(0, 10)}</small></div>
                        <Badge ok={p.status === 'approved'} text={p.status === 'approved' ? 'معتمد' : 'مسودة'}/>
                        <Icon name="arrow"/>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <section className="card review-card">
                <div className="card-head"><h3>قبل اعتماد الشهر</h3><Icon name="check"/></div>
                <div className="review-step"><span>01</span><div><b>أكمل بيانات الرواتب</b><p>الأساسي والمتغيرات والسلف لكل موظف.</p></div></div>
                <div className="review-step"><span>02</span><div><b>راجع الاستثناءات</b><p>تعيين خلال الشهر أو بيانات ناقصة أو صافي سالب.</p></div></div>
                <div className="review-step"><span>03</span><div><b>اعتمد وصدّر بثقة</b><p>تُثبّت الأرقام في نفس نسخة الشهر.</p></div></div>
                <div className="rule-note">خصم التأخير = عدد الساعات × الأساسي ÷ 30</div>
              </section>
            </div>
          </>}

          {/* ─────────── Employees ─────────── */}
          {page === 'daily' && <DailyPanel state={state} onChanged={async()=>{await refresh();if(period)setPeriod(await api.call('period.get',{id:period.id,asOf:period.asOf}));}}/>}
          {page === 'employees' && (
            <div className="page-section">
              <Toolbar search={search} setSearch={setSearch} center={center} setCenter={setCenter}
                centers={state.employees.map(e => e.costCenter)} count={employees.length}
                extraFilters={
                  <div className="filter-grid">
                    <div className="filter-item"><label>حالة الموظف</label><select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="">الكل</option><option value="active">نشط فقط</option><option value="inactive">متوقف فقط</option></select></div>
                    <div className="filter-item"><label>طريقة الدفع</label><select value={filterPayment} onChange={e=>setFilterPayment(e.target.value)}><option value="">الكل</option>{["نقدي","بنكي","فودافون كاش","إنستا باي","غير محدد"].map(m=><option key={m}>{m}</option>)}</select></div>
                    <div className="filter-item"><label>الوظيفة</label><select value={filterJob} onChange={e=>setFilterJob(e.target.value)}><option value="">كل الوظائف</option>{filterChoices('job').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>الإدارة</label><select value={filterDept} onChange={e=>setFilterDept(e.target.value)}><option value="">كل الإدارات</option>{filterChoices('department').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>الشركة التابع لها</label><select value={filterCompany} onChange={e=>setFilterCompany(e.target.value)}><option value="">كل الشركات</option>{filterChoices('employerCompany').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>الجنسية</label><select value={filterNationality} onChange={e=>setFilterNationality(e.target.value)}><option value="">كل الجنسيات</option>{filterChoices('nationality').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>النوع</label><select value={filterGender} onChange={e=>setFilterGender(e.target.value)}><option value="">الكل</option>{filterChoices('gender').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>نوع التعاقد</label><select value={filterContract} onChange={e=>setFilterContract(e.target.value)}><option value="">كل التعاقدات</option>{filterChoices('contractType').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>المؤهل</label><select value={filterQualification} onChange={e=>setFilterQualification(e.target.value)}><option value="">كل المؤهلات</option>{filterChoices('qualification').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>التعيين من</label><input type="date" value={filterStartAfter} onChange={e=>setFilterStartAfter(e.target.value)}/></div>
                    <div className="filter-item"><label>التعيين حتى</label><input type="date" value={filterStartBefore} onChange={e=>setFilterStartBefore(e.target.value)}/></div>
                    {(filterStatus||filterPayment||filterJob||filterDept||filterCompany||filterNationality||filterGender||filterContract||filterQualification||filterStartAfter||filterStartBefore)&&<button className="filter-reset" onClick={()=>{setFilterStatus("");setFilterPayment("");setFilterJob("");setFilterDept("");setFilterCompany("");setFilterNationality('');setFilterGender('');setFilterContract('');setFilterQualification('');setFilterStartAfter('');setFilterStartBefore('');}}>مسح الفلاتر</button>}
                  </div>
                }
              />
              <section className="card">
              {!employees.length ? (
                <Empty title="سجّل فريق العمل" text="ابدأ بملف العمال المرفق أو أضف موظفًا جديدًا."
                  action={<button className="secondary" onClick={chooseImport}>اختيار ملف العمال</button>}/>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>الموظف</th><th>الوظيفة</th><th>مركز التكلفة</th><th>الأساسي</th><th>طريقة الدفع</th><th>الحالة</th><th/></tr></thead>
                    <tbody>
                      {employees.map(e => (
                        <tr key={e.id}>
                          <td><b>{e.name}</b><small className="mono">{e.code}</small></td>
                          <td>{e.job || '—'}</td>
                          <td><span className="tag">{e.costCenter || 'غير محدد'}</span></td>
                          <td className="num">{e.basic ? money(Math.round(Number(e.basic) * 100)) : <span className="missing">غير مسجل</span>}</td>
                          <td>{e.paymentMethod}</td>
                          <td><Badge ok={e.active} text={e.active ? 'نشط' : 'متوقف'}/></td>
                          <td><button className="text-button" onClick={() => setEmployee(e)}>عرض وتعديل</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            </div>
          )}

          {/* ─────────── Payroll ─────────── */}
          {page === 'payroll' && <>
            {period&&<section className="card cutoff-card"><label className="field"><span>المستحق حتى تاريخ</span><input type="date" min={`${period.month}-01`} max={monthEnd(period.month)} value={period.asOf} onChange={e=>e.target.value&&run(async()=>setPeriod(await api.call('period.get',{id:period.id,asOf:e.target.value})))}/></label><div><small>صافي المستحق حتى التاريخ المحدد</small><h2>{money(period.entries.reduce((s,e)=>s+(e.accrued?.net||0),0))} جنيه</h2><small>القيم أدناه تخص تسوية الشهر كاملة. التفاصيل اليومية في المتابعة اليومية.</small>{period.entries.some(e=>!e.accrued)&&<b className="deduct"> إجمالي جزئي: توجد بيانات تحتاج مراجعة</b>}</div></section>}
            <div className="month-bar">
              <div className="actions">
                <Icon name="wallet"/>
                <select aria-label="كشف الشهر" value={period?.id || ''} onChange={e => run(() => openPeriod(e.target.value))}>
                  <option value="" disabled>اختر كشف الشهر</option>
                  {state.periods.map(p => <option key={p.id} value={p.id}>{monthName(p.month)}</option>)}
                </select>
                {period && <Badge ok={period.status === 'approved'} text={period.status === 'approved' ? 'معتمد' : 'مسودة'}/>}
              </div>
              {period && (
                <div className="actions">
                  <button className="secondary" onClick={() => setExporting(true)}>
                    <Icon name="print"/>طباعة وتصدير
                  </button>
                  {period.status === 'draft' ? (
                    <>
                      <button className="secondary" disabled={busy} onClick={() => setConfirm({
                        title: 'مزامنة الموظفين',
                        body: 'سيتم جلب أي موظفين جدد تمت إضافتهم ولا يتواجدون في كشف هذا الشهر، مع الحفاظ على بيانات من هم بالكشف.',
                        action: async () => { setPeriod(await api.call('period.sync', period.id)); await refresh(); notify('تمت مزامنة الموظفين بنجاح'); }
                      })}>
                        <Icon name="users"/>مزامنة
                      </button>
                      {isAdmin && (
                        <button className="danger-btn" disabled={busy} onClick={() => setDeletePeriodConfirm(true)}>
                          <Icon name="trash"/>حذف الكشف
                        </button>
                      )}
                      <button className="primary" disabled={!isAdmin || busy} onClick={() => setConfirm({
                      title: 'اعتماد رواتب الشهر',
                      body: 'ستُحفظ نسخة احتياطية وتُقفل أرقام هذا الشهر. تأكد من مراجعة كل الموظفين؛ لا يمكن تعديل النسخة المعتمدة مباشرة.',
                      action: async () => { setPeriod(await api.call('period.approve', period.id)); await refresh(); notify('تم اعتماد كشف الشهر وحفظ نسخة احتياطية'); }
                    })}>
                      <Icon name="check"/>{isAdmin?'اعتماد الشهر':'الاعتماد بواسطة الأدمن'}
                    </button>
                    </>
                  ) : (
                    <button className="secondary" disabled={!selected.length} onClick={() => setConfirm({
                      title: 'تسجيل صرف الرواتب',
                      body: `تأكيد صرف كامل الصافي إلى ${selected.length} موظف محدد؟`,
                      action: async () => { setPeriod(await api.call('period.pay', { periodId: period.id, ids: selected })); await refresh(); notify('تم تسجيل الصرف'); }
                    })}>
                      تسجيل صرف المحدد
                    </button>
                  )}
                </div>
              )}
            </div>
            {!period ? <Empty title="لم تختَر كشفًا بعد" text="أنشئ كشفًا بعد تسجيل الموظفين لإدخال متغيرات الشهر."/> : <>
              <div className="stats three">
                <Stat title="الاستحقاقات" value={money(total('gross'))} subtitle="جنيه مصري" icon="wallet"/>
                <Stat title="الاستقطاعات" value={money(total('deductions'))} subtitle="جنيه مصري" icon="chart"/>
                <Stat title="صافي المستحق" value={money(total('net'))} subtitle={`${period.entries.length} موظف · ${pending.length} يحتاج مراجعة`} icon="check" warm/>
              </div>
              {period.entries.some(e => !e.result) && <div className="alert">الأرقام المعروضة إجماليات جزئية. أكمل الأساسي والحقول الناقصة لإظهار جميع الرواتب.</div>}
              <div className="page-section">
                <Toolbar search={search} setSearch={setSearch} center={center} setCenter={setCenter}
                  centers={period.entries.map(e => e.snapshot.costCenter)} count={entries.length}
                  extraFilters={<div className="filter-grid">
                    <div className="filter-item"><label>الوظيفة</label><select value={payFilterJob} onChange={e=>setPayFilterJob(e.target.value)}><option value="">كل الوظائف</option>{periodChoices('job').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>الإدارة</label><select value={payFilterDept} onChange={e=>setPayFilterDept(e.target.value)}><option value="">كل الإدارات</option>{periodChoices('department').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>الشركة</label><select value={payFilterCompany} onChange={e=>setPayFilterCompany(e.target.value)}><option value="">كل الشركات</option>{periodChoices('employerCompany').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>طريقة الدفع</label><select value={payFilterPayment} onChange={e=>setPayFilterPayment(e.target.value)}><option value="">كل طرق الدفع</option>{periodChoices('paymentMethod').map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="filter-item"><label>حالة المراجعة</label><select value={payFilterReview} onChange={e=>setPayFilterReview(e.target.value)}><option value="">الكل</option><option value="reviewed">تمت المراجعة</option><option value="pending">بانتظار المراجعة</option></select></div>
                    <div className="filter-item"><label>حالة الصرف</label><select value={payFilterPaid} onChange={e=>setPayFilterPaid(e.target.value)}><option value="">الكل</option><option value="paid">تم الصرف</option><option value="unpaid">لم يُصرف</option></select></div>
                    <div className="filter-item"><label>حالة الموظف وقت المسير</label><select value={payFilterWorkStatus} onChange={e=>setPayFilterWorkStatus(e.target.value)}><option value="">الكل</option><option value="active">نشط</option><option value="inactive">متوقف</option></select></div>
                    <div className="filter-item"><label>الأساسي من (جنيه)</label><input type="number" min="0" step="0.01" value={payBasicMin} onChange={e=>setPayBasicMin(e.target.value)}/></div>
                    <div className="filter-item"><label>الأساسي إلى (جنيه)</label><input type="number" min="0" step="0.01" value={payBasicMax} onChange={e=>setPayBasicMax(e.target.value)}/></div>
                    <div className="filter-item"><label>الاستحقاقات من (جنيه)</label><input type="number" min="0" step="0.01" value={payGrossMin} onChange={e=>setPayGrossMin(e.target.value)}/></div>
                    <div className="filter-item"><label>الاستحقاقات إلى (جنيه)</label><input type="number" min="0" step="0.01" value={payGrossMax} onChange={e=>setPayGrossMax(e.target.value)}/></div>
                    <div className="filter-item"><label>الاستقطاعات من (جنيه)</label><input type="number" min="0" step="0.01" value={payDeductionMin} onChange={e=>setPayDeductionMin(e.target.value)}/></div>
                    <div className="filter-item"><label>الاستقطاعات إلى (جنيه)</label><input type="number" min="0" step="0.01" value={payDeductionMax} onChange={e=>setPayDeductionMax(e.target.value)}/></div>
                    <div className="filter-item"><label>الصافي من (جنيه)</label><input type="number" step="0.01" value={payNetMin} onChange={e=>setPayNetMin(e.target.value)}/></div>
                    <div className="filter-item"><label>الصافي إلى (جنيه)</label><input type="number" step="0.01" value={payNetMax} onChange={e=>setPayNetMax(e.target.value)}/></div>
                    {(payFilterJob||payFilterDept||payFilterCompany||payFilterPayment||payFilterReview||payFilterPaid||payFilterWorkStatus||payBasicMin||payBasicMax||payGrossMin||payGrossMax||payDeductionMin||payDeductionMax||payNetMin||payNetMax)&&<button className="filter-reset" onClick={()=>{setPayFilterJob('');setPayFilterDept('');setPayFilterCompany('');setPayFilterPayment('');setPayFilterReview('');setPayFilterPaid('');setPayFilterWorkStatus('');setPayBasicMin('');setPayBasicMax('');setPayGrossMin('');setPayGrossMax('');setPayDeductionMin('');setPayDeductionMax('');setPayNetMin('');setPayNetMax('');}}>مسح الفلاتر</button>}
                  </div>}
                />
                <section className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th><input aria-label="تحديد النتائج" type="checkbox"
                          checked={entries.length > 0 && entries.every(e => selected.includes(e.id))}
                          onChange={e => setSelected(e.target.checked ? entries.map(x => x.id) : [])}/></th>
                        <th>الموظف</th><th>مركز التكلفة</th><th>الأساسي</th>
                        <th>الاستحقاقات</th><th>الاستقطاعات</th><th>الصافي</th>
                        <th>المراجعة</th><th/>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(e => {
                        const denominator=period.policy?.formulas.daysInMonth??30;
                        const eligibleDays=accrualDays(period.month,monthEnd(period.month),e.inputs.accrualStartDate||e.snapshot.startDate,e.snapshot.endDate,denominator);
                        return <tr key={e.id}>
                          <td><input type="checkbox" aria-label={`تحديد ${e.snapshot.name}`}
                            checked={selected.includes(e.id)} onChange={ev => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter(id => id !== e.id))}/></td>
                          <td><b>{e.snapshot.name}</b><small>{e.snapshot.job || e.snapshot.code}</small></td>
                          <td><span className="tag">{e.snapshot.costCenter || 'غير محدد'}</span></td>
                          <td className="num">{e.result ? <>{money(e.result.amounts.basic)}{eligibleDays<denominator&&<small>{eligibleDays}/{denominator} يوم استحقاق</small>}{e.snapshot.basic&&e.snapshot.basic!==e.inputs.basic&&<small>أساسي الملف: {money(Math.round(Number(e.snapshot.basic)*100))}</small>}</> : '—'}</td>
                          <td className="num">{e.result ? money(e.result.gross) : '—'}</td>
                          <td className="num muted">{e.result ? money(e.result.deductions) : '—'}</td>
                          <td className={`num strong ${e.result && e.result.net < 0 ? 'negative' : ''}`}>{e.result ? money(e.result.net) : 'غير مكتمل'}</td>
                          <td><Badge ok={!!e.checked && !!e.result && e.result.net >= 0} text={e.paid ? 'تم الصرف' : e.checked ? 'تمت المراجعة' : 'بانتظار المراجعة'}/></td>
                          <td><button className="text-button" onClick={() => setEditEntry(e)}>{period.status === 'draft' ? 'تحرير' : 'تفاصيل'}</button></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                {!entries.length && <Empty title="لا توجد نتائج" text="غيّر البحث أو تأكد من تسجيل موظفين مؤهلين عند إنشاء الشهر."/>}
                <div className="table-footer">
                  <span>{selected.length ? `${selected.length} موظف محدد` : 'اختر موظفين للطباعة أو الصرف الجماعي'}</span>
                  <span>الأرقام بالجنيه المصري</span>
                </div>
              </section>
              </div>
            </>}
          </>}

          {/* ─────────── Reports ─────────── */}
          {page === 'reports' && <>
            <div className="month-bar">
              <select aria-label="شهر التقرير" value={period?.id || ''} onChange={e => run(() => openPeriod(e.target.value))}>
                <option value="" disabled>اختر شهر التقرير</option>
                {state.periods.map(p => <option key={p.id} value={p.id}>{monthName(p.month)}</option>)}
              </select>
              {period && <button className="secondary" onClick={() => setExporting(true)} style={{background:'#1C2A38',color:'white',border:'none'}}><Icon name="download"/> تصدير التقرير الشهري</button>}
            </div>
            {period ? <>
              {/* Summary Stats */}
              <div className="stats" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))'}}>
                <Stat title="إجمالي الاستحقاقات" value={money(total('gross'))} subtitle="جنيه مصري" icon="wallet"/>
                <Stat title="إجمالي الاستقطاعات" value={money(total('deductions'))} subtitle="جنيه مصري" icon="chart"/>
                <Stat title="صافي المستحق" value={money(total('net'))} subtitle={`${period.entries.length} موظف`} icon="check" warm/>
                <Stat title="صندوق الزمالة" value={money(period.entries.reduce((s,e)=>s+(e.result?.amounts.fellowship||0),0))} subtitle="استقطاعات الشهر" icon="users"/>
              </div>
              {/* Bar chart - cost centers */}
              <div className="reports-charts-row">
                <section className="card reports-chart-card">
                  <div className="card-head"><h3>توزيع الصافي حسب مركز التكلفة</h3><span>{monthName(period.month)}</span></div>
                  <div className="chart-body">
                    {(()=>{
                      const centers=Array.from(new Set(period.entries.map(e=>e.snapshot.costCenter||'غير محدد')));
                      const data=centers.map(cc=>({name:cc,net:period.entries.filter(e=>(e.snapshot.costCenter||'غير محدد')===cc).reduce((s,e)=>s+(e.result?.net||0),0),count:period.entries.filter(e=>(e.snapshot.costCenter||'غير محدد')===cc).length})).sort((a,b)=>b.net-a.net);
                      const maxNet=Math.max(...data.map(d=>d.net),1);
                      const COLORS=['#ec671b','#1c2a38','#4b9b83','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#84cc16'];
                      return <div className="bar-chart">{data.map((d,i)=><div key={d.name} className="bar-row"><div className="bar-label" title={d.name}>{d.name}</div><div className="bar-track"><div className="bar-fill" style={{width:`${(d.net/maxNet)*100}%`,background:COLORS[i%COLORS.length]}}></div></div><div className="bar-value">{money(d.net)}</div><div className="bar-count">{d.count} موظف</div></div>)}</div>;
                    })()}
                  </div>
                </section>
                <section className="card reports-chart-card">
                  <div className="card-head"><h3>توزيع طرق الصرف</h3><span>عدد الموظفين</span></div>
                  <div className="chart-body">
                    {(()=>{
                      const methods: Record<string, {count: number, net: number}> = {};
                      period.entries.forEach(e=>{const m=e.snapshot.paymentMethod||'غير محدد';if(!methods[m])methods[m]={count:0,net:0};methods[m].count++;methods[m].net+=e.result?.net||0;});
                      const total_pm=Object.values(methods).reduce((a,b)=>a+b.count,0)||1;
                      const COLORS_PM=['#ec671b','#1c2a38','#4b9b83','#8b5cf6','#f59e0b'];
                      const entries_pm=Object.entries(methods).sort((a,b)=>b[1].count-a[1].count);
                      let offset=0;const r=78;const circ=2*Math.PI*r;
                      return <div className="donut-chart-wrap"><svg viewBox="0 0 200 200" className="donut-svg">{entries_pm.map(([m,v],i)=>{const pct=v.count/total_pm;const dash=pct*circ;const el=<circle key={m} cx="100" cy="100" r={r} fill="none" stroke={COLORS_PM[i%COLORS_PM.length]} strokeWidth="30" strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset*circ} style={{transform:'rotate(-90deg)',transformOrigin:'50% 50%'}}/>;offset+=pct;return el;})}<text x="100" y="95" textAnchor="middle" style={{fontSize:18,fontWeight:700,fill:'#1c2a38'}}>{period.entries.length}</text><text x="100" y="113" textAnchor="middle" style={{fontSize:10,fill:'#85909c'}}>موظف</text></svg><div className="donut-legend">{entries_pm.map(([m,v],i)=><div key={m} className="legend-item"><span className="legend-dot" style={{background:COLORS_PM[i%COLORS_PM.length]}}></span><span className="legend-label">{m}</span><span className="legend-val">{v.count} موظف</span></div>)}</div></div>;
                    })()}
                  </div>
                </section>
              </div>
              {/* Employee comparison bars */}
              <section className="card">
                <div className="card-head"><h3>مقارنة الاستحقاقات والاستقطاعات — أعلى 10 موظفين</h3><span>بالجنيه المصري</span></div>
                <div className="chart-body" style={{padding:'20px 24px'}}>
                  {(()=>{
                    const sorted=[...period.entries].filter(e=>e.result).sort((a,b)=>b.result!.net-a.result!.net).slice(0,10);
                    const maxG=Math.max(...sorted.map(e=>e.result!.gross),1);
                    return <div className="employee-bars">{sorted.map(e=><div key={e.id} className="emp-bar-row"><div className="emp-bar-name">{e.snapshot.name}</div><div className="emp-bar-tracks"><div className="emp-bar-track"><div className="emp-bar-gross" style={{width:`${(e.result!.gross/maxG)*100}%`}}></div><span>{money(e.result!.gross)}</span></div><div className="emp-bar-track deduct"><div className="emp-bar-deduct" style={{width:`${(e.result!.deductions/maxG)*100}%`}}></div><span className="muted">{money(e.result!.deductions)}</span></div></div><div className="emp-bar-net">{money(e.result!.net)}</div></div>)}<div className="chart-legend-row"><span><span className="legend-dot" style={{background:'#ec671b'}}></span>الاستحقاقات</span><span><span className="legend-dot" style={{background:'#f4c7b0'}}></span>الاستقطاعات</span><span className="muted">الرقم الأخضر = الصافي</span></div></div>;
                  })()}
                </div>
              </section>
              <section className="card">
                <div className="card-head"><h3>تفصيل تكلفة مراكز العمل</h3><span>{monthName(period.month)}</span></div>
                <table>
                  <thead><tr><th>مركز التكلفة</th><th>عدد الموظفين</th><th>الاستحقاقات</th><th>الاستقطاعات</th><th>الصافي</th><th>نسبة التكلفة</th></tr></thead>
                  <tbody>
                    {(()=>{
                      const totalG=total('gross')||1;
                      return Array.from(new Set(period.entries.map(e=>e.snapshot.costCenter))).map(cc=>{
                        const group=period.entries.filter(e=>e.snapshot.costCenter===cc);
                        const g=group.reduce((s,e)=>s+(e.result?.gross||0),0);
                        const d=group.reduce((s,e)=>s+(e.result?.deductions||0),0);
                        const n=group.reduce((s,e)=>s+(e.result?.net||0),0);
                        const pct=Math.round((g/totalG)*100);
                        return <tr key={cc}><td><b>{cc||'غير محدد'}</b></td><td>{group.length}</td><td className="num">{money(g)}</td><td className="num muted">{money(d)}</td><td className="num strong">{money(n)}</td><td><div className="pct-bar-wrap"><div className="pct-bar" style={{width:`${pct}%`}}></div><span>{pct}%</span></div></td></tr>;
                      });
                    })()}
                  </tbody>
                </table>
              </section>
            </> : <Empty title="التقارير تبدأ من أول كشف" text="أنشئ كشف الشهر لعرض تكلفة المشاريع والسلف والصندوق."/>}
          </>}

          {/* ─────────── Settings ─────────── */}
          {page === 'admin' && isAdmin && <AdminPanel isSuperAdmin={isSuperAdmin} state={state} onChanged={async()=>{const next=await refresh();setSelected([]);setEditEntry(null);if(period&&next.periods.some(p=>p.id===period.id))await openPeriod(period.id);else setPeriod(null);}}/>}
          {page === 'settings' && <>
            <div className="settings-grid">
              {isAdmin&&<SettingsForm initial={state.settings} busy={busy} save={s => run(async () => {
                await api.call('settings.save', s); await refresh();
                if (period) await openPeriod(period.id);
                notify('تم حفظ إعدادات الشركة');
              })}/>}<PasswordPanel/>
              <section className="card settings-card">
                <Icon name="lock" size={26}/>
                <h3>نسخة أخرى. راحة أكبر.</h3>
                <p>قاعدة البيانات محفوظة خارج مجلد البرنامج. لاستخدامها من حساب Windows أو جهاز آخر، احفظ نسخة احتياطية هنا ثم استعدها هناك؛ نقل البرنامج وحده لا ينقل البيانات.</p>
                <button className="primary full" disabled={busy} onClick={() => run(async () => { const file = await api.call('backup.create'); if (file) notify('حُفظت النسخة الاحتياطية بنجاح'); })}>
                  <Icon name="download"/>حفظ نسخة احتياطية
                </button>
                {isAdmin&&<button className="secondary full" disabled={busy} onClick={() => run(async () => {
                  if (await api.call('backup.restore')) { await refresh();setPeriod(null);notify('تمت استعادة بيانات العمل مع الاحتفاظ بحسابات الدخول الحالية.'); }
                })}>
                  استعادة نسخة سابقة
                </button>}
                <div className="path">
                  <small>مجلد البيانات المحلية</small>
                  <code>{state.dataPath}</code>
                </div>
                <p className="muted">تُحفظ نسخة تلقائية يومية وقبل اعتماد أي شهر.</p>
              </section>
            </div>
            <section className="card">
              <div className="card-head"><h3>سجل العمليات</h3><span>آخر 100 عملية</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>التاريخ</th><th>العملية</th></tr></thead>
                  <tbody>
                    {state.audit.map(a => (
                      <tr key={a.id}>
                        <td>{new Date(a.at).toLocaleString('ar-EG')}</td>
                        <td>{a.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>}

          {/* ─────────── Formulas ─────────── */}
          {isAdmin && page === 'formulas' && (
            <FormulasForm
              key={state.settings.formulas.revision} initial={state.settings.formulas || { livingDayRate: 75, fellowshipRate: 0.01, fellowshipMin: 50, daysInMonth: 30, workingHours: 8, delayByHours: true, customFields: [] }}
              busy={busy}
              save={formulas => run(async () => {
                await api.call('settings.save', { ...state.settings, formulas });
                await refresh();
                if(period)setPeriod(await api.call('period.get',{id:period.id,asOf:period.asOf}));notify('حُفظ إصدار القواعد وأُعيدت المسودات للمراجعة');
              })}
            />
          )}

          <footer className="app-footer">
            <span>كيان · إدارة الرواتب</span>
            <span>{cloudStatus?.configured?'بيانات الشركة المشتركة':'محلي وآمن الوصول'} · {state.employees.length} سجل موظف</span>
          </footer>
        </div>
      </main>

      {/* ── Modals ── */}
      {employee && (
        <EmployeeForm employee={employee} busy={busy} onClose={() => setEmployee(null)}
          save={v => run(async () => { await api.call('employee.save', v); setEmployee(null); await refresh(); if (period) { const p = await api.call('period.get', period.id); setPeriod(p); } notify('تم حفظ بيانات الموظف. الكشوف الموجودة تحتفظ بلقطتها التاريخية.'); })}
          remove={() => setConfirm({ title: 'حذف سجل الموظف', body: 'سيختفي الموظف من قوائم العمل والكشوف الجديدة. تبقى الرواتب والحركات السابقة محفوظة بأسمه ولا تُحذف. الإيقاف متاح أيضًا من حالة الموظف إذا أردت إعادته للعمل لاحقًا.', action: async () => { await api.call('employee.delete', employee.id); setEmployee(null); await refresh();if(period)await openPeriod(period.id); notify('حُذف الموظف من قوائم العمل وحُفظ تاريخه'); } })}
          onExport={v => { setExportingEmployees([v as Employee]); }}
        />
      )}
      {exportingEmployees && (
        <EmployeeExportModal 
          employees={exportingEmployees} 
          busy={busy}
          onClose={() => setExportingEmployees(null)}
          onExport={(format, fields, includeSalary) => run(async () => {
            const file = await api.call(`employee.export.${format}`, { ids: exportingEmployees.map(e => e.id), includeSalary, fields });
            if (file && format !== 'print') notify(`تم التصدير بنجاح`);
            if (format !== 'print') setExportingEmployees(null);
          })} 
        />
      )}
      {editEntry && period && (
        <EntryForm entry={editEntry} period={period} busy={busy} close={() => setEditEntry(null)}
          save={v => run(async () => { const p = await api.call('entry.save', v); setPeriod(p); setEditEntry(null); await refresh(); notify('تم حفظ راتب الموظف'); })}
        />
      )}
      {newMonth && (
        <Modal title="إنشاء كشف جديد" onClose={() => setNewMonth(false)}>
          <div className="modal-body">
            <p className="muted">سيضاف الموظفون المؤهلون حسب حالة العمل وتواريخ التعيين والانتهاء.</p>
            <Field label="شهر الرواتب">
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} min="2000-01" max="2099-12"/>
            </Field>
            <div className="alert">أكمل الموظفين أولًا. تعديل الأساسي في ملف الموظف لا يغير الكشوف الموجودة.</div>
          </div>
          <div className="modal-foot">
            <button className="secondary" onClick={() => setNewMonth(false)}>إلغاء</button>
            <button className="primary" disabled={busy || !month || !state.employees.length} onClick={() => run(async () => {
              const p = await api.call('period.create', month);
              setPeriod(p); setSelected([]); await refresh();
              setNewMonth(false); changePage('payroll'); notify('تم إنشاء كشف الشهر');
            })}>إنشاء الكشف</button>
          </div>
        </Modal>
      )}
      {deletePeriodConfirm && period && (
        <Modal title="حذف كشف الرواتب" onClose={() => { setDeletePeriodConfirm(false); setDeletePeriodInput(''); }}>
          <div className="modal-body">
            <div className="delete-period-warning">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <strong>تحذير: هذا الإجراء لا يمكن التراجع عنه</strong>
                <p>سيُحذف كشف <b>{monthName(period.month)}</b> بما يشمل جميع بيانات الرواتب المدخلة ({period.entries.length} موظف). الحركات اليومية المرتبطة بهذا الشهر ستبقى محفوظة.</p>
                <p>ستُحفظ نسخة احتياطية تلقائياً قبل الحذف.</p>
              </div>
            </div>
            <Field label={`لتأكيد الحذف، اكتب اسم الشهر: ${monthName(period.month)}`}>
              <input
                id="delete-period-confirm-input"
                type="text"
                placeholder={monthName(period.month)}
                value={deletePeriodInput}
                onChange={e => setDeletePeriodInput(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="modal-foot">
            <button className="secondary" onClick={() => { setDeletePeriodConfirm(false); setDeletePeriodInput(''); }}>إلغاء</button>
            <button
              className="danger-btn"
              disabled={busy || deletePeriodInput.trim() !== monthName(period.month)}
              onClick={() => run(async () => {
                const deletedId = period.id;
                await api.call('period.delete', deletedId);
                setPeriod(null);
                setSelected([]);
                await refresh();
                setDeletePeriodConfirm(false);
                setDeletePeriodInput('');
                changePage('dashboard');
                notify('تم حذف الكشف بنجاح');
              })}
            >
              <Icon name="trash" size={16}/>تأكيد الحذف
            </button>
          </div>
        </Modal>
      )}
      {imported && (
        <Modal title="مراجعة استيراد الموظفين" wide onClose={() => setImported(null)}>
          <div className="modal-body">
            <p>{imported.filename} · {imported.rows.length} سجل أولي · {importIds.length} محدد</p>
            <div className="alert">السجلات التي قد تمثل إيجارات أو جهات غير محددة تلقائيًا. راجع الاختيار.</div>
            <div className="import-table table-wrap">
              <table>
                <thead><tr><th>اختيار</th><th>الاسم</th><th>الوظيفة / المشروع</th><th>ملاحظات المراجعة</th></tr></thead>
                <tbody>
                  {imported.rows.map(r => (
                    <tr key={r.row}>
                      <td><input type="checkbox" disabled={r.duplicate} checked={importIds.includes(r.row)} onChange={e => setImportIds(e.target.checked ? [...importIds, r.row] : importIds.filter(x => x !== r.row))}/></td>
                      <td><b>{r.name}</b><small>صف {r.row}{r.duplicate ? ' · مستورد مسبقًا' : ''}</small></td>
                      <td>{r.job}<small>{r.costCenter}</small></td>
                      <td className="import-warning">{r.warnings.join(' · ') || 'جاهز للاستيراد'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-foot">
            <span>الأساسي يُدخل يدويًا بعد الاستيراد.</span>
            <button className="primary" disabled={busy || !importIds.length} onClick={() => run(async () => {
              const n = await api.call('import.commit', { token: imported.token, rows: importIds });
              setImported(null); await refresh(); notify(`تم استيراد ${n} موظف`);
            })}>استيراد {importIds.length} سجل محدد</button>
          </div>
        </Modal>
      )}
      {exporting && period && (
        <ExportModal period={period} ids={page === 'reports' ? period.entries.map(e => e.id) : (selected.length ? selected : entries.map(e => e.id))}
          defaultTemplate={page === 'reports' ? 'monthly' : 'slip'}
          busy={busy} close={() => setExporting(false)}
          perform={(method, opts) => run(async () => {
            const result = await api.call(method, opts);
            if (result) notify(method === 'export.print' ? 'تم إرسال المستند للطابعة' : 'تم تصدير الملف بنجاح');
          })}
        />
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="modal-body"><p>{confirm.body}</p></div>
          <div className="modal-foot">
            <button className="secondary" onClick={() => setConfirm(null)}>إلغاء</button>
            <button className="primary" disabled={busy} onClick={() => run(async () => { await confirm.action(); setConfirm(null); })}>تأكيد</button>
          </div>
        </Modal>
      )}
      {bulk && period && (
        <BulkEditor period={period} ids={selected.length ? selected : entries.map(e => e.id)}
          busy={busy} close={() => setBulk(false)}
          save={items => run(async () => { setPeriod(await api.call('entry.saveBatch', items)); setBulk(false); await refresh(); notify('تم حفظ الدفعة؛ راجع الرواتب قبل الاعتماد'); })}
        />
      )}
      {toast}
      {busy && <div className="busy-line"/>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App/>);
