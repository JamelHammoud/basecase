import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, nativeTheme, safeStorage, shell } from 'electron';
import { BasecaseBackendService } from './backend-service.mjs';
import { installAppMenu, updateAppMenuState } from './app-menu.mjs';
import { registerGuideHandlers } from './guidePdf.mjs';
import { registerPrintHandlers } from './print/routes.mjs';
import { registerShareHandlers } from './shareFile.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

const backend = new BasecaseBackendService(workspaceRoot, {
  secrets: {
    available: () => app.isReady() && safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64')),
  },
});
let mainWindow = null;

app.setName('Basecase');

{
  const userData = path.join(app.getPath('appData'), 'Basecase');
  const legacy = path.join(app.getPath('appData'), 'Robotics 3D Studio');

  if (!fs.existsSync(userData) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, userData);
    } catch (err) {
      console.warn('[main] Could not move settings from Robotics 3D Studio:', err);
    }
  }

  app.setPath('userData', userData);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1240,
    minHeight: 720,
    backgroundColor: '#00000000',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 19, y: 15 },
    title: 'Basecase',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  mainWindow.loadURL(devUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);

    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(devUrl)) return;

    event.preventDefault();

    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  for (const [event, value] of [
    ['enter-full-screen', true],
    ['leave-full-screen', false],
  ]) {
    mainWindow.on(event, () => mainWindow?.webContents.send('window:fullscreen', value));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

backend.onEvent((event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend:event', event);
  }
});

ipcMain.handle('acp:status', (_e, workspaceId) => backend.getAcpStatus(workspaceId));
ipcMain.handle('acp:connect', (_e, cmd) => backend.connectAcpAgent(cmd));
ipcMain.handle('acp:authenticate', (_e, methodId) => backend.authenticateAcpAgent(methodId));
ipcMain.handle('acp:set-api-key', (_e, key) => backend.setAgentApiKey(key));
ipcMain.handle('acp:prompt', (_e, payload) => backend.sendAcpPrompt(payload));
ipcMain.handle('acp:steer', (_e, payload) => backend.steerAcpPrompt(payload));
ipcMain.handle('acp:cancel', (_e, workspaceId) => backend.cancelAcpPrompt(workspaceId));
ipcMain.handle('acp:resume', (_e, sessionId, workspaceId) => backend.resumeAcpConversation(sessionId, workspaceId));
ipcMain.handle('acp:live-runs', (_e, workspaceId) => backend.liveAcpRuns(workspaceId));
ipcMain.handle('acp:forget-run', (_e, workspaceId) => backend.forgetAcpRun(workspaceId));
ipcMain.handle('acp:close-workspace', (_e, workspaceId) => backend.closeWorkspace(workspaceId));
ipcMain.handle('chat:list', () => backend.listConversations());
ipcMain.handle('purchases:list', () => backend.listPurchases());
ipcMain.handle('train:status', () => backend.trainStatus());
ipcMain.handle('train:start', (_e, payload) => backend.trainStart(payload));
ipcMain.handle('train:stop', (_e, workspaceId) => backend.trainStop(workspaceId));
ipcMain.handle('simready:status', () => backend.simreadyStatus());
ipcMain.handle('simready:fetch', (_e, payload) => backend.simreadyFetch(payload));
ipcMain.handle('simready:file', (_e, payload) => backend.simreadyFile(payload));
ipcMain.handle('policy:get', (_e, id) => backend.getPolicy(id));
ipcMain.handle('policy:delete', (_e, id) => backend.deletePolicy(id));
ipcMain.handle('purchases:save', (_e, payload) => backend.savePurchase(payload));
ipcMain.handle('chat:get', (_e, id) => backend.getConversation(id));
ipcMain.handle('chat:save', (_e, conv) => backend.saveConversation(conv));
ipcMain.handle('chat:delete', (_e, id) => backend.deleteConversation(id));
ipcMain.handle('acp:new-conversation', (_e, workspaceId) => backend.newAcpConversation(workspaceId));
ipcMain.handle('window:is-fullscreen', (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false);
ipcMain.on('menu:state', (_e, state) => updateAppMenuState(state));
ipcMain.handle('agent:respond', (_e, payload) => backend.resolveAgentRequest(payload));

ipcMain.handle('library:upload-image', (_e, payload) => backend.saveUploadedImage(payload));
ipcMain.handle('library:list-images', () => backend.listUploadedImages());
ipcMain.handle('library:save-evidence-file', (_e, payload) => backend.saveEvidenceFile(payload));

ipcMain.handle('library:list-models', () => backend.listModels());
ipcMain.handle('library:save-model', (_e, modelDef) => backend.saveModel(modelDef));
ipcMain.handle('library:delete-model', (_e, modelId) => backend.deleteModel(modelId));

ipcMain.handle('library:list-scenes', () => backend.listScenes());
ipcMain.handle('library:get-scene', (_e, sceneId) => backend.getScene(sceneId));
ipcMain.handle('library:save-scene-preview', (_e, payload) => backend.saveScenePreview(payload));
ipcMain.handle('library:save-scene', (_e, scenePayload) => backend.saveScene(scenePayload));
ipcMain.handle('library:save-scene-json', (_e, json) => backend.saveScene(JSON.parse(json)));
ipcMain.handle('library:delete-scene', (_e, sceneId) => backend.deleteScene(sceneId));
registerGuideHandlers(ipcMain, backend.libraryDir);
registerPrintHandlers(ipcMain, backend.printing);
registerShareHandlers(ipcMain);

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  installAppMenu(() => mainWindow);
  await backend.connectAcpAgent();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  backend.trainer.dispose();
  backend.printing.dispose();
});

app.on('window-all-closed', () => {
  backend.disconnectAcpAgent();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
