import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain as electronIpc,
  nativeTheme,
  safeStorage,
  session,
  shell,
  systemPreferences,
} from 'electron';
import { isAppUrl, isExternalWebUrl, trustedIpc } from './appOrigin.mjs';
import { BasecaseBackendService } from './backend-service.mjs';
import { SandboxKernel } from './cad-kernel/sandbox/sandboxKernel.mjs';
import { kernelSelfTest } from './cad-kernel/sandbox/selfTest.mjs';
import { cadImportSelfTest } from './cadImport/selfTest.mjs';
import { installAppMenu, popupAppMenu, updateAppMenuState } from './app-menu.mjs';
import { APP_ORIGIN, registerAppScheme, serveApp } from './appProtocol.mjs';
import { APP_DISPLAY_NAME, DEV_MODE } from './appName.mjs';
import { registerGuideHandlers } from './guidePdf.mjs';
import { installPermissions } from './permissions.mjs';
import { registerHubHandlers } from './hub/routes.mjs';
import { registerTryHandlers } from './library/tryRoutes.mjs';
import { registerOnshapeHandlers } from './onshape/routes.mjs';
import { registerEarthHandlers } from './earth/routes.mjs';
import { registerPrintHandlers } from './print/routes.mjs';
import { daemonBinary, RobotLink } from './robot/robotLink.mjs';
import { robotPolicyBytes } from './robot/robotPolicy.mjs';
import { registerRobotHandlers } from './robot/robotRoutes.mjs';
import { PhonePairing } from './phone/phonePairing.mjs';
import { registerPhoneHandlers } from './phone/phoneRoutes.mjs';
import { registerShareHandlers } from './shareFile.mjs';
import { adoptShellPath } from './shellPath.mjs';
import { storageMigration } from './storageMigration.mjs';
import { Updates } from './updates.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const fromSource = Boolean(process.defaultApp);
const shellReady = fromSource ? Promise.resolve() : adoptShellPath();

let mainWindow = null;

const SHOW_FALLBACK_MS = 2000;
const bundled = !fromSource || process.argv.includes('--bundle');
const devServer = bundled ? null : process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

registerAppScheme();

const ipcMain = trustedIpc(electronIpc, APP_ORIGIN);

app.setName('Basecase');

if (DEV_MODE) app.setAboutPanelOptions({ applicationName: APP_DISPLAY_NAME });

app.commandLine.appendSwitch('enable-features', 'IsolateSandboxedIframes');

if (process.env.BASECASE_USER_DATA && process.env.STUDIO_AGENT_OFFLINE === '1')
  app.commandLine.appendSwitch('use-mock-keychain');

{
  const userData = process.env.BASECASE_USER_DATA || path.join(app.getPath('appData'), 'Basecase');
  const legacy = path.join(app.getPath('appData'), 'Robotics 3D Studio');

  if (!process.env.BASECASE_USER_DATA && !fs.existsSync(userData) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, userData);
    } catch (err) {
      console.warn('[main] Could not move settings from Robotics 3D Studio:', err);
    }
  }

  app.setPath('userData', userData);
}

const kernel = new SandboxKernel({ root: workspaceRoot });
const backend = new BasecaseBackendService(workspaceRoot, {
  kernel,
  dataRoot: fromSource ? workspaceRoot : app.getPath('userData'),
  secrets: {
    available: () => app.isReady() && safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64')),
  },
});
const updates = new Updates({
  windows: () => BrowserWindow.getAllWindows().filter((win) => !kernel.owns(win)),
  log: path.join(app.getPath('userData'), 'updates.log'),
  channelFile: path.join(app.getPath('userData'), 'update-channel.json'),
});

const MAC_FRAME = {
  backgroundColor: '#00000000',
  vibrancy: 'sidebar',
  visualEffectState: 'active',
  titleBarStyle: 'hiddenInset',
  trafficLightPosition: { x: 19, y: 15 },
};

const WINDOWS_FRAME = {
  backgroundColor: '#121212',
  titleBarStyle: 'hidden',
  titleBarOverlay: { color: '#121212', symbolColor: '#e6e6e6', height: 44 },
  autoHideMenuBar: true,
};

const windowFrame = () => (process.platform === 'darwin' ? MAC_FRAME : WINDOWS_FRAME);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1240,
    minHeight: 720,
    ...windowFrame(),
    title: 'Basecase',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  const window = mainWindow;
  const show = () => {
    if (!window.isDestroyed() && !window.isVisible()) window.show();
  };
  const fallback = setTimeout(show, SHOW_FALLBACK_MS);

  window.once('ready-to-show', () => {
    clearTimeout(fallback);
    show();
  });
  mainWindow.loadURL(`${APP_ORIGIN}/`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) shell.openExternal(url);

    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, APP_ORIGIN)) return;

    event.preventDefault();

    if (isExternalWebUrl(url)) shell.openExternal(url);
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url, APP_ORIGIN)) event.preventDefault();
  });

  for (const [event, value] of [
    ['enter-full-screen', true],
    ['leave-full-screen', false],
  ]) {
    mainWindow.on(event, () => mainWindow?.webContents.send('window:fullscreen', value));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    kernel.stop();
  });
}

const CAPTURE_WIDTH = 1568;

backend.bridge.serve('capture_window', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The app window is not open.');

  const image = await mainWindow.webContents.capturePage();
  const fitted = image.getSize().width > CAPTURE_WIDTH ? image.resize({ width: CAPTURE_WIDTH }) : image;

  return { dataUrl: `data:image/jpeg;base64,${fitted.toJPEG(82).toString('base64')}` };
});

backend.onEvent((event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend:event', event);
  }
});

ipcMain.handle('acp:status', (_e, workspaceId) => backend.getAcpStatus(workspaceId));
ipcMain.handle('acp:connect', (_e, cmd) => shellReady.then(() => backend.connectAcpAgent(cmd)));
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
ipcMain.handle('train:kit', (_e, payload) => backend.kitRequest(payload));
ipcMain.handle('train:kit-cancel', (_e, workspaceId) => backend.kitCancel(workspaceId));
ipcMain.handle('skill:save', (_e, payload) => backend.saveSkill(payload));
ipcMain.handle('skill:get', (_e, hash) => backend.getSkill(hash));
ipcMain.handle('simready:status', () => backend.simreadyStatus());
ipcMain.handle('simready:fetch', (_e, payload) => backend.simreadyFetch(payload));
ipcMain.handle('simready:file', (_e, payload) => backend.simreadyFile(payload));
ipcMain.handle('policy:get', (_e, id) => backend.getPolicy(id));
ipcMain.handle('policy:delete', (_e, id) => backend.deletePolicy(id));
ipcMain.handle('snapshot:get', (_e, ref) => backend.getSnapshot(ref));
ipcMain.handle('snapshot:keep', (_e, payload) => backend.keepSnapshots(payload));
ipcMain.handle('purchases:save', (_e, payload) => backend.savePurchase(payload));
ipcMain.handle('sourced:list', () => backend.listSourced());
ipcMain.handle('sourced:save', (_e, payload) => backend.saveSourced(payload));
ipcMain.handle('sourced:remove', (_e, id) => backend.removeSourced(id));
ipcMain.handle('sourced:mesh', (_e, id) => backend.sourcedMesh(id));
ipcMain.handle('sourced:import-cad', (_e, payload) => backend.importMakerCad(payload));
ipcMain.handle('cad:open', (_e, payload) => backend.openCadFile(payload));
ipcMain.handle('cad:export-step', (_e, payload) => backend.exportStep(payload));
ipcMain.handle('cad:tune', (_e, payload) => backend.tuneCadPart(payload));
ipcMain.handle('cad:render', (_e, payload) => backend.renderCad(payload));
ipcMain.handle('chat:get', (_e, id) => backend.getConversation(id));
ipcMain.handle('chat:save', (_e, conv) => backend.saveConversation(conv));
ipcMain.handle('chat:delete', (_e, id) => backend.deleteConversation(id));
ipcMain.handle('acp:new-conversation', (_e, workspaceId) => backend.newAcpConversation(workspaceId));
ipcMain.handle('window:is-fullscreen', (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false);
ipcMain.on('menu:state', (_e, state) => updateAppMenuState(state));
ipcMain.handle('menu:popup', (e, at) => popupAppMenu(BrowserWindow.fromWebContents(e.sender), at));
ipcMain.handle('agent:respond', (_e, payload) => backend.resolveAgentRequest(payload));
ipcMain.handle('update:state', () => updates.current());
ipcMain.handle('update:install', () => updates.install());

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
registerHubHandlers(ipcMain, backend.hub);
registerTryHandlers(ipcMain, backend.tries);
registerOnshapeHandlers(ipcMain, backend.onshape);
registerEarthHandlers(ipcMain, backend.earth);
registerShareHandlers(ipcMain);

const robotBinary = daemonBinary({ resources: process.resourcesPath, fromSource, repo: workspaceRoot });

const sendTo = (channel) => (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, event);
};

const robot = new RobotLink({
  binary: robotBinary,
  emit: sendTo('robot:event'),
  policyBytes: robotPolicyBytes({ libraryDir: backend.libraryDir, trainer: backend.trainer }),
});

registerRobotHandlers(ipcMain, robot);

const phone = new PhonePairing({ emit: sendTo('phone:event') });

registerPhoneHandlers(ipcMain, phone);

const selfTestFile = process.env.BASECASE_KERNEL_SELFTEST;
const cadImportSelfTestSpec = process.env.BASECASE_CADIMPORT_SELFTEST;

async function runSelfTest() {
  if (selfTestFile)
    return kernelSelfTest(kernel, { outFile: selfTestFile, probeFile: path.join(__dirname, 'main.mjs') });

  return cadImportSelfTest(kernel, cadImportSelfTestSpec).then(
    () => true,
    (err) => {
      console.error('[cadimport] Self-test failed:', err);

      return false;
    },
  );
}

app.whenReady().then(async () => {
  if (selfTestFile || cadImportSelfTestSpec) {
    app.exit((await runSelfTest()) ? 0 : 1);

    return;
  }

  nativeTheme.themeSource = 'dark';
  installPermissions(session.defaultSession, { appOrigin: APP_ORIGIN, platform: process.platform, systemPreferences });
  installAppMenu(() => mainWindow, {
    onCheckForUpdates: fromSource ? null : () => updates.checkNow(),
    betaUpdates: fromSource ? null : { get: () => updates.wantsBeta(), set: (beta) => updates.setBeta(beta) },
  });
  void shellReady.then(() => backend.connectAcpAgent());

  const migration = await storageMigration({
    userData: app.getPath('userData'),
    preload: path.join(__dirname, 'storagePreload.cjs'),
  });

  serveApp({ distDir: path.join(workspaceRoot, 'dist'), devServer, transformHtml: migration.transformHtml });
  createWindow();
  migration.close();

  if (!fromSource) updates.start();

  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('before-quit', () => {
  robot.dispose();
  phone.dispose();
  kernel.stop();
  updates.dispose();
  backend.kit.dispose();
  backend.trainer.dispose();
  backend.printing.dispose();
});

app.on('window-all-closed', () => {
  backend.disconnectAcpAgent();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
