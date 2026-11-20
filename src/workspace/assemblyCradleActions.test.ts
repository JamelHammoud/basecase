import { beforeAll, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import { loadManifold, type ManifoldApi } from '../wrap/manifold';
import { cradleJobFixture } from '../print/cradleJob.fixtures';
import type { PreparedCradle } from '../print/cradleJob';
import type { CradleOptions } from './useAssemblyCradle';
import type { ShapeReport } from '../three/analysis/shapeReports';
import {
  currentCradleResult,
  FACE_DIRECTIONS,
  loadCradleFaces,
  type CradleActionContext,
} from './assemblyCradleActions';

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

function deferredFaces() {
  let finish: (reports: Record<string, ShapeReport>) => void = () => {};
  const promise = new Promise<Record<string, ShapeReport>>((resolve) => {
    finish = resolve;
  });

  return {
    promise,
    finish: (id: string) =>
      finish({ [id]: { check: { poses: [{ down: [0.6, 0.8, 0] }] } } } as unknown as Record<string, ShapeReport>),
  };
}

it('keeps only the latest selected source faces and discards a closed sheet reply', async () => {
  const first = deferredFaces();
  const second = deferredFaces();
  const cancelled = deferredFaces();
  const parts: CradleOptions['docs']['parts'] = [];
  const setDirections = vi.fn();
  const options = {
    docs: { parts, partsRef: { current: parts } },
    viewportRef: {
      current: {
        restBounds: () => null,
        restShapes: (ids: string[]) => ({ instances: [{ id: ids[0], matrix: new Matrix4().toArray() }] }),
        printShapes: vi
          .fn()
          .mockReturnValueOnce(first.promise)
          .mockReturnValueOnce(second.promise)
          .mockReturnValueOnce(cancelled.promise),
      },
    },
  } as unknown as CradleOptions;
  const context = {
    options,
    latest: { current: options },
    faceRun: { current: 0 },
    choices: ['first', 'second'].map((id) => ({ id, name: id, ids: [id] })),
    setDirections,
    setOrigin: vi.fn(),
  } as unknown as CradleActionContext;
  const a = loadCradleFaces(context, 'first');
  const b = loadCradleFaces(context, 'second');

  second.finish('second');
  await b;
  expect(setDirections).toHaveBeenCalledExactlyOnceWith([...FACE_DIRECTIONS, [0.6, 0.8, 0]]);
  first.finish('first');
  await a;
  expect(setDirections).toHaveBeenCalledTimes(1);

  const c = loadCradleFaces(context, 'first');

  context.faceRun.current++;
  cancelled.finish('first');
  await c;
  expect(setDirections).toHaveBeenCalledTimes(1);
});
