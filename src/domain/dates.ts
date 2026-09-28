export function todayLocal(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function validDate(s:string){if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
export function monthEnd(month:string){const [y,m]=month.split('-').map(Number);return `${month}-${new Date(Date.UTC(y,m,0)).getUTCDate()}`;}
export function defaultCutoff(month:string){const today=todayLocal();return today.slice(0,7)===month?today:month<today.slice(0,7)?monthEnd(month):`${month}-01`;}
// 30-day payroll clock: day 31 adds no salary; the final day of February completes 30.
export function accrualDays(month:string,cutoff:string,startDate='',endDate='',denominator=30){
  const end=monthEnd(month);const cap=cutoff>end?end:cutoff;
  const start=startDate&&startDate>`${month}-01`?startDate:`${month}-01`;
  const stop=endDate&&endDate<cap?endDate:cap;if(start>stop)return 0;
  if(start===`${month}-01`&&stop===end)return denominator;
  const count=(Date.parse(stop+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000+1;
  return Math.min(count,denominator);
}
