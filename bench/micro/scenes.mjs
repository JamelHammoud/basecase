import fs from 'node:fs';
import { createServer } from 'vite';
import { root } from '../harness.mjs';
import { recordFromFixture } from './materialize.mjs';
import { startSceneFile } from './tasks/index.mjs';

let server = null;

export async function appModule(file) {
  server ??= await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  return server.ssrLoadModule(file);
}

export async function closeAppModules() {
  await server?.close();
  server = null;
}

export async function specToPartFn() {
  return (await appModule('/src/agent/agentScene.ts')).specToPart;
}

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export async function startRecord(task, { specToPart, dataDir } = {}) {
  const file = startSceneFile(task, dataDir);

  if (file) return readJson(file);

  return recordFromFixture(task.fixture(), specToPart ?? (await specToPartFn()));
}

export async function solutionRecord(task, { specToPart } = {}) {
  if (!task.solution) return null;

  return recordFromFixture(task.solution(), specToPart ?? (await specToPartFn()));
}
