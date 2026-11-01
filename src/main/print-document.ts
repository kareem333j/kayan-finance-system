import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// Large payrolls exceed Chromium's data-URL limit. Keep the document local,
// with a unique lifetime tied to its isolated, hidden window.
export async function openPrintDocument(html: string): Promise<BrowserWindow> {
  const directory = mkdtempSync(path.join(app.getPath('temp'), 'kayan-print-'));
  let window: BrowserWindow | undefined;
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    const file = path.join(directory, 'document.html');
    writeFileSync(file, html, { encoding: 'utf8', mode: 0o600 });
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.once('closed', cleanup);
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    await window.loadFile(file);
    await window.webContents.executeJavaScript(`document.fonts.ready.then(() => Promise.all(Array.from(document.images).map(image => image.decode())))`);
    return window;
  } catch {
    if (window && !window.isDestroyed()) window.destroy();
    cleanup();
    throw new Error('تعذر تجهيز مستند الطباعة والتصدير. أعد المحاولة وتأكد من وجود مساحة كافية على الجهاز.');
  }
}
