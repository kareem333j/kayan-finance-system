from pathlib import Path
p=Path('src/main/store.ts');s=p.read_text('utf-8').replace('  db:Database;', '  db:Database;\n  actor:string|null=null;').replace('if(version>2)', 'if(version>3)')
needle="  }\n  audit(action:string,detail:unknown)"
s=s.replace(needle,"    if(version<3){if(version>0)this.db.prepare('VACUUM INTO ?').run(path.join(path.dirname(filename),`before-v3-${Date.now()}.sqlite`));this.db.transaction(()=>{this.db.exec('PRAGMA user_version=3');this.audit('ترقية صلاحيات الحسابات',{from:version,to:3});})();}\n"+needle)
s=s.replace('action,JSON.stringify(detail));}', "action,JSON.stringify(this.actor?{...(detail as object),actor:this.actor}:detail));}")
p.write_text(s,'utf-8')
p=Path('src/main/index.ts');s=p.read_text('utf-8').replace('  switch(method){', "  store.actor=current.username;\n  switch(method){")
s=s.replace('![1,2].includes', '![1,2,3].includes').replace("check.pragma('user_version',{simple:true})===2", "Number(check.pragma('user_version',{simple:true}))>=2")
needle="const record=check.prepare('SELECT value FROM settings WHERE key=?').pluck().get('auth');"
s=s.replace(needle,"const savedAccounts=check.prepare('SELECT value FROM settings WHERE key=?').pluck().get('accounts');if(savedAccounts){const accounts=z.array(z.object({id:z.string(),username:z.string(),name:z.string(),role:z.enum(['admin','operator']),active:z.boolean(),salt:z.string().regex(/^[a-f0-9]{48}$/),hash:z.string().regex(/^[a-f0-9]{128}$/)})).parse(JSON.parse(String(savedAccounts)));if(!accounts.some(a=>a.active&&a.role==='admin')||new Set(accounts.map(a=>a.id)).size!==accounts.length||new Set(accounts.map(a=>a.username.toLowerCase())).size!==accounts.length)throw Error('حسابات النسخة غير صالحة');}"+needle)
p.write_text(s,'utf-8')
p=Path('tests/daily.test.ts');s=p.read_text('utf-8').replace("expect(s.db.pragma('user_version',{simple:true})).toBe(2)", "expect(s.db.pragma('user_version',{simple:true})).toBe(3)");p.write_text(s,'utf-8')
