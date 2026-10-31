import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { NO_UPDATE, nextUpdate, worthChecking } from './updateState.mjs';

const CHECK_EVERY_MS = 60 * 60 * 1000;
const GIVE_UP_MS = 60 * 1000;
const LOG_CAP = 512 * 1024;

export const LATEST_DMG_URL = 'https://github.com/JamelHammoud/basecase/releases/latest/download/Basecase.dmg';

function fileLogger(file) {
  const write = (level) => (message) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });

      if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > LOG_CAP) fs.truncateSync(file, 0);

      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${message}\n`);
    } catch {
      return;
    }
  };

  return { info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug') };
}

export class Updates {
  constructor({ windows, log, updater = () => electronUpdater.autoUpdater }) {
    this.windows = windows;
    this.log = log;
    this.updater = updater;
    this.state = NO_UPDATE;
    this.live = false;
    this.asked = false;
    this.timer = null;
    this.giveUp = null;
  }

  start() {
    if (this.live) return;

    this.live = true;

    const up = this.updater();

    up.logger = fileLogger(this.log);
    up.autoDownload = true;
    up.autoInstallOnAppQuit = false;
    up.on('update-available', (info) => this.answer('found', info.version));
    up.on('update-not-available', () => this.answer('nothing'));
    up.on('update-downloaded', (info) => this.say('ready', info.version));
    up.on('error', () => this.failed());
    this.check();
    this.timer = setInterval(() => this.check(), CHECK_EVERY_MS);
  }

  current() {
    return this.state;
  }

  checkNow() {
    if (!this.live) return;

    this.asked = true;
    this.check();
  }

  install() {
    if (this.state.stage !== 'ready') return;

    this.say('install');
    this.giveUp = setTimeout(() => this.failed(), GIVE_UP_MS);

    try {
      this.updater().quitAndInstall(true, true);
    } catch {
      this.failed();
    }
  }

  dispose() {
    clearInterval(this.timer);
    clearTimeout(this.giveUp);
  }

  check() {
    if (!worthChecking(this.state.stage)) return;

    this.updater()
      .checkForUpdates()
      .then((result) => result?.downloadPromise?.catch(() => {}))
      .catch(() => this.failed());
  }

  answer(word, version) {
    const asked = this.asked;

    this.asked = false;

    if (word === 'found') this.say('found', version);

    if (asked) void this.tellChecked(word, version);
  }

  failed() {
    const installing = this.state.stage === 'installing';
    const asked = this.asked;

    clearTimeout(this.giveUp);
    this.asked = false;
    this.say('error');

    if (installing) void this.tellInstallFailed();
    else if (asked) void dialog.showMessageBox({ message: 'Couldn’t check for updates', detail: 'Try again later.' });
  }

  say(word, version) {
    const next = nextUpdate(this.state, word, version);

    if (next === this.state) return;

    this.state = next;

    for (const win of this.windows()) {
      if (!win.webContents.isDestroyed()) win.webContents.send('update:state', next);
    }
  }

  tellChecked(word, version) {
    const message = word === 'found' ? `Downloading Basecase ${version}` : 'Basecase is up to date';

    return dialog.showMessageBox({ message, detail: `Version ${app.getVersion()}` });
  }

  async tellInstallFailed() {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: 'Couldn’t install the update',
      detail: 'Download the latest Basecase and move it to Applications.',
      buttons: ['Download Basecase', 'Close'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) void shell.openExternal(LATEST_DMG_URL);
  }
}
