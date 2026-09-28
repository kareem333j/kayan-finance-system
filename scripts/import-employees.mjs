/**
 * Script to import employees from العمال.xlsx directly into the payroll database.
 * Run: node scripts/import-employees.mjs
 */
import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';


// We run this as a plain Node script (not in Electron context)
// so we manually derive the data path
const homePath = process.env.APPDATA || (process.platform === 'darwin'
  ? path.join(process.env.HOME, 'Library', 'Application Support')
  : path.join(process.env.HOME, '.config'));

const dataDir = process.env.KAYAN_TEST_DATA
  || path.join(homePath, 'kayan-payroll', 'payroll-data');

const dbPath = path.join(dataDir, 'payroll.sqlite');

console.log('Data dir:', dataDir);
console.log('DB path:', dbPath);

if (!existsSync(dbPath)) {
  console.error('❌ قاعدة البيانات غير موجودة. شغل البرنامج مرة واحدة أولاً لإنشائها.');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const filePath = 'D:/finance-system/العمال.xlsx';

// Skip rows: إجمالي, section headers, rental/expenses
const SKIP_PATTERNS = /^(?:اجمالى|الاجمالى|أولا|اولا|ثانيا|صندوق الزمالة)/;
const SPECIAL_PATTERNS = /ايجار|إيجار|صندوق|مكتب المحاسبة|استشارى|استشاري/;

function normalizeSearch(s) {
  return String(s || '').normalize('NFKC')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function randomCode(index) {
  // Random 4-digit code: EMP-XXXX (user will edit later)
  const r = Math.floor(1000 + Math.random() * 9000);
  return `EMP-${r}`;
}

function makeUniqueCode(base) {
  let code = base;
  let attempts = 0;
  while (db.prepare('SELECT 1 FROM employees WHERE code=?').get(code)) {
    attempts++;
    const r = Math.floor(1000 + Math.random() * 9000);
    code = `EMP-${r}`;
    if (attempts > 50) {
      code = `EMP-${randomUUID().slice(0, 8)}`;
      break;
    }
  }
  return code;
}

async function run() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];

  const existing = new Set(
    db.prepare('SELECT data FROM employees ORDER BY name_key').all()
      .map(r => normalizeSearch(JSON.parse(r.data).name))
  );

  let imported = 0;
  let skipped = 0;
  let duplicate = 0;

  const insertEmp = db.prepare(`
    INSERT INTO employees(id, code, name_key, data, version)
    VALUES (?, ?, ?, ?, 1)
  `);
  const insertAudit = db.prepare(`
    INSERT INTO audit(at, action, detail) VALUES (?, ?, ?)
  `);

  const doImport = () => {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let row = 4; row <= sheet.rowCount; row++) {
        const r = sheet.getRow(row);
        const getCellText = (col) => {
          try {
            const cell = r.getCell(col);
            const v = cell.value;
            if (v === null || v === undefined) return '';
            if (typeof v === 'object' && v instanceof Date) return v.toISOString().slice(0, 10);
            if (typeof v === 'object' && v.text) return String(v.text).trim();
            return String(v).trim();
          } catch { return ''; }
        };

        const name = getCellText(2);
        if (!name) continue;
        const nameNorm = normalizeSearch(name);

        // Skip aggregate rows
        if (SKIP_PATTERNS.test(nameNorm) || SKIP_PATTERNS.test(name)) {
          skipped++;
          continue;
        }

        // Skip special (rentals, offices, etc.)
        if (SPECIAL_PATTERNS.test(name)) {
          console.log(`⏭️  تخطي (خاص): ${name}`);
          skipped++;
          continue;
        }

        // Skip duplicates
        if (existing.has(nameNorm)) {
          console.log(`🔁 موجود مسبقاً: ${name}`);
          duplicate++;
          continue;
        }

        const bankNote = getCellText(3);
        const startDateRaw = getCellText(4);
        let startDate = '';
        if (startDateRaw && startDateRaw.match(/^\d{4}-\d{2}-\d{2}$/)) {
          startDate = startDateRaw;
        }

        const job = getCellText(5);
        const costCenter = getCellText(6);
        const graduation = getCellText(7);
        const rawCode = getCellText(1);

        // Generate random code
        const code = makeUniqueCode(randomCode(row));

        const id = randomUUID();
        const employee = {
          id,
          code,
          name,
          job: job || '',
          costCenter: costCenter || '',
          startDate,
          endDate: '',
          paymentMethod: bankNote ? 'بنكي' : 'غير محدد',
          bankNote: bankNote || '',
          graduation: graduation || '',
          phone: '',
          nationalId: '',
          address: '',
          basic: '',
          active: true,
          notes: `استيراد تلقائي من ملف العمال. رقم الصف: ${row}${rawCode && /^\\d+$/.test(rawCode) ? `. رقم أصلي: ${rawCode}` : ''}.`,
          version: 1
        };

        insertEmp.run(id, code, nameNorm, JSON.stringify(employee));
        insertAudit.run(new Date().toISOString(), 'استيراد موظف', JSON.stringify({ name, code, row }));
        existing.add(nameNorm);
        imported++;
        console.log(`✅ تم استيراد: ${name} [${code}] - ${job} - ${costCenter}`);
      }
      db.exec('COMMIT');
    } catch(err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  doImport();

  console.log('\n=== النتيجة ===');
  console.log(`✅ تم استيراد: ${imported} موظف`);
  console.log(`🔁 موجود مسبقاً: ${duplicate}`);
  console.log(`⏭️  تم تخطي: ${skipped}`);
  
  db.close();
}

run().catch(err => {
  console.error('❌ خطأ:', err.message);
  db.close();
  process.exit(1);
});
