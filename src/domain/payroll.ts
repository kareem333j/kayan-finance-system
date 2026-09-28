import Decimal from 'decimal.js';
import { evaluateExpression } from './expression';
import type { FormulaSettings,DailyTotals } from '../shared/types';
Decimal.set({precision:32,rounding:Decimal.ROUND_HALF_UP});
export const CALCULATION_VERSION='2.0.0';
export type Inputs={basic:string;assignmentMode:'amount'|'days';assignmentAmount:string;assignmentDays:string;incentive:string;livingDays:string;transport:string;other:string;advance:string;absenceDays:string;delayUnit:'hours'|'days';delayQuantity:string;penalties:string;note:string;customValues?:Record<string,string>};
export const emptyInputs=(basic=''):Inputs=>({basic,assignmentMode:'amount',assignmentAmount:'0',assignmentDays:'0',incentive:'0',livingDays:'0',transport:'0',other:'0',advance:'0',absenceDays:'0',delayUnit:'hours',delayQuantity:'0',penalties:'0',note:'',customValues:{}});
export const labels={basic:'الراتب الأساسي',assignment:'أوامر التكليف',incentive:'حافز',living:'إعاشة',transport:'مواصلات',other:'أخرى',advance:'سلف',absence:'خصم الغياب',delay:'خصم التأخير',fellowship:'صندوق الزمالة',penalties:'جزاءات أخرى',dailyDeduction:'خصومات يومية بمبلغ'};
export type AmountKey=keyof typeof labels;
export const earningKeys:AmountKey[]=['basic','assignment','incentive','living','transport','other'];
export const deductionKeys:AmountKey[]=['advance','absence','delay','fellowship','penalties','dailyDeduction'];
export type Calculation={amounts:Record<AmountKey,number>;customAmounts:Record<string,number>;gross:number;deductions:number;net:number;explanations:Record<string,string>;version:string};
export const defaultFormulas:FormulaSettings={livingDayRate:75,fellowshipRate:0.01,fellowshipMin:50,daysInMonth:30,workingHours:8,delayByHours:false,customFields:[],expressions:{},constants:{},revision:1,monthlyAccrual:'onDate'};
// delayQuantity in formula context is always in DAYS (hours are converted via workingHours)
// Use delayDays (alias) or delayHours if you need hours in a custom expression
export const defaultExpressions:Record<AmountKey,string>={basic:'basic * accrualRatio',assignment:'assignmentBase + dailyAssignment',incentive:'incentiveInput + dailyIncentive',living:'livingDays * livingDayRate',transport:'transportInput + dailyTransport',other:'otherInput + dailyOther',advance:'advanceInput + dailyAdvance',absence:'absenceDays * basic / daysInMonth',delay:'delayDays * basic / daysInMonth',fellowship:'MAX(basic * fellowshipRate, fellowshipMin) * accrualRatio',penalties:'penaltiesInput',dailyDeduction:'dailyDeductionInput'};
export function numeric(value:unknown,label='القيمة'):string{
 let s=String(value??'').trim().replace(/[٠-٩]/g,x=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/[۰-۹]/g,x=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x))).replace(/٫/g,'.').replace(/٬/g,',');
 if(!s)throw new Error(`${label}: أدخل قيمة أو صفرًا`);if(s.includes(',')){if(!/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s))throw new Error(`${label}: فواصل الرقم غير واضحة`);s=s.replace(/,/g,'');}
 if(!/^\d+(\.\d{1,2})?$/.test(s))throw new Error(`${label}: رقم غير سالب حتى منزلتين عشريتين مطلوب`);const n=new Decimal(s);if(n.gt('1000000000'))throw new Error(`${label}: القيمة أكبر من الحد المدعوم`);return n.toFixed();
}
export function cents(value:Decimal.Value){const n=new Decimal(value).mul(100).toDecimalPlaces(0).toNumber();if(!Number.isSafeInteger(n))throw new Error('المبلغ يتجاوز دقة التخزين');return n;}
export const money=(n:number)=>(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export const emptyDaily=():DailyTotals=>({absence:'0',delay:'0',deduction:'0',incentive:'0',living:'0',transport:'0',other:'0',advance:'0',assignment:'0'});
export type CalculationContext={daily?:DailyTotals;accrualDays?:number;monthlyRatio?:string};
export function calculate(input:Inputs,provided:FormulaSettings=defaultFormulas,penaltiesEnabled=false,options:CalculationContext={}):Calculation{
 const settings={...defaultFormulas,...provided};const daily={...emptyDaily(),...options.daily};
 if(!['amount','days'].includes(input.assignmentMode)||!['hours','days'].includes(input.delayUnit))throw new Error('وحدة حساب غير صحيحة');
 const get=(key:keyof Inputs,label:string)=>new Decimal(numeric(input[key],label));const b=get('basic','الأساسي');
 if(!Number.isFinite(settings.daysInMonth)||settings.daysInMonth<=0||settings.daysInMonth>31)throw new Error('مقام أجر اليوم يجب أن يكون بين 1 و31');
 if(!Number.isFinite(settings.workingHours)||settings.workingHours<=0||settings.workingHours>24)throw new Error('ساعات العمل يجب أن تكون بين 1 و24');
 const ratio=options.accrualDays===undefined?new Decimal(1):new Decimal(options.accrualDays).div(settings.daysInMonth);
 const monthlyRatio=new Decimal(options.monthlyRatio??'1');const d=(key:keyof DailyTotals)=>new Decimal(numeric(daily[key],key));
 const penalty=get('penalties','الجزاءات');if(!penaltiesEnabled&&!penalty.isZero())throw new Error('الجزاءات غير مفعلة');if(!penalty.isZero()&&!input.note.trim())throw new Error('أضف سبب الجزاءات');
 const assignmentBase=input.assignmentMode==='amount'?get('assignmentAmount','التكليف').mul(monthlyRatio):get('assignmentDays','أيام التكليف').mul(b).div(settings.daysInMonth);
 // Convert delay input to days regardless of whether hours or days were entered
 // Daily delay records are stored as hours, so divide by workingHours to get days
 const delayInput=get('delayQuantity','التأخير');
 const delayDays=(input.delayUnit==='hours'?delayInput.div(settings.workingHours):delayInput).plus(d('delay').div(settings.workingHours));
 const delayHours=delayDays.mul(settings.workingHours);
 const context:Record<string,Decimal.Value>={basic:b,daysInMonth:settings.daysInMonth,workingHours:settings.workingHours,livingDayRate:settings.livingDayRate,fellowshipRate:settings.fellowshipRate,fellowshipMin:settings.fellowshipMin,accrualRatio:ratio,elapsedDays:options.accrualDays??settings.daysInMonth,assignmentBase,assignmentAmount:assignmentBase,assignmentDays:get('assignmentDays','أيام التكليف'),incentiveInput:get('incentive','الحافز').mul(monthlyRatio),transportInput:get('transport','المواصلات').mul(monthlyRatio),otherInput:get('other','أخرى').mul(monthlyRatio),advanceInput:get('advance','السلف'),penaltiesInput:penalty,livingDays:get('livingDays','أيام الإعاشة').plus(d('living')),absenceDays:get('absenceDays','الغياب').plus(d('absence')),delayQuantity:delayDays,delayDays,delayHours,dailyAssignment:d('assignment'),dailyIncentive:d('incentive'),dailyTransport:d('transport'),dailyOther:d('other'),dailyAdvance:d('advance'),dailyDeductionInput:d('deduction')};
 for(const [key,val] of Object.entries(settings.constants||{})){if(key in context||key in labels||!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key))throw new Error(`اسم ثابت محجوز أو غير صالح: ${key}`);context[key]=numeric(val,key);}
 for(const key of Object.keys(settings.expressions||{}))if(!Object.hasOwn(labels,key))throw new Error(`حقل معادلة غير معروف: ${key}`);
 const expressions={...defaultExpressions,...settings.expressions};const calculated:Record<string,Decimal>={};const resolving=new Set<string>();const fields=settings.customFields||[];
 const customMap=new Map(fields.map(f=>[f.id,f]));if(customMap.size!==fields.length)throw new Error('رموز الحقول المخصصة مكررة');
 for(const f of fields)if(f.id in context||f.id in labels||!/^[A-Za-z_][A-Za-z_0-9]*$/.test(f.id))throw new Error(`رمز حقل محجوز أو غير صالح: ${f.id}`);
 const resolve=(name:string):Decimal.Value=>{if(name in context)return context[name];if(calculated[name])return calculated[name];
   const field=customMap.get(name);const formula=field?(field.mode==='fixed'?numeric(field.value??'0',field.name):field.mode==='manual'?numeric(input.customValues?.[name]??'0',field.name):field.formula):expressions[name as AmountKey];
   if(formula===undefined)throw new Error(`متغير غير معروف: ${name}`);if(resolving.has(name))throw new Error(`مرجع دائري عند ${name}`);resolving.add(name);
   let value:Decimal;try{value=evaluateExpression(formula,resolve);}catch(e:any){throw new Error(`${field?.name||labels[name as AmountKey]||name}: ${e.message}`);}finally{resolving.delete(name);}
   if(!value.isFinite()||value.isNegative())throw new Error(`نتيجة سالبة أو غير صالحة للحقل ${field?.name||name}`);calculated[name]=value.toDecimalPlaces(2);return calculated[name];
 };
 const amounts={} as Record<AmountKey,number>;for(const key of Object.keys(labels) as AmountKey[]){const n=key==='basic'?evaluateExpression(expressions.basic,resolve):new Decimal(resolve(key));if(n.isNegative())throw new Error(`قيمة سالبة: ${labels[key]}`);amounts[key]=cents(n);}
 const customAmounts:Record<string,number>={};for(const f of fields)customAmounts[f.id]=cents(resolve(f.id));
 const gross=earningKeys.reduce((s,k)=>s+amounts[k],0)+fields.filter(f=>f.type==='earning').reduce((s,f)=>s+customAmounts[f.id],0);
 const deductions=deductionKeys.reduce((s,k)=>s+amounts[k],0)+fields.filter(f=>f.type==='deduction').reduce((s,f)=>s+customAmounts[f.id],0);
 if(![gross,deductions,gross-deductions].every(Number.isSafeInteger))throw new Error('الإجمالي يتجاوز دقة التخزين');
 const explanations:Record<string,string>={...expressions};for(const f of fields)explanations[f.id]=f.mode==='manual'?'قيمة إدخال شهرية':f.mode==='fixed'?`قيمة ثابتة ${f.value}`:f.formula;
 for(const key of Object.keys(labels) as AmountKey[])if(!settings.expressions?.[key]){
  explanations[key]=['basic','fellowship'].includes(key)?`نسبة الاستحقاق ${ratio.mul(100).toDecimalPlaces(2)}%`:['absence','living'].includes(key)?`${context[key==='absence'?'absenceDays':'livingDays']} يوم × ${key==='absence'?`(${input.basic} ÷ ${settings.daysInMonth})`:settings.livingDayRate}`:key==='dailyDeduction'?'مجموع الخصومات اليومية المسجلة بمبلغ':'قيمة شهرية + الحركات اليومية المستحقة';
 }
 // Build human-readable delay explanation showing hours and the equivalent days fraction
 explanations.delay=settings.expressions?.delay
   ?settings.expressions.delay
   :`${delayHours.toDecimalPlaces(2)} ساعة ÷ ${settings.workingHours} ساعة = ${delayDays.toDecimalPlaces(4)} يوم × (${input.basic} ÷ ${settings.daysInMonth})`;
 return {amounts,customAmounts,gross,deductions,net:gross-deductions,explanations,version:CALCULATION_VERSION};
}
