from pathlib import Path
p=Path('src/main/exports.ts');s=p.read_text('utf-8')
for marker,kind in [('    // Gross subtotal','earning'),('    // Deductions subtotal','deduction')]:
 s=s.replace(marker,"    custom.filter(f=>f.type==='"+kind+"').forEach(f=>{const amount=e.result!.customAmounts?.[f.id]||0;if(opts.hideZeros&&!amount)return;const row=slipSheet.getRow(slipRow++);row.values=[f.name,amount/100,'',e.result!.explanations[f.id]||''];row.getCell(2).numFmt='#,##0.00';row.height=22;});\n"+marker)
needle='  return Buffer.from(await book.xlsx.writeBuffer());'
s=s.replace(needle,'''  if(opts.registerColumns?.length){
    const cols=opts.registerColumns;const names:Record<string,string>={code:'الكود',name:'الاسم',job:'الوظيفة',costCenter:'مركز التكلفة',paymentMethod:'طريقة الدفع',...labels,gross:'إجمالي الاستحقاقات',deductions:'إجمالي الاستقطاعات',net:'الصافي',signature:'التوقيع',...Object.fromEntries(custom.map(f=>[f.id,f.name]))};
    if(cols.some(c=>!Object.hasOwn(names,c))||new Set(cols).size!==cols.length)throw new Error('أعمدة غير صالحة');
    const view=book.addWorksheet('كشف حسب الاختيار',{views:[{rightToLeft:true,state:'frozen',ySplit:2}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});view.mergeCells(1,1,1,cols.length);view.getCell(1,1).value=`${company} — ${p.month}${p.view==='accrued'?` حتى ${p.asOf}`:''}`;view.addRow(cols.map(c=>names[c]));
    for(const e of rows)view.addRow(cols.map(c=>c==='signature'?'':['gross','deductions','net'].includes(c)?e.result![c as 'net']/100:Object.hasOwn(e.result!.amounts,c)?e.result!.amounts[c as AmountKey]/100:Object.hasOwn(e.result!.customAmounts||{},c)?e.result!.customAmounts[c]/100:String(e.snapshot[c as keyof typeof e.snapshot]??'')));
    view.columns.forEach(c=>{c.width=22;c.numFmt='#,##0.00';});view.eachRow((r,n)=>{r.height=n===1?32:27;r.eachCell(c=>{c.font={name:'Arial',size:11,bold:n<=2,color:{argb:n<=2?'FFFFFFFF':'FF1C2A38'}};c.alignment={horizontal:'right',vertical:'middle',wrapText:true};if(n<=2)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1C2A38'}};});});view.autoFilter={from:{row:2,column:1},to:{row:rows.length+2,column:cols.length}};
  }
'''+needle);p.write_text(s,'utf-8')
p=Path('src/main/employee-export.ts');s=p.read_text('utf-8').replace('company:string,includeSalary:boolean){const w=', 'company:string,includeSalary:boolean,logoPng?:Buffer){const w=');s=s.replace('return Buffer.from(await w.xlsx.writeBuffer());', "if(logoPng){const id=w.addImage({buffer:logoPng as any,extension:'png'});s.addImage(id,{tl:{col:columns.length-3,row:0},ext:{width:100,height:55}});s.getRow(1).height=48;}return Buffer.from(await w.xlsx.writeBuffer());");p.write_text(s,'utf-8')
p=Path('src/main/index.ts');s=p.read_text('utf-8').replace('employeeExcel(employees,store.settings().company,v.includeSalary)', "employeeExcel(employees,store.settings().company,v.includeSalary,readFileSync(path.join(root,'assets/brand/export-logo.png')))");p.write_text(s,'utf-8')
p=Path('src/renderer/style.css');s=p.read_text('utf-8');s+='''
:root{--border:#e3e8ed;--bg:#f5f6f8}.field>span,table tbody td,.text-button{font-size:12px}.daily-header>div:last-child{min-width:230px}.rule-editor input{font-size:14px}.formula-preview p,.formula-intro p,.daily-header p{font-size:12px}.actions{flex-wrap:wrap}.daily-history{overflow-x:auto}@media(max-width:1200px){.studio-layout{grid-template-columns:minmax(0,1fr) 270px}.page-heading{flex-wrap:wrap}.daily-header{align-items:flex-start}.daily-header>div:last-child{min-width:190px}}
''';p.write_text(s,'utf-8')
