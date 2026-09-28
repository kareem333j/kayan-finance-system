from pathlib import Path
p=Path('tests/store.test.ts');s=p.read_text('utf-8');s=s.replace("s.saveEmployee(employee);const p=s.createPeriod('2026-09');const e=p.entries[0];s.saveEntry({periodId:p.id,id:e.id,version:e.version,inputs:e.inputs,checked:true});s.setSettings({company:'اختبار',roundingAccepted:true,penaltiesEnabled:false});", "s.setSettings({company:'اختبار',roundingAccepted:true,penaltiesEnabled:false});s.saveEmployee(employee);const p=s.createPeriod('2026-09');const e=p.entries[0];s.saveEntry({periodId:p.id,id:e.id,version:e.version,inputs:e.inputs,checked:true});")
s=s.replace("expect(()=>s.approve(p.id)).toThrow();const e=p.entries[0];", "expect(()=>s.approve(p.id)).toThrow();const e=s.period(p.id).entries[0];")
s=s.replace("expect(sheet.getCell('S5').value).toBe(5940);expect(sheet.getCell('S6').value).toBe(5940);expect(sheet.getCell('B5').value).toBe(employee.name);", "const heads=sheet.getRow(5).values as string[];const net=heads.indexOf('صافي المرتب');expect(sheet.getCell(6,net).value).toBe(5940);expect(sheet.getCell(7,net).value).toBe(5940);expect(sheet.getCell('C6').value).toBe(employee.name);")
p.write_text(s,'utf-8')
p=Path('scripts/smoke.mjs');s=p.read_text('utf-8').replace("await page.getByRole('button',{name:'رواتب الشهر',exact:true}).click();await page.getByRole('button',{name:'اعتماد الشهر',exact:true}).click();", "period=await page.evaluate(id=>window.payroll.call('period.get',id),id);await page.evaluate(p=>window.payroll.call('entry.save',{periodId:p.id,id:p.entries[0].id,version:p.entries[0].version,inputs:p.entries[0].inputs,checked:true}),period);\n  await page.getByRole('button',{name:'رواتب الشهر',exact:true}).click();await page.getByRole('button',{name:'اعتماد الشهر',exact:true}).click();")
p.write_text(s,'utf-8')
p=Path('src/main/exports.ts');s=p.read_text('utf-8').replace("const isApproved = p.status === 'approved';", "const isApproved = p.status === 'approved' && p.view!=='accrued';")
s=s.replace("const company = esc(p.policy?.company || 'كيان');", "const company = esc(p.policy?.company || 'كيان');")
# Add dated header on every page/slip
s=s.replace("const monthAr =", "const monthAr =",1)
s=s.replace("'✓ معتمد' : '⚠ مسودة'", "'✓ معتمد' : '⚠ مسودة'")
s=s.replace("r2.value = `${p.status", "r2.value = `${p.view==='accrued'?`مستحق حتى ${p.asOf} — بيان مرحلي | `:''}${p.status")
# add custom columns and values to detailed sheet; retain fixed totals
s=s.replace('const heads = [...infoHeaders, ...moneyHeaders, ...summaryHeaders];', "const custom=p.policy?.formulas.customFields||[];\n  const heads = [...infoHeaders, ...moneyHeaders, ...custom.map(f=>`${f.name} (${f.type==='earning'?'+':'−'})`), ...summaryHeaders];")
s=s.replace('const summStart = dedsStart + deductionKeys.length;', 'const summStart = dedsStart + deductionKeys.length + custom.length;')
s=s.replace('...ALL_KEYS.map(k => e.result!.amounts[k] / 100),','...ALL_KEYS.map(k => (e.result!.amounts[k]||0) / 100),\n      ...custom.map(f=>(e.result!.customAmounts?.[f.id]||0)/100),')
s=s.replace('...ALL_KEYS.map(k => rows.reduce((s, e) => s + e.result!.amounts[k], 0) / 100),','...ALL_KEYS.map(k => rows.reduce((s, e) => s + (e.result!.amounts[k]||0), 0) / 100),\n    ...custom.map(f=>rows.reduce((s,e)=>s+(e.result!.customAmounts?.[f.id]||0),0)/100),')
# datestamp visible, print sizing overrides placed last in CSS
idx=s.index('`;',s.index('const baseCSS'))
s=s[:idx]+'''
    .cutoff-banner{padding:7px 10px;background:#fff0e4;margin-bottom:10px;font-size:12px;font-weight:700}
    .slip{min-height:0;break-inside:avoid}
    ${opts.paper==='A5'?'.slip{font-size:11px}.doc-header{margin-bottom:12px;padding-bottom:8px}.doc-header img{height:42px}.emp-bar{margin-bottom:10px}.doc-header .sub{font-size:14px}':''}
    .compact .slip{height:132mm;min-height:0;padding:0 0 3mm;margin:0;break-inside:avoid;font-size:10px}
    .compact .slip:nth-child(2n+1){margin-bottom:3mm}
    .compact .doc-header{padding-bottom:5px;margin-bottom:7px;gap:8px}
    .compact .doc-header img{height:35px}.compact .doc-header .sub{font-size:13px}.compact .doc-header .sub small{font-size:9px}.compact .status-badge{font-size:9px;padding:3px 8px}
    .compact .emp-bar{margin-bottom:8px}.compact th,.compact td{padding:3px 6px;font-size:10px}
'''+s[idx:]
# body insertion is template dependent see resulting below
s=s.replace('<body class="${opts.template', '<body class="${opts.template')
p.write_text(s,'utf-8')
p=Path('src/renderer/main.tsx');s=p.read_text('utf-8').replace('useState<Inputs>(entry.inputs)','useState<Inputs>(entry.effectiveInputs||entry.inputs)');s=s.replace('setEffectiveDate(e.target.value);setChecked(false);', "const date=e.target.value;setEffectiveDate(date);setChecked(false);if(date)api.call('period.get',{id:period.id,asOf:date}).then((p:Period)=>{const row=p.entries.find(x=>x.id===entry.id);if(row)setV(row.effectiveInputs||row.inputs);});")
p.write_text(s,'utf-8')
