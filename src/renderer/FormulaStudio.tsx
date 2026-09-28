import { useState } from 'react';
import { calculate,emptyInputs,defaultExpressions,defaultFormulas,labels,money,type AmountKey } from '../domain/payroll';
import type { FormulaSettings } from '../shared/types';

// Constants shown in the "basics" tab with their labels and variable names
const constantNames:[keyof FormulaSettings,string,string,string][]=[
  ['daysInMonth','مقام أجر اليوم (المقام الافتراضي للحسابات اليومية)','daysInMonth','رقم بين 1 و31 — عادةً 30'],
  ['workingHours','ساعات العمل اليومية (تُستخدم في تحويل ساعات التأخير إلى أيام)','workingHours','رقم بين 1 و24 — عادةً 8'],
  ['livingDayRate','قيمة يوم الإعاشة (جنيه)','livingDayRate','قيمة ثابتة لكل يوم إعاشة'],
  ['fellowshipRate','نسبة صندوق الزمالة (0.01 = 1%)','fellowshipRate','نسبة من الراتب الأساسي'],
  ['fellowshipMin','الحد الأدنى لصندوق الزمالة (جنيه)','fellowshipMin','يُطبق المبلغ الأعلى بين النسبة والحد الأدنى'],
];

export default function FormulaStudio({initial,busy,save}:{initial:FormulaSettings;busy:boolean;save:(s:FormulaSettings)=>void}){
 const [v,setV]=useState<FormulaSettings>({...defaultFormulas,...initial});
 const [sample,setSample]=useState('6000');
 const [delayHoursSample,setDelayHoursSample]=useState('4');
 const [tab,setTab]=useState('basic');
 const [confirmed,setConfirmed]=useState(false);
 const set=(next:FormulaSettings)=>{setV(next);setConfirmed(false);};

 // Live preview with 3 assignment days, 20 living days, 1 absence day, and delay hours from sample
 let result:ReturnType<typeof calculate>|undefined,error='';
 try{result=calculate({...emptyInputs(sample),assignmentMode:'days',assignmentDays:'3',livingDays:'20',absenceDays:'1',delayUnit:'hours',delayQuantity:delayHoursSample},v,true);}catch(e:any){error=e.message;}

 // Verify that the delay calculation is correct: N hours at basic salary
 const delayVerify=()=>{
   const wh=v.workingHours||8;const dim=v.daysInMonth||30;const b=Number(sample)||6000;
   const dayVal=b/dim;const hrVal=dayVal/wh;
   return {dayValue:dayVal,hourValue:hrVal,expected:hrVal*Number(delayHoursSample)};
 };
 const dv=delayVerify();

 return <div className="formula-studio"><div className="formula-intro"><div><span className="eyebrow">معادلات واضحة. نتائج قابلة للمراجعة.</span><h2>قواعد الرواتب</h2><p>حساب عشري دقيق، وفحص للأخطاء والمراجع الدائرية. لا تتحول المعادلة الخاطئة إلى صفر.</p></div><span className="badge ok">إصدار السياسة {initial.revision||1}</span></div>
 <div className="studio-tabs"><button className={tab==='basic'?'active':''} onClick={()=>setTab('basic')}>الثوابت</button><button className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>قواعد الحقول</button><button className={tab==='custom'?'active':''} onClick={()=>setTab('custom')}>حقول إضافية</button></div>
 <div className="studio-layout"><section className="card settings-card">
 {tab==='basic'&&<><h3>الثوابت القابلة للتحكم</h3>
   <div className="form-grid">{constantNames.map(([key,title,symbol,hint])=><label className="field" key={key}><span>{title}</span><input type="number" step="any" value={String(v[key])} onChange={e=>set({...v,[key]:e.target.value===''?NaN:Number(e.target.value)})}/><small dir="ltr">{symbol}</small>{hint&&<small className="muted">{hint}</small>}</label>)}</div>
   <label className="field"><span>احتساب المبالغ الشهرية حتى اليوم</span><select value={v.monthlyAccrual||'onDate'} onChange={e=>set({...v,monthlyAccrual:e.target.value as any})}><option value="onDate">المبلغ كاملًا من تاريخ سريانه</option><option value="prorated">توزيع المبلغ على أيام الشهر</option></select><small>يشمل التكليف المباشر والحافز والمواصلات وأخرى. الإضافات اليومية تُحسب في تاريخها.</small></label>
   <div className="alert"><b>✔ قاعدة التأخير الصحيحة:</b> الساعات تُحوَّل تلقائيًا إلى أيام بقسمتها على <b>ساعات العمل اليومية ({v.workingHours||8})</b> قبل الحساب. مثال: {delayHoursSample} ساعة ÷ {v.workingHours||8} = {(Number(delayHoursSample)/(v.workingHours||8)).toFixed(4)} يوم × (أساسي ÷ {v.daysInMonth||30}) = <b>{(dv.hourValue*Number(delayHoursSample)).toFixed(2)} جنيه</b> عند أساسي {sample}.</div>
   <h3>ثوابت إضافية</h3>{Object.entries(v.constants||{}).map(([key,value])=><div className="actions" key={key}><code>{key}</code><input aria-label={key} value={value} onChange={e=>set({...v,constants:{...v.constants,[key]:e.target.value}})}/><button className="text-button" onClick={()=>{const next={...v.constants};delete next[key];set({...v,constants:next});}}>حذف</button></div>)}<button className="secondary" onClick={()=>{let i=1;while(v.constants?.[`rate_${i}`])i++;set({...v,constants:{...v.constants,[`rate_${i}`]:'0'}});}}>إضافة ثابت</button>
 </>}
 {tab==='rules'&&<><h3>طريقة حساب كل بند</h3><p className="muted">اترك القاعدة الافتراضية، أو اكتب معادلة مخصصة. <code>basic</code> = الراتب الشهري المرجعي، <code>accrualRatio</code> = نسبة الفترة المستحقة، <code>delayDays</code> = ساعات التأخير محوّلة إلى أيام تلقائيًا.</p>
 {(Object.keys(labels) as AmountKey[]).map(key=><div className="rule-editor" key={key}><div><b>{labels[key]}</b><button className="text-button" onClick={()=>{const next={...v.expressions};delete next[key];set({...v,expressions:next});}}>استعادة الافتراضي</button></div>
   <input aria-label={`معادلة ${labels[key]}`} dir="ltr" value={v.expressions?.[key]??defaultExpressions[key]} onChange={e=>set({...v,expressions:{...v.expressions,[key]:e.target.value}})}/>
   <small>الناتج في المثال: {result?money(result.amounts[key]):'—'} جنيه</small>
   {key==='delay'&&<small className="muted">⚠ المتغير <code>delayDays</code> = إجمالي التأخير محوّلًا إلى أيام (ساعات اليومية ÷ workingHours). <code>delayHours</code> = عدد الساعات الخام. <code>delayQuantity</code> = نفس <code>delayDays</code> للتوافق.</small>}
   {key==='absence'&&<small className="muted">المتغير <code>absenceDays</code> = مجموع أيام الغياب الشهرية + اليومية.</small>}
 </div>)}
 <details><summary>مرجع المتغيرات والدوال</summary><p>العمليات + − * / والأقواس. الدوال: MIN، MAX، ROUND، ABS، CEIL، FLOOR.</p>
 <code className="variable-list">basic · daysInMonth · workingHours · accrualRatio · elapsedDays · livingDays · livingDayRate · absenceDays · delayDays · delayHours · delayQuantity (=delayDays) · assignmentBase · incentiveInput · transportInput · otherInput · advanceInput · penaltiesInput · dailyIncentive · dailyTransport · dailyOther · dailyAssignment · dailyAdvance · dailyDeductionInput · fellowshipRate · fellowshipMin</code>
 </details></>}
 {tab==='custom'&&<><h3>حقول الشركة الإضافية</h3><p className="muted">استحقاق أو استقطاع بمعادلة، قيمة ثابتة، أو إدخال يدوي في كل راتب.</p>{v.customFields.map((f,i)=><div className="custom-rule" key={f.id}><div className="form-grid"><label className="field"><span>اسم الحقل</span><input value={f.name} onChange={e=>set({...v,customFields:v.customFields.map((x,j)=>i===j?{...x,name:e.target.value}:x)})}/></label><label className="field"><span>النوع</span><select value={f.type} onChange={e=>set({...v,customFields:v.customFields.map((x,j)=>i===j?{...x,type:e.target.value as any}:x)})}><option value="earning">استحقاق</option><option value="deduction">استقطاع</option></select></label></div><div className="actions"><code>{f.id}</code><select value={f.mode||'formula'} onChange={e=>set({...v,customFields:v.customFields.map((x,j)=>i===j?{...x,mode:e.target.value as any}:x)})}><option value="formula">معادلة</option><option value="fixed">رقم ثابت</option><option value="manual">إدخال شهري</option></select><button className="danger" onClick={()=>set({...v,customFields:v.customFields.filter((_,j)=>j!==i)})}>إزالة الحقل</button></div>{f.mode!=='manual'&&<input className="formula-input" dir="ltr" value={f.mode==='fixed'?f.value||'0':f.formula} onChange={e=>set({...v,customFields:v.customFields.map((x,j)=>i===j?{...x,[f.mode==='fixed'?'value':'formula']:e.target.value}:x)})}/>}<small>المعاينة: {result?money(result.customAmounts[f.id]||0):'—'} جنيه</small></div>)}<button className="secondary" onClick={()=>set({...v,customFields:[...v.customFields,{id:`field_${Date.now()}`,name:'حقل جديد',type:'earning',mode:'formula',formula:'basic * 0.05'}]})}>إضافة حقل</button></>}
 </section>
 <aside className="card settings-card formula-preview">
   <span className="eyebrow">اختبر قبل الحفظ</span><h3>محاكاة الحساب</h3>
   <label className="field"><span>الأساسي التجريبي</span><input value={sample} onChange={e=>setSample(e.target.value)}/></label>
   <label className="field"><span>ساعات التأخير التجريبية</span><input type="number" min="0" max="24" step="0.5" value={delayHoursSample} onChange={e=>setDelayHoursSample(e.target.value)}/><small>لاختبار صحة حساب خصم التأخير</small></label>
   <p>تكليف 3 أيام، إعاشة 20 يومًا، غياب يوم، وتأخير {delayHoursSample} ساعة. القيم الأخرى صفر.</p>
   {error?<div role="alert" className="alert error">{error}</div>:result&&<>
     <div className="calc-line"><span>الاستحقاقات</span><b>{money(result.gross)}</b></div>
     <div className="calc-line"><span>الاستقطاعات</span><b>{money(result.deductions)}</b></div>
     <div className="calc-line"><span>خصم التأخير ({delayHoursSample}h)</span><b style={{color:'#c0392b'}}>{money(result.amounts.delay)}</b></div>
     <div className="calc-line muted"><span style={{fontSize:12}}>{result.explanations.delay}</span></div>
     <div className="calc-net"><small>الصافي التجريبي</small><strong>{money(result.net)}</strong></div>
   </>}
   <label className="review-checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>راجعت التغييرات. تطبّق على المسودات وتعيدها للمراجعة؛ الشهور المعتمدة لا تتغير.</span></label>
   <button className="primary full" disabled={busy||!!error||!confirmed} onClick={()=>save(v)}>حفظ إصدار القواعد</button>
   <small>تُسجل السياسة السابقة والجديدة في سجل العمليات.</small>
 </aside>
 </div></div>;
}
