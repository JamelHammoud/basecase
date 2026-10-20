import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { safeFileId } from './backend/constants.mjs';

const guidesDir = (libraryDir) => path.join(libraryDir, 'guides');

const guidePath = (libraryDir, id) => path.join(guidesDir(libraryDir), `${safeFileId(id)}.pdf`);

async function printGuide(libraryDir, { id, html }) {
  if (!safeFileId(id) || typeof html !== 'string') throw new Error('No guide to print.');

  const dir = guidesDir(libraryDir);
  const source = path.join(dir, `${safeFileId(id)}.html`);
  const window = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(source, html);
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  try {
    await window.loadFile(source);

    const pdf = await window.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      margins: { marginType: 'none' },
    });
    const file = guidePath(libraryDir, id);

    fs.writeFileSync(file, pdf);

    return { ok: true, path: file, bytes: pdf.length };
  } finally {
    window.destroy();
    fs.rmSync(source, { force: true });
  }
}

async function openGuide(libraryDir, id) {
  const file = guidePath(libraryDir, id);

  if (!fs.existsSync(file)) return false;

  return (await shell.openPath(file)) === '';
}

function revealGuide(libraryDir, id) {
  const file = guidePath(libraryDir, id);

  if (!fs.existsSync(file)) return false;

  shell.showItemInFolder(file);

  return true;
}

export function registerGuideHandlers(ipcMain, libraryDir) {
  ipcMain.handle('guide:save', (_e, payload) => printGuide(libraryDir, payload));
  ipcMain.handle('guide:open', (_e, id) => openGuide(libraryDir, id));
  ipcMain.handle('guide:reveal', (_e, id) => revealGuide(libraryDir, id));
  ipcMain.handle('guide:exists', (_e, id) => fs.existsSync(guidePath(libraryDir, id)));
}
