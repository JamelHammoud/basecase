import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { createServer, searchForWorkspaceRoot, type ViteDevServer } from 'vite';
import { repoPath } from '../lib/need';

export interface DevApp {
  app: ElectronApplication;
  page: Page;
  errors: string[];
  close: () => Promise<void>;
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;

      probe.close(() => resolve(port));
    });
  });

async function devServer(): Promise<{ server: ViteDevServer; url: string }> {
  const port = await freePort();

  process.env.BASECASE_HMR_PORT = String(port);

  const server = await createServer({
    configFile: repoPath('vite.config.ts'),
    mode: 'development',
    server: {
      port,
      strictPort: true,
      fs: { allow: [searchForWorkspaceRoot(repoPath()), fs.realpathSync(repoPath('node_modules'))] },
    },
    logLevel: 'silent',
  });

  await server.listen();

  return { server, url: `http://localhost:${port}` };
}

async function appPage(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 120000;

  for (;;) {
    const page = app.windows().find((p) => p.url().startsWith('app://basecase'));

    if (page) return page;

    if (Date.now() > deadline) throw new Error('The app window never loaded app://basecase.');

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function launchDevElectron(env: Record<string, string>): Promise<DevApp> {
  const { server, url } = await devServer();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-dev-app-'));
  const electronBinary = createRequire(import.meta.url)('electron') as string;
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [repoPath(), '--enable-unsafe-swiftshader'],
    cwd: repoPath(),
    env: {
      ...process.env,
      ...env,
      VITE_DEV_SERVER_URL: url,
      BASECASE_USER_DATA: userData,
      STUDIO_AGENT_OFFLINE: '1',
    },
    timeout: 120000,
  });
  const page = await appPage(app);
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/net::|Failed to load resource|\[vite\]/.test(m.text())) errors.push(m.text());
  });
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
    timeout: 120000,
  });

  return {
    app,
    page,
    errors,
    close: async () => {
      await app.close();
      await server.close();
      fs.rmSync(userData, { recursive: true, force: true });
    },
  };
}
