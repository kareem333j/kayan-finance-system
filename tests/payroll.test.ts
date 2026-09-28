import { describe,it,expect } from 'vitest';
import { calculate,emptyInputs,numeric } from '../src/domain/payroll';
const settings = { livingDayRate:75, fellowshipRate:0.01, fellowshipMin:50, daysInMonth:30, workingHours:8, delayByHours:true, customFields: [] };
describe('محرك الرواتب',()=>{
  it.each([['3000',5000],['5000',5000],['5000.50',5001],['100000',100000]])('صندوق الزمالة %s',(basic,fund)=>expect(calculate(emptyInputs(basic),settings).amounts.fellowship).toBe(fund));
  it('يطبق مثال الشهر كاملًا دون جمع أيام الغياب',()=>{const r=calculate({...emptyInputs('6000'),assignmentMode:'days',assignmentDays:'3',incentive:'500',livingDays:'20',transport:'300',other:'100',advance:'1000',absenceDays:'2',delayUnit:'days',delayQuantity:'1'},settings);expect([r.gross,r.deductions,r.net]).toEqual([900000,166000,734000]);});
  it('ساعتان خصم تأخير عند أساسي 6000 وعمل 8 ساعات = 50 جنيه',()=>expect(calculate({...emptyInputs('6000'),delayQuantity:'2'},settings).amounts.delay).toBe(5000));
  it('لا تقريب مبكر لأجر اليوم',()=>expect(calculate({...emptyInputs('10000'),assignmentMode:'days',assignmentDays:'3'},settings).amounts.assignment).toBe(100000));
  it('يدعم الأيام الكسرية',()=>expect(calculate({...emptyInputs('6000'),absenceDays:'1.5'},settings).amounts.absence).toBe(30000));
  it('المبلغ صفر لا يفعّل الأيام القديمة',()=>expect(calculate({...emptyInputs('6000'),assignmentDays:'3'},settings).amounts.assignment).toBe(0));
  it.each([['٦٠٠٠','6000'],['6,000.00','6000'],['٦٬٠٠٠٫٠٠','6000'],['۰٫۵','0.5']])('يفهم %s',(input,output)=>expect(numeric(input)).toBe(output));
  it.each(['','-1','1,5','Infinity','NaN','=1+2','1.001','1e3'])('يرفض %s',(input)=>expect(()=>numeric(input)).toThrow());
  it('يمنع الجزاءات غير المفعلة',()=>expect(()=>calculate({...emptyInputs('6000'),penalties:'10',note:'سبب'},settings)).toThrow());
  it('يشترط سبب الجزاءات',()=>expect(()=>calculate({...emptyInputs('6000'),penalties:'10'},settings,true)).toThrow());
  it('زيادة كل استحقاق مباشر ترفع الصافي بالقيمة نفسها',()=>{const base=calculate(emptyInputs('6000'),settings);for(const k of ['incentive','transport','other','assignmentAmount'])expect(calculate({...emptyInputs('6000'),[k]:'12.34'},settings).net-base.net).toBe(1234);});
  it('السلفة تخفض الصافي بنفس قيمتها',()=>expect(calculate(emptyInputs('6000'),settings).net-calculate({...emptyInputs('6000'),advance:'12.34'},settings).net).toBe(1234));
});
