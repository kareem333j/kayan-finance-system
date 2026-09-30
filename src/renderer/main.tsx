import {employeeCompanies} from '../shared/types';

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
import icon from '../../assets/brand/icon.jpeg';
import pkg from '../../package.json';
import { calculate, emptyInputs, money, labels, earningKeys, deductionKeys, type Inputs } from '../domain/payroll';
import type { Employee, Period, Entry, State, ImportPreview, ExportOptions, FormulaSettings, RegisterColumn } from '../shared/types';

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

function Toolbar({ search, setSearch, center, setCenter, centers, count }: {
  search: string; setSearch: (s: string) => void;
  center: string; setCenter: (s: string) => void;
  centers: string[]; count: number;
}) {
  return (
    <div className="toolbar">
      <div className="search">
        <Icon name="search"/>
        <input aria-label="بحث" placeholder="ابحث بالاسم أو الكود أو الوظيفة…" value={search} onChange={e => setSearch(e.target.value)}/>
      </div>
      <select aria-label="مركز التكلفة" value={center} onChange={e => setCenter(e.target.value)}>
        <option value="">كل مراكز التكلفة</option>
        {[...new Set(centers)].filter(Boolean).sort().map(c => <option key={c}>{c}</option>)}
      </select>
      <span className="toolbar-count">{count} سجل</span>
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
          <small className="muted">الأساسي هنا يستخدم للكشوف الجديدة فقط. الاستحقاق الجزئي يحسب تلقائيًا حسب تاريخ التعيين وانتهاء العمل.</small>
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
  let result = entry.result, error = '';
  try { if (!locked) result = calculate(v, period.policy!.formulas, penaltiesEnabled,{daily:entry.daily,accrualDays:accrualDays(period.month,monthEnd(period.month),entry.snapshot.startDate,entry.snapshot.endDate,period.policy!.formulas.daysInMonth)}); } catch (e: any) { result = null; error = e.message; }
  const update = (k: keyof Inputs, value: string) => { setV({ ...v, [k]: value }); setChecked(false); };
  const f = (key: keyof Inputs, label: string, hint?: string) => (
    <Field key={key} label={label} hint={hint}>
      <input disabled={locked} inputMode="decimal" value={String(v[key]??'')} onChange={e => update(key, e.target.value)} className="number-input"/>
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
            <Field label="طريقة حساب التكليف">
              <select disabled={locked} value={v.assignmentMode} onChange={e => update('assignmentMode', e.target.value)}>
                <option value="amount">مبلغ مباشر</option><option value="days">عدد أيام</option>
              </select>
            </Field>
            {v.assignmentMode === 'amount' ? f('assignmentAmount', 'مبلغ التكليف') : f('assignmentDays', 'أيام التكليف', `عدد الأيام × الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            {f('incentive', 'الحافز')}
            {f('livingDays', 'أيام الإعاشة', `اليوم = ${period.policy?.formulas?.livingDayRate ?? 75} جنيهاً`)}
            {f('transport', 'المواصلات')}
            {f('other', 'استحقاقات أخرى')}
          </div>
          <h3 className="section-title">الاستقطاعات</h3>
          <div className="form-grid three-cols">
            {f('advance', 'السلف المخصومة هذا الشهر', 'مبلغ الخصم من المالية')}
            {f('absenceDays', 'أيام الغياب الإضافية غير المسجلة يوميًا', `عدد الأيام × الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            <Field label="وحدة التأخير">
              <select disabled={locked} value={v.delayUnit} onChange={e => update('delayUnit', e.target.value)}>
                <option value="hours">ساعات</option><option value="days">أيام</option>
              </select>
            </Field>
            {f('delayQuantity', v.delayUnit === 'hours' ? 'عدد ساعات التأخير' : 'عدد أيام التأخير', `الكمية × الأساسي ÷ ${period.policy?.formulas?.daysInMonth ?? 30}`)}
            {penaltiesEnabled && f('penalties', 'جزاءات أخرى', 'اكتب السبب في الملاحظات')}
          </div>
          <div className="alert">الحركات اليومية تُضاف تلقائيًا. المسجل: {entry.daily?.absence||0} يوم غياب، {entry.daily?.delay||0} ساعة خصم، {entry.daily?.deduction||0} جنيه خصم مباشر. أدخل هنا الإضافات الشهرية فقط حتى لا تتكرر الخصومات.</div><Field label="تاريخ سريان القيم المعدلة"><input type="date" min={`${period.month}-01`} max={monthEnd(period.month)} disabled={locked} value={effectiveDate} onChange={e=>{const date=e.target.value;setEffectiveDate(date);setChecked(false);if(date)api.call('period.get',{id:period.id,asOf:date}).then((p:Period)=>{const row=p.entries.find(x=>x.id===entry.id);if(row)setV(row.effectiveInputs||row.inputs);});}}/></Field>{period.policy?.formulas.customFields.filter(f=>f.mode==='manual').map(f=><Field key={f.id} label={f.name}><input disabled={locked} value={v.customValues?.[f.id]||'0'} onChange={e=>{setV({...v,customValues:{...v.customValues,[f.id]:e.target.value}});setChecked(false);}}/></Field>)}
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
        <div><span>التأخير بالساعات</span><b>الساعات × الأساسي ÷ 30</b></div>
        <div><span>صندوق الزمالة</span><b>{((v.formulas?.fellowshipRate ?? 0.01) * 100).toFixed(1)}%، بحد أدنى {v.formulas?.fellowshipMin ?? 50}</b></div>
      </div>
      <label className="review-checkbox">
        <input type="checkbox" checked={v.roundingAccepted} onChange={e => setV({ ...v, roundingAccepted: e.target.checked })}/>
        <span>اعتماد تقريب كل بند إلى قرشين بطريقة النصف لأعلى، ثم جمع البنود المعروضة.</span>
      </label>
      <label className="review-checkbox">
        <input type="checkbox" checked={v.penaltiesEnabled} onChange={e => setV({ ...v, penaltiesEnabled: e.target.checked })}/>
        <span>تفعيل «جزاءات أخرى» كمبلغ يدوي مع سبب إلزامي.</span>
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
  { key: 'incentive', label: 'حافز', group: 'الاستحقاقات' },
  { key: 'living', label: 'إعاشة', group: 'الاستحقاقات' },
  { key: 'transport', label: 'مواصلات', group: 'الاستحقاقات' },
  { key: 'other', label: 'أخرى', group: 'الاستحقاقات' },
  { key: 'advance', label: 'السلف', group: 'الاستقطاعات' },
  { key: 'absence', label: 'خصم الغياب', group: 'الاستقطاعات' },
  { key: 'delay', label: 'خصم التأخير', group: 'الاستقطاعات' },
  { key: 'fellowship', label: 'صندوق الزمالة', group: 'الاستقطاعات' },
  { key: 'penalties', label: 'جزاءات أخرى', group: 'الاستقطاعات' },
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

function ExportModal({ period, ids, busy, close, perform }: {
  period: Period; ids: string[]; busy: boolean;
  close: () => void;
  perform: (method: string, opts: ExportOptions) => void;
}) {
  const [opts, setOpts] = useState<ExportOptions>({
    periodId: period.id, entryIds: ids, template: 'slip', paper: 'A4',
    hideZeros: true, monochrome: false, explanations: true,asOf:period.asOf,view:'monthly',
    registerColumns: DEFAULT_REGISTER_COLS,
    slipFields: ALL_SLIP_FIELDS.map(f => f.key),
  });
  const [activeTab, setActiveTab] = useState<'general' | 'columns'>('general');
  const e = period.entries.find(en => ids.includes(en.id));

  const toggleRegCol = (col: RegisterColumn) => {
    const cols = opts.registerColumns || DEFAULT_REGISTER_COLS;
    setOpts({ ...opts, registerColumns: cols.includes(col) ? cols.filter(c => c !== col) : [...cols, col] });
  };

  const toggleSlipField = (field: string) => {
    const fields = opts.slipFields || ALL_SLIP_FIELDS.map(f => f.key);
    setOpts({ ...opts, slipFields: fields.includes(field) ? fields.filter(f => f !== field) : [...fields, field] });
  };

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

            <Field label="نطاق الحساب"><select value={opts.view} onChange={e=>setOpts({...opts,view:e.target.value as any})}><option value="monthly">تسوية الشهر كاملة</option><option value="accrued">المستحق حتى التاريخ المحدد</option></select></Field>{opts.view==='accrued'&&<Field label="تاريخ المستحق"><input type="date" min={`${period.month}-01`} max={monthEnd(period.month)} value={opts.asOf} onChange={e=>setOpts({...opts,asOf:e.target.value})}/></Field>}<Field label="قالب الطباعة">
              <select value={opts.template} onChange={e => setOpts({ ...opts, template: e.target.value as any, paper: e.target.value === 'compact' ? 'A4' : opts.paper })}>
                <option value="slip">قسيمة مفصلة لكل موظف</option>
                <option value="compact">قسيمتان على ورقة A4</option>
                <option value="register">كشف صرف جدولي (كل الموظفين)</option>
              </select>
            </Field>
            <Field label="حجم الورق">
              <select disabled={opts.template === 'compact'} value={opts.paper} onChange={e => setOpts({ ...opts, paper: e.target.value as any })}>
                <option>A4</option><option>A5</option>
              </select>
            </Field>
            {[
              ['hideZeros', 'إخفاء البنود الصفرية'],
              ['explanations', 'إظهار شرح الحساب في القسيمة'],
              ['monochrome', 'نسخة أبيض وأسود'],
            ].map(([key, label]) => (
              <label className="review-checkbox" key={key}>
                <input type="checkbox" checked={opts[key as keyof ExportOptions] as boolean}
                  onChange={e => setOpts({ ...opts, [key]: e.target.checked })}/>
                {label}
              </label>
            ))}
            <div className="alert" style={{ marginTop: 12 }}>
              ملف PDF يفتح بعد التصدير للمراجعة قبل الطباعة. Excel يحتوي شيتين: كشف إجمالي وقسائم تفصيلية.
            </div>
          </>}

          {activeTab === 'columns' && <>
            <div style={{ marginTop: 16 }}>
              {opts.template === 'register' ? (
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
          <div className="print-preview-label">معاينة القسيمة الأولى من {ids.length}</div>
          {e && e.result ? (
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
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 32, fontSize: 13 }}>
              {e ? 'أكمل بيانات الموظف أولاً لعرض المعاينة' : 'لا يوجد موظفون محددون'}
            </div>
          )}
        </div>
      </div>
      <div className="modal-foot">
        <span className="muted">كل المخرجات من نفس أرقام الشهر.</span>
        <div className="actions">
          <button className="secondary" disabled={busy || !ids.length} onClick={() => perform('export.excel', opts)}>
            <Icon name="download" size={15}/> تصدير Excel
          </button>
          <button className="secondary" disabled={busy || !ids.length} onClick={() => perform('export.pdf', opts)}>
            <Icon name="export" size={15}/> حفظ PDF
          </button>
          <button className="primary" disabled={busy || !ids.length} onClick={() => perform('export.print', opts)}>
            <Icon name="print" size={15}/> طباعة
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
  const [employee, setEmployee] = useState<Partial<Employee> | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [imported, setImported] = useState<ImportPreview | null>(null);
  const [importIds, setImportIds] = useState<number[]>([]);
  const [newMonth, setNewMonth] = useState(false);
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
  const refresh = async () => { const next = await api.call('state'); setState(next); return next as State; };
  const openPeriod = async (id: string) => { const p = await api.call('period.get', id); setPeriod(p); setSelected([]); setSearch(''); setCenter(''); };

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

  const entries = useMemo(() => period?.entries.filter(e =>
    (!search || norm(`${e.snapshot.name} ${e.snapshot.code} ${e.snapshot.job}`).includes(norm(search))) &&
    (!center || e.snapshot.costCenter === center)
  ) || [], [period, search, center]);

  const employees = useMemo(() => state?.employees.filter(e =>
    (!search || norm(`${e.name} ${e.code} ${e.job}`).includes(norm(search))) &&
    (!center || e.costCenter === center)
  ) || [], [state, search, center]);

  const total = (key: 'net' | 'gross' | 'deductions') => period?.entries.reduce((s, e) => s + (e.result?.[key] || 0), 0) || 0;
  const pending = period?.entries.filter(e => !e.checked || !e.result || e.result.net < 0 || e.result.amounts.basic === 0) || [];
  const changePage = (id: string) => { setPage(id); setSearch(''); setCenter(''); };

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
    <div className="login" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0f16', minHeight: '100vh', position: 'relative', overflow: 'hidden'}}>
      {/* Immersive Background Mesh */}
      <div style={{position: 'absolute', top: '-20%', left: '-10%', width: '70vw', height: '70vw', background: 'radial-gradient(circle, rgba(236,103,27,0.15) 0%, rgba(236,103,27,0) 60%)', filter: 'blur(60px)'}}></div>
      <div style={{position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(28,42,56,0.8) 0%, rgba(0,0,0,0) 60%)', filter: 'blur(60px)'}}></div>
      <div style={{position: 'absolute', top: '20%', right: '10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 50%)', filter: 'blur(40px)'}}></div>
      
      {/* Grid Pattern overlay */}
      <div style={{position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', maskImage: 'radial-gradient(circle at center, black, transparent 80%)', WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 80%)'}}></div>

      {/* Main Glassmorphic Card */}
      <div style={{background: 'rgba(255, 255, 255, 0.98)', padding: '60px 50px', borderRadius: '32px', boxShadow: '0 40px 80px -20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255,255,255,0.2)', width: '100%', maxWidth: '480px', zIndex: 1, textAlign: 'center', position: 'relative'}}>
        
        {/* Glow behind the logo */}
        <div style={{position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '120px', background: 'rgba(236,103,27,0.4)', filter: 'blur(35px)', borderRadius: '50%', zIndex: -1}}></div>

        <div style={{marginBottom: '40px'}}>
          <img src={icon} alt="كيان" style={{width: '140px', height: '140px', objectFit: 'contain', borderRadius: '28px', boxShadow: '0 16px 32px rgba(28, 42, 56, 0.12), 0 0 0 1px rgba(0,0,0,0.05)', marginBottom: '24px', backgroundColor: '#fff'}}/>
          <h1 style={{fontSize: '32px', color: '#0f172a', marginBottom: '12px', letterSpacing: '-0.5px', fontWeight: 800}}>نظام إدارة الرواتب</h1>
          <div style={{display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', color: '#475569', fontWeight: 600, border: '1px solid #e2e8f0'}}>
            <span style={{color: '#ec671b'}}>الإصدار {pkg.version}</span>
            <div style={{width: '4px', height: '4px', borderRadius: '50%', background: '#cbd5e1'}}></div>
            <span>{auth.cloud?'مساحة الشركة المشتركة':'مساحة عمل محلية'}</span>
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); signIn(); }} style={{textAlign: 'right'}}>
          <h2 style={{fontSize: '20px', marginBottom: '8px', color: '#1e293b', fontWeight: 700}}>{auth.configured ? 'تسجيل الدخول للمساحة' : 'إعداد مساحة العمل'}</h2>
          <p style={{fontSize: '13px', color: '#64748b', marginBottom: '30px', lineHeight: '1.7'}}>{auth.configured ? 'أدخل اسم المستخدم وكلمة المرور للوصول إلى النظام.' : 'أنشئ بيانات دخول قوية لحماية وصولك لبيانات الرواتب.'}</p>
          
          <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
            <Field label="اسم الدخول">
              <input value={username} disabled={!auth.configured} required onChange={e=>setUsername(e.target.value)} autoComplete="username" style={{background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px 16px', fontSize: '14px', borderRadius: '12px', color: '#0f172a', fontWeight: 500, transition: 'border-color 0.2s, box-shadow 0.2s'}}/>
            </Field>
            {!auth.configured && <small style={{color: '#94a3b8', fontSize: '11px', marginTop: '-12px', display: 'block'}}>الحساب الافتراضي للنظام هو: <strong style={{color: '#64748b'}}>admin</strong></small>}
            <Field label="كلمة المرور">
              <input type="password" autoFocus minLength={auth.configured ? 1 : 8} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="8 أحرف على الأقل" required style={{background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px 16px', fontSize: '14px', borderRadius: '12px', color: '#0f172a', fontWeight: 500, transition: 'border-color 0.2s, box-shadow 0.2s'}}/>
            </Field>
          </div>
          
          <button className="primary" disabled={busy} style={{width: '100%', marginTop: '35px', padding: '16px', fontSize: '15px', fontWeight: 700, borderRadius: '14px', background: 'linear-gradient(135deg, #ec671b 0%, #d9550c 100%)', boxShadow: '0 8px 20px rgba(236, 103, 27, 0.3)', border: 'none', transition: 'transform 0.2s, box-shadow 0.2s'}}>
            {busy ? 'جاري التحقق...' : (auth.configured ? 'دخول آمن' : 'حفظ بيانات الدخول')}
          </button>
        </form>
      </div>
      
      <div style={{position: 'absolute', bottom: '40px', color: '#94a3b8', fontSize: '12px', zIndex: 1, display: 'flex', alignItems: 'center', gap: '16px', fontWeight: 500}}>
        <span>جميع الحقوق محفوظة © كيان {new Date().getFullYear()}</span>
        <div style={{width: '4px', height: '4px', borderRadius: '50%', background: '#475569'}}></div>
        <span style={{display: 'flex', alignItems: 'center', gap: '8px'}}><div style={{width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 12px #10b981'}}></div> {cloudStatus?.configured?'جاهز للاتصال بالشركة':'متصل محلياً'}</span>
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
          <img src={logo}/>
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
            <section className="card">
              <Toolbar search={search} setSearch={setSearch} center={center} setCenter={setCenter}
                centers={state.employees.map(e => e.costCenter)} count={employees.length}/>
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
              <section className="card">
                <Toolbar search={search} setSearch={setSearch} center={center} setCenter={setCenter}
                  centers={period.entries.map(e => e.snapshot.costCenter)} count={entries.length}/>
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
                      {entries.map(e => (
                        <tr key={e.id}>
                          <td><input type="checkbox" aria-label={`تحديد ${e.snapshot.name}`}
                            checked={selected.includes(e.id)} onChange={ev => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter(id => id !== e.id))}/></td>
                          <td><b>{e.snapshot.name}</b><small>{e.snapshot.job || e.snapshot.code}</small></td>
                          <td><span className="tag">{e.snapshot.costCenter || 'غير محدد'}</span></td>
                          <td className="num">{e.result ? money(e.result.amounts.basic) : '—'}</td>
                          <td className="num">{e.result ? money(e.result.gross) : '—'}</td>
                          <td className="num muted">{e.result ? money(e.result.deductions) : '—'}</td>
                          <td className={`num strong ${e.result && e.result.net < 0 ? 'negative' : ''}`}>{e.result ? money(e.result.net) : 'غير مكتمل'}</td>
                          <td><Badge ok={!!e.checked && !!e.result && e.result.net >= 0} text={e.paid ? 'تم الصرف' : e.checked ? 'تمت المراجعة' : 'بانتظار المراجعة'}/></td>
                          <td><button className="text-button" onClick={() => setEditEntry(e)}>{period.status === 'draft' ? 'تحرير' : 'تفاصيل'}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!entries.length && <Empty title="لا توجد نتائج" text="غيّر البحث أو تأكد من تسجيل موظفين مؤهلين عند إنشاء الشهر."/>}
                <div className="table-footer">
                  <span>{selected.length ? `${selected.length} موظف محدد` : 'اختر موظفين للطباعة أو الصرف الجماعي'}</span>
                  <span>الأرقام بالجنيه المصري</span>
                </div>
              </section>
            </>}
          </>}

          {/* ─────────── Reports ─────────── */}
          {page === 'reports' && <>
            <div className="month-bar">
              <select aria-label="شهر التقرير" value={period?.id || ''} onChange={e => run(() => openPeriod(e.target.value))}>
                <option value="" disabled>اختر شهر التقرير</option>
                {state.periods.map(p => <option key={p.id} value={p.id}>{monthName(p.month)}</option>)}
              </select>
              {period && <button className="secondary" onClick={() => setExporting(true)}><Icon name="download"/>تصدير بيانات الشهر</button>}
            </div>
            {period ? <>
              <div className="stats three">
                <Stat title="صندوق الزمالة" value={money(period.entries.reduce((s, e) => s + (e.result?.amounts.fellowship || 0), 0))} subtitle="إجمالي استقطاعات الشهر" icon="users"/>
                <Stat title="السلف المخصومة" value={money(period.entries.reduce((s, e) => s + (e.result?.amounts.advance || 0), 0))} subtitle="خصم الشهر فقط، وليس الرصيد التاريخي" icon="wallet"/>
                <Stat title="المتبقي للصرف" value={money(period.entries.filter(e => !e.paid).reduce((s, e) => s + (e.result?.net || 0), 0))} subtitle="وفق تسجيل الصرف الكامل" icon="clock" warm/>
              </div>
              <section className="card">
                <div className="card-head"><h3>تكلفة مراكز العمل</h3><span>{monthName(period.month)}</span></div>
                <table>
                  <thead><tr><th>مركز التكلفة</th><th>عدد الموظفين</th><th>الاستحقاقات</th><th>الاستقطاعات</th><th>الصافي</th></tr></thead>
                  <tbody>
                    {Array.from(new Set(period.entries.map(e => e.snapshot.costCenter))).map(c => {
                      const group = period.entries.filter(e => e.snapshot.costCenter === c);
                      return (
                        <tr key={c}>
                          <td><b>{c || 'غير محدد'}</b></td>
                          <td>{group.length}</td>
                          <td className="num">{money(group.reduce((s, e) => s + (e.result?.gross || 0), 0))}</td>
                          <td className="num">{money(group.reduce((s, e) => s + (e.result?.deductions || 0), 0))}</td>
                          <td className="num strong">{money(group.reduce((s, e) => s + (e.result?.net || 0), 0))}</td>
                        </tr>
                      );
                    })}
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
                <p>احفظ نسخة على قرص خارجي لحماية العمل عند تعطل الجهاز. تشمل النسخة بيانات الرواتب وكلمة الدخول.</p>
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
          save={v => run(async () => { await api.call('employee.save', v); setEmployee(null); await refresh(); if (period) { const p = await api.call('period.get', period.id); setPeriod(p); } notify('تم حفظ بيانات الموظف وتحديثها في كشوف الرواتب المسودة.'); })}
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
        <ExportModal period={period} ids={selected.length ? selected : entries.map(e => e.id)}
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
