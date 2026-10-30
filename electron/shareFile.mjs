import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { app, BrowserWindow, ShareMenu, shell } from 'electron';

const require = createRequire(import.meta.url);
let sharing;

const nativeSharing = () => {
  if (sharing === undefined) {
    try {
      sharing = require('./native/sharing/build/Release/sharing.node');
    } catch {
      sharing = null;
    }
  }

  return sharing;
};

const shareDir = () => path.join(app.getPath('temp'), 'Basecase Share');

const safeName = (name) =>
  path
    .basename(String(name ?? ''))
    .replace(/[^\w .()-]+/g, '_')
    .slice(0, 120) || 'Model';

function writeShared({ name, bytes }) {
  if (!ArrayBuffer.isView(bytes) || !bytes.byteLength) throw new Error('Nothing to share.');

  const file = path.join(shareDir(), safeName(name));

  fs.mkdirSync(shareDir(), { recursive: true });
  fs.writeFileSync(file, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));

  return file;
}

function airDrop(file, window) {
  try {
    return nativeSharing()?.airDrop(file, window.getNativeWindowHandle()) === true;
  } catch (err) {
    console.warn('[share] AirDrop failed:', err);

    return false;
  }
}

export function registerShareHandlers(ipcMain) {
  ipcMain.handle('share:file', (event, payload) => {
    const file = writeShared(payload ?? {});
    const window = BrowserWindow.fromWebContents(event.sender);

    if (process.platform !== 'darwin' || !window) {
      shell.showItemInFolder(file);

      return 'shown';
    }

    if (airDrop(file, window)) return 'airdrop';

    new ShareMenu({ filePaths: [file] }).popup({ window });

    return 'shared';
  });
}
