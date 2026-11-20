import { beforeAll, expect, it } from 'vitest';
import { loadManifold, type ManifoldApi } from '../wrap/manifold';
import { cradleJobFixture } from '../print/cradleJob.fixtures';
import type { PreparedCradle } from '../print/cradleJob';
import type { CradleOptions } from './useAssemblyCradle';
import { currentCradleResult } from './assemblyCradleActions';

let api: ManifoldApi;

beforeAll(async () => {
  api = await loadManifold();
});

it('invalidates prepared tooling on source, project, session, step, plan, scene and printer replacement', () => {
  const job = cradleJobFixture(api, 0);
  const result = { job, prepared: {} as PreparedCradle };
  const options = {
    scene: { sceneId: job.sceneId },
    docs: { parts: job.parts, project: job.project },
    buildAlong: { sessionId: job.sessionId, index: job.step, plan: job.plan },
    printing: { printer: job.printer },
  } as CradleOptions;
  const replacements = [
    { ...options, docs: { ...options.docs, parts: job.parts.slice() } },
    { ...options, docs: { ...options.docs, project: structuredClone(job.project) } },
    { ...options, buildAlong: { ...options.buildAlong, sessionId: job.sessionId + 1 } },
    { ...options, buildAlong: { ...options.buildAlong, index: job.step + 1 } },
    { ...options, buildAlong: { ...options.buildAlong, plan: structuredClone(job.plan) } },
    { ...options, scene: { sceneId: 'another-scene' } },
    { ...options, printing: { ...options.printing, printer: { ...job.printer, nozzle: 0.6 } } },
  ];

  expect(currentCradleResult(result, options, true)).toBe(result);
  expect(currentCradleResult(result, options, false)).toBeNull();

  for (const replacement of replacements) expect(currentCradleResult(result, replacement, true)).toBeNull();
});
