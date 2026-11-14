import fs from 'node:fs';
import { createServer } from 'vite';
import { root } from '../harness.mjs';
import { keepStartCases, recordFromFixture } from './materialize.mjs';
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

export async function caseKitFn() {
  const [builder, kinematics] = await Promise.all([
    appModule('/src/cases/caseBuilder.ts'),
    appModule('/src/utils/kinematics.ts'),
  ]);

  return { buildCase: builder.buildCase, builderRobot: builder.builderRobot, buildRig: kinematics.buildRig };
}

async function fixtureRecord(fixture, { specToPart, caseKit }) {
  const kit = fixture.cases?.length ? (caseKit ?? (await caseKitFn())) : null;

  return recordFromFixture(fixture, specToPart ?? (await specToPartFn()), kit);
}

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export async function startRecord(task, ctx = {}) {
  const file = startSceneFile(task, ctx.dataDir);

  if (file) return readJson(file);

  if (task.startScene) return task.startScene();

  return fixtureRecord(task.fixture(), ctx);
}

export async function solutionRecord(task, ctx = {}, start = null) {
  if (task.solutionScene) return task.solutionScene();

  if (!task.solution) return null;

  return keepStartCases(await fixtureRecord(task.solution(), ctx), start);
}
