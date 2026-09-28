import path from 'node:path';
process.env.KAYAN_PACKAGED_TEST=path.resolve('release/win-unpacked/Kayan Payroll.exe');
await import('./daily-smoke.mjs');
await import('./admin-smoke.mjs');
