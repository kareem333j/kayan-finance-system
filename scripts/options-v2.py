from pathlib import Path
p=Path('scripts/smoke.mjs');s=p.read_text('utf-8').replace("name:'إنشاء مسير شهر'","name:'إنشاء كشف شهر'").replace("name:'إنشاء المسير'","name:'إنشاء الكشف'");p.write_text(s,'utf-8')
p=Path('src/renderer/main.tsx');s=p.read_text('utf-8').replace('تعيين أو انتهاء خلال هذا الشهر. راجع الأساسي المستحق يدويًا؛ لا يُخفض تلقائيًا.','تعيين أو انتهاء خلال هذا الشهر. أدخل الأساسي الشهري الكامل؛ يحسب الاستحقاق الجزئي تلقائيًا من تواريخ العمل.');s=s.replace("{ key: 'penalties', label: 'جزاءات أخرى', group: 'الاستقطاعات' },", "{ key: 'penalties', label: 'جزاءات أخرى', group: 'الاستقطاعات' },\n  {key:'dailyDeduction',label:'خصومات يومية بمبلغ',group:'الاستقطاعات'},")
a=s.index('const DEFAULT_REGISTER_COLS:');b=s.index('\n',a);s=s[:a]+"const DEFAULT_REGISTER_COLS: RegisterColumn[] = ['code', 'name', 'costCenter', 'basic', 'gross', 'deductions', 'net', 'signature'];"+s[b:];p.write_text(s,'utf-8')
p=Path('src/main/exports.ts');s=p.read_text('utf-8');s=s.replace('  const line = (e: Entry, k: AmountKey) => {', "  const show=(key:string)=>!opts.slipFields||opts.slipFields.includes(key);\n  const line = (e: Entry, k: AmountKey) => {\n    if(!show(k))return '';")
s=s.replace('size: ${opts.paper};',"size: ${opts.paper}${opts.template==='register'?' landscape':''};")
a=s.index('    const cols: RegisterColumn[]');b=s.index('\n\n',a);s=s[:a]+"    const cols: RegisterColumn[] = opts.registerColumns || ['code','name','costCenter','basic','gross','deductions','net','signature'];\n    if(!cols.length||cols.length>20)throw new Error('اختر من عمود واحد إلى 20 عمودًا للكشف الجدولي');"+s[b:]
s=s.replace("fellowship: 'صندوق الزمالة', penalties: 'جزاءات',", "fellowship: 'صندوق الزمالة', penalties: 'جزاءات',dailyDeduction:'خصومات يومية',")
s=s.replace("'fellowship', 'penalties', 'gross'", "'fellowship', 'penalties', 'dailyDeduction', 'gross'")
s=s.replace('    const numCols = new Set', "    if(cols.some(c=>!Object.hasOwn(colLabel,c))||new Set(cols).size!==cols.length)throw new Error('أعمدة التصدير غير صالحة أو مكررة');\n    const numCols = new Set")
# wrap employee info cells in selected-field guards
for key,label in [('name','اسم الموظف'),('job','الوظيفة'),('costCenter','مركز التكلفة')]:
 needle=f'          <div class="emp-cell">\n            <div class="lbl">{label}</div>'
 a=s.index(needle);b=s.index('\n          </div>',a)+len('\n          </div>');block=s[a:b];s=s[:a]+"${show('"+key+"')?`"+block+"`:''}"+s[b:]
s=s.replace('${esc(e.snapshot.code)} · ${esc(e.snapshot.paymentMethod)}', "${show('code')?esc(e.snapshot.code):''} ${show('paymentMethod')?esc(e.snapshot.paymentMethod):''}")
s=s.replace("${e.inputs.note ?", "${show('note') && e.inputs.note ?")
s=s.replace("${opts.template !== 'compact' && opts.template !== 'register' ? docFooter(e.id) : docFooter(e.id)}", "${show('signs')?'<div class=\"signatures\"><span>توقيع الموظف: ................</span><span>المراجعة: ................</span></div>':''}\n        ${opts.slipFields?'<small>الإجماليات تشمل جميع البنود حتى غير المعروضة.</small>':''}${docFooter(e.id)}")
s=s.replace('    .cutoff-banner{', '    .signatures{display:flex;justify-content:space-between;margin:10px 0;font-size:11px}.register-wrap{min-height:0}.reg-table{table-layout:fixed}.reg-table th,.reg-table td{overflow-wrap:anywhere;font-size:10px;padding:7px 4px}.reg-table td.num{font-size:10px;white-space:normal}\n    .cutoff-banner{')
p.write_text(s,'utf-8')
