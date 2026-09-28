from pathlib import Path
p=Path('src/main/index.ts');s=p.read_text('utf-8');s=s.replace("import { randomBytes,scryptSync,timingSafeEqual } from 'node:crypto';\n",'');a=s.index('function authRecord()');b=s.index('async function autoBackup',a);s=s[:a]+s[b:];p.write_text(s,'utf-8')
p=Path('src/renderer/main.tsx');s=p.read_text('utf-8').replace('KAYAN PAYROLL · 0.2','KAYAN PAYROLL · 0.3').replace('<small>بدون اتصال بالإنترنت</small></div>',"<small>{auth.user?.name} · {isAdmin?'أدمن':'حساب عادي'}</small></div>");p.write_text(s,'utf-8')
