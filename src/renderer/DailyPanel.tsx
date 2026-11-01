import {useEffect,useState} from 'react';
import type {State,DailyRecord,DailyKind,Period,Employee} from '../shared/types';
import {dailyLabels,employeeCompanies} from '../shared/types';
import {todayLocal} from '../domain/dates';
import {money} from '../domain/payroll';

const displayQuantity=(record:DailyRecord)=>{if(record.kind!=='delay')return record.quantity;const minutes=Math.round(Number(record.quantity)*60);return `${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`;};

export default function DailyPanel({state,onChanged}:{state:State;onChanged:()=>Promise<void>}){
 const [date,setDate]=useState(todayLocal());
 const [records,setRecords]=useState<DailyRecord[]>([]);
 const [period,setPeriod]=useState<Period|null>(null);
 const [search,setSearch]=useState('');
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [center,setCenter]=useState('');
 const [company,setCompany]=useState('');
 const [department,setDepartment]=useState('');
 const [job,setJob]=useState('');
 const [payment,setPayment]=useState('');
 const [gender,setGender]=useState('');
 const [contractType,setContractType]=useState('');
 const [workStatus,setWorkStatus]=useState('');
 const [recordKind,setRecordKind]=useState('');
 const [recordStatus,setRecordStatus]=useState('');
 const [form,setForm]=useState<any>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const reload=async()=>{const value=await window.payroll.call('daily.overview',{date});setRecords(value.records);setPeriod(value.period);};
 useEffect(()=>{reload().catch(e=>setMessage(e.message));},[date,state.employees.length]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();await onChanged();await reload();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}};
 const normalizedSearch=search.trim().toLocaleLowerCase('ar-EG');
 const matchesEmployee=(e:Partial<Employee>)=>{
  const searchable=Object.values(e).filter(value=>typeof value==='string'||typeof value==='number').join(' ').toLocaleLowerCase('ar-EG');
  return (!normalizedSearch||searchable.includes(normalizedSearch))&&(!center||e.costCenter===center)&&(!company||e.employerCompany===company)&&(!department||e.department===department)&&(!job||e.job===job)&&(!payment||e.paymentMethod===payment)&&(!gender||e.gender===gender)&&(!contractType||e.contractType===contractType)&&(!workStatus||(workStatus==='active'?!!e.active:!e.active));
 };
 const monthSnapshots=period?.entries.map(e=>e.snapshot)||[];
 const knownInSnapshot=new Set(monthSnapshots.map(e=>e.id));
 const dailyEmployees=[...monthSnapshots,...state.employees.filter(e=>!knownInSnapshot.has(e.id))];
 const employees=dailyEmployees.filter(e=>(e.active||!!e.endDate&&e.endDate>=date)&&(!e.startDate||e.startDate<=date)&&(!e.endDate||e.endDate>=date)&&matchesEmployee(e));
 const start=(id:string,kind:DailyKind)=>setForm({requestId:crypto.randomUUID(),employeeId:id,date,kind,quantity:kind==='absence'||kind==='doubleAbsence'?'1':'',note:''});
 const active=records.filter(r=>!r.voided);
 const accrued=period?.entries.reduce((s,e)=>s+(e.accrued?.net||0),0)||0;
 const employeeForRecord=(r:DailyRecord)=>period?.entries.find(e=>e.employeeId===r.employeeId)?.snapshot||state.employees.find(e=>e.id===r.employeeId);
 const visibleRecords=records.filter(r=>r.date<=date&&(!recordKind||r.kind===recordKind)&&(!recordStatus||(recordStatus==='voided'?r.voided:!r.voided))&&matchesEmployee(employeeForRecord(r)||{}));
 const distinct=(key:keyof Employee)=>Array.from(new Set(dailyEmployees.map(e=>String(e[key]||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ar'));
 const hasFilters=!!(center||company||department||job||payment||gender||contractType||workStatus||recordKind||recordStatus);

 return <>
  <div className="daily-banner">
   <div><span className="eyebrow">المتابعة اليومية</span><h2>نسجّل الاستثناء… والباقي حاضر</h2><p>لا تحتاج تسجيل حضور يومي. الغياب والخصومات والإضافات فقط هي التي تغيّر الحساب.</p></div>
   <div><label className="field"><span>اليوم المعروض</span><input type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/></label><button className="text-button" onClick={()=>setDate(todayLocal())}>العودة إلى اليوم</button></div>
  </div>
  <div className="stats three">
   <section className="stat"><span>حاضرون افتراضيًا اليوم</span><strong>{employees.filter(e=>!active.some(r=>r.date===date&&r.employeeId===e.id&&(r.kind==='absence'||r.kind==='doubleAbsence'))).length}</strong><small>غياب جزئي يظهر ضمن المسجلين غيابًا</small></section>
   <section className="stat"><span>حركات مسجلة في اليوم</span><strong>{active.filter(r=>r.date===date).length}</strong><small>السجلات الملغاة محفوظة ولا تدخل الحساب</small></section>
   <section className="stat warm"><span>صافي المستحق حتى {date}</span><strong>{money(accrued)}</strong><small>{period?.entries.some(e=>!e.accrued)?'إجمالي جزئي — بيانات ناقصة':'يشمل الأساسي المستحق والحركات حتى التاريخ'}</small></section>
  </div>
  {message&&<div role="alert" className="alert error">{message}</div>}
  {!period&&<div className="alert">لم يُنشأ كشف هذا الشهر بعد. <button className="text-button" disabled={busy} onClick={()=>run(async()=>{await window.payroll.call('period.create',date.slice(0,7));})}>إنشاء كشف وربط المتابعة</button></div>}
  <div className="toolbar-wrap sticky-toolbar daily-filter-bar">
   <div className="toolbar"><div className="search"><span aria-hidden="true">⌕</span><input aria-label="بحث المتابعة اليومية" placeholder="بحث بالاسم أو الكود أو الإدارة أو بيانات الموظف…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button className="search-clear" onClick={()=>setSearch('')} aria-label="مسح البحث">×</button>}</div><button className={'filter-toggle '+(filtersOpen?'active':'')} onClick={()=>setFiltersOpen(value=>!value)} title="فلاتر المتابعة"><span aria-hidden="true">☷</span>{filtersOpen?'إخفاء الفلاتر':'فلاتر'}{hasFilters&&<b>{[center,company,department,job,payment,gender,contractType,workStatus,recordKind,recordStatus].filter(Boolean).length}</b>}</button><span className="toolbar-count">{employees.length} موظف · {visibleRecords.length} حركة</span></div>
   {filtersOpen&&<div className="advanced-filters"><div className="filter-grid">
    <div className="filter-item"><label>مركز التكلفة</label><select value={center} onChange={e=>setCenter(e.target.value)}><option value="">كل المراكز</option>{distinct('costCenter').map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="filter-item"><label>الشركة</label><select value={company} onChange={e=>setCompany(e.target.value)}><option value="">كل الشركات</option>{employeeCompanies.map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="filter-item"><label>الإدارة</label><select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">كل الإدارات</option>{distinct('department').map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="filter-item"><label>الوظيفة</label><select value={job} onChange={e=>setJob(e.target.value)}><option value="">كل الوظائف</option>{distinct('job').map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="filter-item"><label>طريقة الدفع</label><select value={payment} onChange={e=>setPayment(e.target.value)}><option value="">كل طرق الدفع</option>{distinct('paymentMethod').map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="filter-item"><label>النوع</label><select value={gender} onChange={e=>setGender(e.target.value)}><option value="">الكل</option>{distinct('gender').map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="filter-item"><label>نوع التعاقد</label><select value={contractType} onChange={e=>setContractType(e.target.value)}><option value="">كل التعاقدات</option>{distinct('contractType').map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="filter-item"><label>حالة الحركة</label><select value={recordStatus} onChange={e=>setRecordStatus(e.target.value)}><option value="">كل الحركات</option><option value="active">سارية</option><option value="voided">ملغاة</option></select></div>
    <div className="filter-item"><label>نوع الحركة</label><select value={recordKind} onChange={e=>setRecordKind(e.target.value)}><option value="">كل الأنواع</option>{Object.entries(dailyLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
    <div className="filter-item"><label>حالة الموظف</label><select value={workStatus} onChange={e=>setWorkStatus(e.target.value)}><option value="">الكل</option><option value="active">نشط</option><option value="inactive">متوقف</option></select></div>
    {hasFilters&&<button className="filter-reset" onClick={()=>{setCenter('');setCompany('');setDepartment('');setJob('');setPayment('');setGender('');setContractType('');setWorkStatus('');setRecordKind('');setRecordStatus('');}}>مسح الفلاتر</button>}
   </div></div>}
  </div>
  <section className="card daily-employees-card">
   <div className="table-wrap"><table><thead><tr><th>الموظف / المشروع</th><th>حالة اليوم</th><th>المستحق حتى اليوم</th><th>تسجيل استثناء</th></tr></thead><tbody>
    {employees.map(e=>{const day=active.filter(r=>r.employeeId===e.id&&r.date===date);const entry=period?.entries.find(x=>x.employeeId===e.id);return <tr key={e.id}><td><b>{e.name}</b><small>{e.costCenter||'غير محدد'} · {e.code}</small></td><td>{day.length?day.map(r=><span className="tag" key={r.id}>{dailyLabels[r.kind]}: {displayQuantity(r)}</span>):<span className="badge ok">حاضر افتراضيًا · بلا خصم</span>}</td><td className="num strong">{entry?.accrued?money(entry.accrued.net):'بيانات غير مكتملة'}</td><td><div className="actions"><button className="text-button" disabled={busy||period?.status==='approved'} onClick={()=>start(e.id,'absence')}>غياب يوم</button><button className="text-button" disabled={busy||period?.status==='approved'} onClick={()=>start(e.id,'doubleAbsence')}>غياب يومين</button><button className="text-button" disabled={busy||period?.status==='approved'} onClick={()=>start(e.id,'delay')}>خصم ساعات</button><button className="text-button" disabled={busy||period?.status==='approved'} onClick={()=>start(e.id,'deduction')}>مبلغ / إضافة</button></div></td></tr>;})}
   </tbody></table></div>
  </section>
  <section className="card daily-history"><div className="card-head"><h3>سجل حركات الشهر</h3><span>حتى {date} — {visibleRecords.length} حركة</span></div><div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>الموظف</th><th>نوع الحركة</th><th>الكمية / المبلغ</th><th>السبب</th><th/></tr></thead><tbody>
   {visibleRecords.map(r=><tr key={r.id} className={r.voided?'voided':''}><td>{r.date}</td><td>{employeeForRecord(r)?.name||'موظف سابق'}</td><td>{dailyLabels[r.kind]}{r.voided?' — ملغاة':''}</td><td className="num">{displayQuantity(r)}</td><td>{r.note}</td><td>{!r.voided&&<button className="text-button" disabled={busy||period?.status==='approved'} onClick={()=>setForm({...r,cancelReason:''})}>تعديل / إلغاء</button>}</td></tr>)}
  </tbody></table></div>{!visibleRecords.length&&<div className="table-footer">لا توجد حركات مطابقة للبحث والفلاتر.</div>}</section>
  {form&&<div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-label="حركة يومية">
   <div className="modal-head"><h2>{form.id?'تعديل الحركة':'تسجيل حركة يومية'}</h2><button className="icon-btn" onClick={()=>setForm(null)}>×</button></div>
   <div className="modal-body"><h3>{state.employees.find(e=>e.id===form.employeeId)?.name}</h3>
    <div className="form-grid">
     <label className="field"><span>تاريخ الحركة</span><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
     <label className="field"><span>نوع الحركة</span><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{Object.entries(dailyLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    <label className="field"><span>{form.kind==='absence'||form.kind==='doubleAbsence'||form.kind==='living'?'عدد الأيام':form.kind==='delay'?'عدد الساعات':'المبلغ بالجنيه'}</span><input inputMode={form.kind==='delay'?'text':'decimal'} placeholder={form.kind==='delay'?'مثال: 2:45':'0'} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/><small>{form.kind==='delay'?`يمكن كتابة الوقت مثل 2:45 أو كرقم عشري. الساعة = أجر اليوم ÷ ${period?.policy?.formulas?.workingHours??8}.`:form.kind==='absence'?'يمكن تسجيل نصف يوم 0.5. لا خصم آخر لنفس الغياب.':form.kind==='doubleAbsence'?'كل يوم مسجل هنا يخصم أجر يومين.':''}</small></label>
    <label className="field"><span>السبب / البيان</span><textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
    {form.id&&<label className="field"><span>سبب الإلغاء — عند إلغاء الحركة فقط</span><input value={form.cancelReason||''} onChange={e=>setForm({...form,cancelReason:e.target.value})}/></label>}
    {message&&<div className="alert error">{message}</div>}
   </div>
   <div className="modal-foot">{form.id&&<button className="danger" disabled={busy||!form.cancelReason} onClick={()=>run(async()=>{await window.payroll.call('daily.void',{id:form.id,version:form.version,reason:form.cancelReason});setForm(null);})}>إلغاء الحركة</button>}<button className="primary" disabled={busy||!form.quantity||!form.note} onClick={()=>run(async()=>{await window.payroll.call('daily.save',form);setForm(null);})}>حفظ وربط بالراتب</button></div>
  </section></div>}
 </>;
}
