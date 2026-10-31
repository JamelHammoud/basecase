import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

const OFFLINE_AGENT = 'node electron/acp-3d-agent.mjs';

const PACKAGED = [
  'release/mac-arm64/Basecase.app/Contents/MacOS/Basecase',
  'release/mac/Basecase.app/Contents/MacOS/Basecase',
  'release/win-unpacked/Basecase.exe',
  'release/win-arm64-unpacked/Basecase.exe',
];

export function packagedBinary(): string {
  const explicit = process.env.BASECASE_APP_PATH;

  if (explicit) return explicit;

  const found = PACKAGED.map((p) => path.resolve(p)).find((p) => fs.existsSync(p));

  if (!found) throw new Error('No packaged app. Run npx electron-builder --dir first, or set BASECASE_APP_PATH.');

  return found;
}

export function appResources(binary: string): string {
  const resources =
    process.platform === 'darwin'
      ? path.resolve(binary, '..', '..', 'Resources')
      : path.join(path.dirname(binary), 'resources');

  return path.join(resources, 'app');
}

const BARE_PATH = process.platform === 'win32' ? String.raw`C:\Windows\System32;C:\Windows` : '/usr/bin:/bin';

export interface RunningApp {
  app: ElectronApplication;
  page: Page;
  userData: string;
  errors: string[];
  close: () => Promise<void>;
}

function freshUserData(): string {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-app-'));
  const library = path.join(userData, 'library');

  fs.mkdirSync(library, { recursive: true });
  fs.writeFileSync(path.join(library, 'agent.json'), JSON.stringify({ command: OFFLINE_AGENT }));

  return userData;
}

export async function launchPackaged(): Promise<RunningApp> {
  const userData = freshUserData();
  const app = await electron.launch({
    executablePath: packagedBinary(),
    args: ['--enable-unsafe-swiftshader'],
    env: {
      ...process.env,
      PATH: BARE_PATH,
      SHELL: '/bin/sh',
      BASECASE_USER_DATA: userData,
      STUDIO_AGENT_OFFLINE: '1',
    },
    timeout: 120000,
  });
  const page = await app.firstWindow();
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.waitForFunction(() => !document.documentElement.classList.contains('booting'), null, {
    timeout: 120000,
  });

  return {
    app,
    page,
    userData,
    errors,
    close: async () => {
      await app.close();
      fs.rmSync(userData, { recursive: true, force: true });
    },
  };
}
