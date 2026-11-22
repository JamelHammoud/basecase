import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { selfContactArmInput } from './fixtures/selfContactArm';
import { useSceneModel } from './useSceneModel';
import { preparedWorldItems } from '../cases/fixtureCollision';
import { preparedCalibratedModel } from './calibratedModel';
import { NO_GUESTS } from './simGuests';

const pending = vi.hoisted(() => ({ world: Promise.resolve() }));

vi.mock('../cases/fixtureCollision', () => ({
  preparedWorldItems: vi.fn(async () => {
    await pending.world;

    return [];
  }),
}));
vi.mock('./calibratedModel', () => ({
  preparedCalibratedModel: vi.fn(async (_input, _calibrations, options) => {
    options.signal.throwIfAborted();

    throw new Error('Unexpected model preparation');
  }),
}));

afterEach(() => {
  pending.world = Promise.resolve();
  vi.clearAllMocks();
});

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

function sceneModel() {
  const meshes = gate();
  const measurement = gate();
  const viewport = {
    meshesReady: vi.fn(() => meshes.promise),
    measureParts: vi.fn(async () => {
      await measurement.promise;

      return {};
    }),
    posedFloor: vi.fn(async () => -10),
    partTriangles: () => null,
  };
  let model: ReturnType<typeof useSceneModel> | undefined;
  const Host = () => {
    model = useSceneModel({
      ...selfContactArmInput(false),
      pose: undefined,
      restDeltas: new Map(),
      viewportRef: { current: viewport as unknown as Viewport3DHandle },
    });

    return null;
  };

  renderToStaticMarkup(createElement(Host));

  return { model: model!, meshes, measurement, viewport };
}

it('stops cancelled model work before gathering geometry after a pending mesh load', async () => {
  const scene = sceneModel();
  const work = scene.model.buildModel();

  scene.model.cancelPreparation();
  scene.meshes.release();
  await expect(work).rejects.toMatchObject({ name: 'AbortError' });
  expect(scene.viewport.measureParts).not.toHaveBeenCalled();
  expect(preparedWorldItems).not.toHaveBeenCalled();
  expect(preparedCalibratedModel).not.toHaveBeenCalled();
});

it('does not queue world preparation after cancellation during geometry measurement', async () => {
  const scene = sceneModel();
  const controller = new AbortController();
  const work = scene.model.buildModel({ signal: controller.signal });

  scene.meshes.release();
  await Promise.resolve();
  expect(scene.viewport.measureParts).toHaveBeenCalledOnce();
  controller.abort();
  scene.measurement.release();
  await expect(work).rejects.toMatchObject({ name: 'AbortError' });
  expect(preparedWorldItems).not.toHaveBeenCalled();
  expect(preparedCalibratedModel).not.toHaveBeenCalled();
});

it('does not start another model worker when world preparation finishes after cancellation', async () => {
  const scene = sceneModel();
  const world = gate();

  pending.world = world.promise;
  scene.meshes.release();
  scene.measurement.release();

  const work = scene.model.buildModel();

  await vi.waitFor(() => expect(preparedWorldItems).toHaveBeenCalledOnce());
  scene.model.cancelPreparation();
  world.release();
  await expect(work).rejects.toMatchObject({ name: 'AbortError' });
  expect(preparedCalibratedModel).not.toHaveBeenCalled();
});

it('refuses an old Case world when the active world changes during preparation', async () => {
  const scene = sceneModel();
  const world = gate();

  pending.world = world.promise;
  scene.meshes.release();
  scene.measurement.release();

  const work = scene.model.buildModel();

  await vi.waitFor(() => expect(preparedWorldItems).toHaveBeenCalledOnce());
  scene.model.setWorldItems([], NO_GUESTS);
  world.release();
  await expect(work).rejects.toMatchObject({ name: 'AbortError' });
  expect(preparedCalibratedModel).not.toHaveBeenCalled();
});

it.each(['buildGuide', 'bodyEvidence', 'physics', 'snapshot'] as const)(
  'retains pending model source checks across %s publication',
  async (field) => {
    const scene = sceneModel();
    const prepared = gate();

    vi.mocked(preparedCalibratedModel).mockImplementationOnce(async (_input, _calibrations, options) => {
      await prepared.promise;

      if (!options?.current?.()) throw new Error('Model source changed');

      return {} as Awaited<ReturnType<typeof preparedCalibratedModel>>;
    });
    scene.meshes.release();
    scene.measurement.release();

    const work = scene.model.buildModel();

    await vi.waitFor(() => expect(preparedCalibratedModel).toHaveBeenCalledOnce());

    const captured = scene.model.inputsRef.current;
    const guide = {
      id: 'guide',
      fingerprint: 'generated',
      generatedAt: '2026-11-22T00:00:00Z',
      pages: 1,
      steps: 1,
      orderTimedOut: false,
    };
    const updates = {
      buildGuide: { buildGuide: guide },
      bodyEvidence: { bodyEvidence: [] },
      physics: { material: 'petg' },
      snapshot: {},
    };

    scene.model.inputsRef.current = { ...captured, project: { ...captured.project, ...updates[field] } };
    prepared.release();

    if (field === 'physics' || field === 'snapshot') {
      await expect(work).rejects.toThrow('Model source changed');

      return;
    }

    await expect(work).resolves.toEqual({});
  },
);
