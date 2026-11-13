import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow } from 'electron';
import { trustedIpc } from '../../appOrigin.mjs';
import { KERNEL_ORIGIN, KERNEL_PAGE } from './policy.mjs';

const preload = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs');

function sealNavigation(contents) {
  const refuse = (event) => event.preventDefault();

  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  for (const event of ['will-navigate', 'will-redirect', 'will-frame-navigate', 'will-attach-webview']) {
    contents.on(event, refuse);
  }

  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
}

function listen(window, handlers) {
  const contents = window.webContents;
  const ipc = trustedIpc(contents.ipc, KERNEL_ORIGIN);

  ipc.on('kernel:ready', () => handlers.onReady());
  ipc.on('kernel:result', (_event, id, bytes) => handlers.onResult(id, bytes));
  ipc.on('kernel:failed', (_event, reason) => handlers.onFailed(String(reason)));
  contents.on('render-process-gone', (_event, details) => handlers.onGone(`its process ended (${details.reason})`));
  contents.on('preload-error', (_event, _file, err) => handlers.onFailed(err.message));
  contents.on('did-fail-load', (...details) => {
    const [, , description, , isMainFrame] = details;

    if (isMainFrame) handlers.onFailed(description);
  });
  window.on('closed', () => handlers.onGone('its window closed'));
}

function endRenderer(contents) {
  const pid = contents.getOSProcessId();

  if (contents.isCrashed() || !Number.isInteger(pid) || pid <= 0) return;

  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}

function killWindow(window) {
  if (window.isDestroyed()) return;

  endRenderer(window.webContents);
  window.destroy();
}

export function openKernelWindow({ session, handlers }) {
  const window = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      session,
      preload,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      webgl: false,
      images: false,
      spellcheck: false,
      enableWebSQL: false,
      navigateOnDragDrop: false,
      backgroundThrottling: false,
    },
  });

  sealNavigation(window.webContents);
  listen(window, handlers);
  window.loadURL(KERNEL_PAGE).catch((err) => handlers.onFailed(err.message));

  return {
    window,
    run: (job) => window.webContents.send('kernel:job', job),
    pid: () => window.webContents.getOSProcessId(),
    kill: () => killWindow(window),
  };
}
