import { afterEach, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { specToPart } from '../../agent/agentScene';
import { PartLayer } from './partLayer';
import { completeViewport, prepareViewport } from './sceneCompletion';
import type { ViewportContext } from './viewportContext';
import type { Viewport3DHandle } from './types';
import { completing } from './engineKeys';
import { preparePart } from '../partMesh/prepare';

const worker = vi.hoisted(() => ({ pending: Promise.resolve() }));

vi.mock('../partMesh/prepare', () => ({
  preparePart: vi.fn(() => worker.pending),
}));
vi.mock('../componentMeshes', () => ({ componentMeshesReady: async () => [] }));

afterEach(() => vi.clearAllMocks());

function scene() {
  let release = () => {};

  worker.pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  let parts = [specToPart({ id: 'prepared', shape: 'box' })];
  let worldParts = [specToPart({ id: 'world-source', shape: 'box' })];
  let lost = false;
  const layer = new PartLayer(new Group(), () => queueMicrotask(() => layer.buildPending()));

  layer.sync(parts, new Set(), 0);

  const ctx = {
    layer,
    world: new PartLayer(new Group()),
    props: () => ({ parts, worldParts }),
    loop: { finishSpawns: vi.fn() },
    stage: { renderer: { getContext: () => ({ isContextLost: () => lost }) } },
  } as unknown as ViewportContext;

  return {
    ctx,
    release,
    rewrap: () => {
      parts = [...parts];
    },
    replaceWorld: () => {
      worldParts = [{ ...worldParts[0], name: 'Changed world' }];
    },
    replace: () => {
      parts = [{ ...parts[0], name: 'New scene edit' }];
      layer.sync(parts, new Set(), 0);
    },
    dispose: () => {
      lost = true;
      layer.dispose();
    },
  };
}

it('never forces worker-pending geometry onto the interaction thread and completes reads after preparation', async () => {
  const current = scene();
  const built = vi.fn();
  const pending = prepareViewport(current.ctx, built);
  const parallel = prepareViewport(current.ctx, built);

  expect(() => completeViewport(current.ctx)).toThrow();
  expect(current.ctx.layer.get('prepared')).toBeUndefined();
  current.release();
  await expect(pending).resolves.toEqual([]);
  await expect(parallel).resolves.toEqual([]);
  expect(preparePart).toHaveBeenCalledOnce();
  expect(current.ctx.layer.get('prepared')).toBeDefined();
  expect(built).toHaveBeenCalledOnce();
  expect(current.ctx.layer.hasPending).toBe(false);
  current.ctx.layer.dispose();
});

it.each(['replace', 'replaceWorld', 'dispose'] as const)(
  'refuses a pending read after %s without building stale geometry',
  async (change) => {
    const current = scene();
    const built = vi.fn();
    const pending = prepareViewport(current.ctx, built);

    current[change]();
    current.release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(built).not.toHaveBeenCalled();
    current.ctx.layer.dispose();
  },
);

it('keeps selection styling independent of correct geometry reads', async () => {
  const current = scene();
  const ready = prepareViewport(current.ctx, () => {});

  current.release();
  await ready;
  current.ctx.layer.sync(current.ctx.props().parts, new Set(['prepared']), 0);
  expect(current.ctx.layer.hasPending).toBe(true);
  expect(() => completeViewport(current.ctx)).not.toThrow();
  current.ctx.layer.dispose();
  await Promise.resolve();
  expect(current.ctx.layer.hasPending).toBe(false);
});

it('keeps ordinary picks synchronous while whole-scene reads await preparation', async () => {
  let release = () => {};
  const pending = new Promise<string[]>((resolve) => {
    release = () => resolve([]);
  });
  const point = { partId: 'drawn', point: [0, 0, 0] };
  const picked = vi.fn(() => point);
  const measured = vi.fn(async () => ({}));
  const complete = vi.fn();
  const wrapped = completing(
    { pickAt: picked, measureParts: measured } as unknown as Viewport3DHandle,
    complete,
    () => pending,
  );
  const query = wrapped.measureParts();

  expect(wrapped.pickAt(0, 0)).toBe(point);
  expect(complete).not.toHaveBeenCalled();
  expect(measured).not.toHaveBeenCalled();
  release();
  await query;
  expect(complete).toHaveBeenCalledOnce();
  expect(measured).toHaveBeenCalledOnce();
});

it('returns unavailable geometry for a pending synchronous selection query without forcing preparation', () => {
  const current = scene();
  const triangles = vi.fn(() => new Float32Array([1, 2, 3]));
  const wrapped = completing(
    { partTriangles: triangles } as unknown as Viewport3DHandle,
    (ids) => completeViewport(current.ctx, ids),
    () => prepareViewport(current.ctx, () => {}),
  );

  expect(wrapped.partTriangles('prepared')).toBeNull();
  expect(triangles).not.toHaveBeenCalled();
  expect(() => completeViewport(current.ctx, ['other-part'])).not.toThrow();
  current.ctx.layer.dispose();
  current.release();
});

it('releases pending scene readers immediately when its layer is disposed', async () => {
  const current = scene();
  const pending = current.ctx.layer.whenReady();

  current.ctx.layer.dispose();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await expect(current.ctx.layer.whenReady()).rejects.toMatchObject({ name: 'AbortError' });
  current.release();
  await Promise.resolve();
  expect(current.ctx.layer.hasPending).toBe(false);
});

it('rejects an old source while replacement geometry is still pending', async () => {
  const current = scene();
  const ready = prepareViewport(current.ctx, () => {});

  await new Promise<void>((resolve) => setImmediate(resolve));
  current.replace();
  await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
  expect(current.ctx.layer.get('prepared')).toBeUndefined();
  current.dispose();
  current.release();
});

it('finishes spawn transforms before preparing stable geometry snapshots', async () => {
  const current = scene();
  let finished = false;

  current.ctx.loop.finishSpawns = () => {
    finished = true;
    current.ctx.layer.get('prepared')!.scale.set(1, 1, 1);
  };

  const ready = prepareViewport(current.ctx, () => {});

  current.release();
  await ready;
  expect(finished).toBe(true);
  current.ctx.layer.dispose();
});

it('retains a source and its pending readers when a render only replaces the parts array', async () => {
  const current = scene();
  const built = vi.fn();
  const pending = prepareViewport(current.ctx, built);

  current.rewrap();
  expect(prepareViewport(current.ctx, built)).toBe(pending);
  current.release();
  await expect(pending).resolves.toEqual([]);
  expect(built).toHaveBeenCalledOnce();
  current.ctx.layer.dispose();
});

it('waits for world preparation and refuses its failed geometry without forcing a build', async () => {
  const current = scene();
  let reject = (_error: Error) => {};

  worker.pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  current.ctx.world.sync([specToPart({ id: 'world-object', shape: 'box' })], new Set(), 0);

  const ready = prepareViewport(current.ctx, () => {});
  const failure = new Error('World preparation failed');

  current.release();
  reject(failure);
  await expect(ready).rejects.toBe(failure);
  await expect(current.ctx.world.whenReady()).rejects.toBe(failure);
  expect(current.ctx.world.get('world-object')).toBeUndefined();
  current.ctx.world.dispose();
  current.ctx.layer.dispose();
});
