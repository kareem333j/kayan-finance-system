from pathlib import Path
p=Path('src/main/exports.ts');s=p.read_text('utf-8');s=s.replace('    .signatures{', '''    body{width:${opts.template==='register'?(opts.paper==='A4'?'267mm':'180mm'):(opts.paper==='A4'?'180mm':'118mm')};line-height:1.6}
    .compact{line-height:1.4}.compact tbody td.num{font-size:11px}.compact .emp-cell .lbl{font-size:8px;margin-bottom:2px}.compact .slip>*{flex-shrink:0}.compact .signatures{font-size:9px;margin:4px 0}
    .signatures{''');s=s.replace('const isApproved =', 'const isApproved =');p.write_text(s,'utf-8')
