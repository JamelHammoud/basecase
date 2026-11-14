import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import net, { type AddressInfo } from 'node:net';
import path from 'node:path';
import { createServer, preview, searchForWorkspaceRoot } from 'vite';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    appUrl: string;
    webUrl: string;
    served: 'bundle' | 'dev';
    hubPort: number;
    servicePort: number;
    tilesPort: number;
  }
}

interface Target {
  key: 'appUrl' | 'webUrl';
  mode: string;
  devMode: string;
  outDir: string;
  build: string;
  cacheDir?: string;
}

interface Running {
  url: string;
  close: () => Promise<void>;
}

const TARGETS: Target[] = [
  { key: 'appUrl', mode: 'production', devMode: 'development', outDir: 'dist', build: 'npx vite build' },
  {
    key: 'webUrl',
    mode: 'web',
    devMode: 'web',
    outDir: 'dist-web',
    build: 'npx vite build --mode web --outDir dist-web',
    cacheDir: 'node_modules/.vite-web',
  },
];

const SOURCES = ['src', 'public', 'index.html', 'vite.config.ts'];

const fileTimes = (entry: string): number[] => {
  const stat = statSync(entry);

  if (!stat.isDirectory()) return [stat.mtimeMs];

  return readdirSync(entry, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.includes('.test.'))
    .map((d) => statSync(path.join(d.parentPath, d.name)).mtimeMs);
};

const newestSource = () =>
  SOURCES.filter((s) => existsSync(s))
    .flatMap(fileTimes)
    .reduce((a, b) => Math.max(a, b), 0);

function bundleState(outDir: string): 'fresh' | 'stale' | 'missing' {
  const index = path.join(outDir, 'index.html');

  if (!existsSync(index)) return 'missing';

  return statSync(index).mtimeMs >= newestSource() ? 'fresh' : 'stale';
}

const urlOf = (urls: { local: string[] } | null) => urls!.local[0].replace(/\/$/, '');

async function serveBundle(target: Target): Promise<Running> {
  const server = await preview({
    configFile: 'vite.config.ts',
    mode: target.mode,
    build: { outDir: target.outDir },
    preview: { port: 0, open: false },
    logLevel: 'silent',
  });

  return { url: urlOf(server.resolvedUrls), close: () => server.close() };
}

async function serveDev(target: Target): Promise<Running> {
  const fs = { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] };
  const server = await createServer({
    configFile: 'vite.config.ts',
    mode: target.devMode,
    cacheDir: target.cacheDir,
    server: { port: 0, fs },
    logLevel: 'silent',
  });

  await server.listen();

  return { url: urlOf(server.resolvedUrls), close: () => server.close() };
}

function servesBundle(target: Target): boolean {
  if (process.env.BASECASE_E2E_SERVER === 'dev') return false;

  const state = bundleState(target.outDir);

  if (state === 'fresh') return true;

  if (process.env.CI) throw new Error(`e2e needs a fresh ${target.outDir}/ (${state}): run ${target.build}`);

  console.log(`e2e: ${target.outDir}/ is ${state}, serving ${target.key} from the Vite dev server`);

  return false;
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;

      probe.close(() => resolve(port));
    });
  });

export default async function setup(project: TestProject) {
  const hubPort = await freePort();

  process.env.BASECASE_HUB_URL = `http://127.0.0.1:${hubPort}`;
  project.provide('hubPort', hubPort);

  const servicePort = await freePort();

  process.env.BASECASE_PRINT_SERVICE_URL = `http://127.0.0.1:${servicePort}`;
  project.provide('servicePort', servicePort);

  const tilesPort = await freePort();

  process.env.BASECASE_EARTH_TILES_URL = `http://127.0.0.1:${tilesPort}`;
  project.provide('tilesPort', tilesPort);

  const bundled = TARGETS.map(servesBundle);
  const running = await Promise.all(TARGETS.map((t, i) => (bundled[i] ? serveBundle(t) : serveDev(t))));

  running.forEach((r, i) => project.provide(TARGETS[i].key, r.url));
  project.provide('served', bundled[0] ? 'bundle' : 'dev');

  return async () => {
    await Promise.all(running.map((r) => r.close()));
  };
}
