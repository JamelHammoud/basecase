import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, ipcMain, net, protocol } from 'electron';

const OLD_ORIGIN = 'http://localhost:5173';
const READ_TIMEOUT_MS = 5000;

const READER_PAGE = `<!doctype html><script>
window.basecaseStorage.send(JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))));
</script>`;

const marker = (userData) => path.join(userData, 'storage-origin');

function readOldStorage(preload) {
  return new Promise((resolve) => {
    const reader = new BrowserWindow({
      show: false,
      webPreferences: { preload, contextIsolation: true, sandbox: true },
    });
    const close = () => reader.destroy();
    const finish = (entries) => {
      clearTimeout(timer);
      ipcMain.removeListener('storage:migrate', receive);
      protocol.unhandle('http');
      resolve({ entries, close });
    };
    const receive = (event, json) => {
      if (event.sender === reader.webContents) finish(JSON.parse(json));
    };
    const timer = setTimeout(() => finish(null), READ_TIMEOUT_MS);

    protocol.handle('http', (request) =>
      new URL(request.url).origin === OLD_ORIGIN
        ? new Response(READER_PAGE, { headers: { 'Content-Type': 'text/html' } })
        : net.fetch(request, { bypassCustomProtocolHandlers: true }),
    );
    ipcMain.on('storage:migrate', receive);
    reader.loadURL(`${OLD_ORIGIN}/`).catch(() => finish(null));
  });
}

const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function injector(entries, done) {
  let served = false;

  return (html) => {
    if (served) return html;

    served = true;
    done();

    const script = `<script>(() => { if (localStorage.length) return; for (const [k, v] of Object.entries(${scriptJson(entries)})) localStorage.setItem(k, v); })();</script>`;

    return html.replace('<head>', `<head>${script}`);
  };
}

const NONE = { transformHtml: undefined, close: () => {} };

export async function storageMigration({ userData, preload }) {
  if (fs.existsSync(marker(userData))) return NONE;

  const { entries, close } = await readOldStorage(preload);
  const done = () => fs.writeFileSync(marker(userData), 'app://basecase\n');

  if (!entries) return { transformHtml: undefined, close };

  if (Object.keys(entries).length) return { transformHtml: injector(entries, done), close };

  done();

  return { transformHtml: undefined, close };
}
