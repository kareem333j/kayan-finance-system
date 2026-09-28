from pathlib import Path
p=Path('tests/daily.test.ts');s=p.read_text('utf-8').replace('mkdtempSync,rmSync','mkdtempSync,rmSync,readdirSync');s += '''
describe('ترقية البيانات السابقة',()=>{
 it('يحفظ الموظفين والمعتمد وينشئ نسخة قبل الترقية',()=>{let s=setup();s.setSettings({...s.settings(),roundingAccepted:true});const emp1=s.saveEmployee({...emp,notes:'ملاحظات قديمة',bankNote:'بيانات قديمة'});let p=s.createPeriod('2026-09'),e=p.entries[0];s.saveEntry({periodId:p.id,id:e.id,version:e.version,inputs:e.inputs,checked:true});p=s.approve(p.id);const approved=p.entries[0].result;const filename=s.filename;s.db.exec('DROP TABLE daily_records; DROP TABLE input_history; DROP TABLE policy_history; PRAGMA user_version=1;');s.close();stores.splice(stores.indexOf(s),1);s=new Store(filename);stores.push(s);expect(s.employees()[0]).toEqual(emp1);expect(s.period(p.id).entries[0].result).toEqual(approved);expect(s.period(p.id).status).toBe('approved');expect(readdirSync(path.dirname(filename)).some(f=>f.startsWith('before-v2-'))).toBe(true);expect(s.db.pragma('user_version',{simple:true})).toBe(2);});
});
''';p.write_text(s,'utf-8')
