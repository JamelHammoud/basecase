import { expect, it, vi } from 'vitest';
import { BoxGeometry } from 'three';
import { selfContactArmInput } from './fixtures/selfContactArm';
import { prepareContactJob } from './contactPreparation';
import { contactJob, prepareContactModel } from './contactPreparationClient';
import loadMujoco from '@mujoco/mujoco';
import { SimEngine } from './engine';

it('reuses collision geometry by content while rebuilding placement and rejects starting penetration', async () => {
  const input = selfContactArmInput(true);
  const tip = input.parts.find((part) => part.id === 'tip')!;
  const triangles = new Float32Array(new BoxGeometry(90, 10, 10).toNonIndexed().attributes.position.array);
  const parts = input.parts.map((part) => (part === tip ? { ...part, kind: 'mesh' as const } : part));
  const meshInput = { ...input, parts, partTriangles: (id: string) => (id === tip.id ? triangles : null) };
  const first = await prepareContactJob(contactJob(meshInput));
  const second = await prepareContactJob({ ...contactJob(meshInput), cache: first.cache });

  expect(first.metrics.prepared).toBe(1);
  expect(second.metrics.reused).toBe(1);
  expect(second.model.xml).toBe(first.model.xml);
  expect(second.model.xml).toContain('g_tip_c0');

  const moved = meshInput.parts.map((part) =>
    part.id === 'tip' ? { ...part, position: [45, 200, 100] as [number, number, number] } : part,
  );
  const placed = await prepareContactJob({ ...contactJob({ ...meshInput, parts: moved }), cache: first.cache });

  expect(placed.metrics.reused).toBe(1);
  expect(placed.model.xml).not.toBe(first.model.xml);
  await expect(prepareContactModel({ ...input, pose: { values: { elbow: -90 } } })).rejects.toThrow('Separate');
});

it('refuses unsupported geometry instead of substituting its bounding box', async () => {
  const input = selfContactArmInput(true);
  const parts = input.parts.map((part) => (part.id === 'tip' ? { ...part, kind: 'mesh' as const } : part));

  await expect(prepareContactJob(contactJob({ ...input, parts }))).rejects.toThrow('collision geometry');
});

it('rejects cancelled or stale preparation before publishing its model', async () => {
  const input = selfContactArmInput(true);
  const controller = new AbortController();

  controller.abort();
  await expect(prepareContactModel(input, { signal: controller.signal })).rejects.toThrow();
  await expect(prepareContactModel(input, { current: () => false })).rejects.toThrow();
});

it('keeps the opening in a concave base where a single hull would report penetration', async () => {
  const input = selfContactArmInput(true);
  const specs = [
    [-35, 0, 0, 10, 40, 40],
    [35, 0, 0, 10, 40, 40],
    [0, -15, 0, 60, 10, 40],
  ];
  const pieces = specs.map(
    ([x, y, z, width, height, depth]) =>
      new BoxGeometry(width, height, depth).translate(x, y, z).toNonIndexed().attributes.position.array,
  );
  const triangles = new Float32Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let offset = 0;

  for (const piece of pieces) {
    triangles.set(piece, offset);
    offset += piece.length;
  }

  const parts = input.parts.map((part) =>
    part.id === 'base' ? { ...part, kind: 'mesh' as const, dimensions: { width: 80, height: 40, depth: 40 } } : part,
  );
  const prepared = await prepareContactJob(
    contactJob({
      ...input,
      parts,
      pose: { values: { elbow: -90 } },
      partTriangles: (id) => (id === 'base' ? triangles : null),
    }),
  );
  const engine = new SimEngine(await loadMujoco(), prepared.model);

  try {
    expect(prepared.cache[0].hulls.length).toBeGreaterThan(1);
    expect(engine.contactPairs()).toHaveLength(0);
  } finally {
    engine.dispose();
  }
});

it.each(['abort', 'edit'])('discards an in-flight worker result after %s', async (action) => {
  const original = selfContactArmInput(true);
  const result = await prepareContactJob(contactJob(original));
  const controller = new AbortController();
  let current = true;
  let delivered: (() => void) | undefined;
  const terminated = vi.fn();

  class PreparationWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminate = terminated;
    postMessage() {
      delivered = () => this.onmessage?.({ data: { result } } as MessageEvent);
    }
  }

  vi.stubGlobal('Worker', PreparationWorker);

  try {
    const pending = prepareContactModel(original, { signal: controller.signal, current: () => current });

    if (action === 'abort') controller.abort();

    current = false;
    delivered?.();
    await expect(pending).rejects.toThrow();
    expect(terminated).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
