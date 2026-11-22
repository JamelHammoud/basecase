import { expect, it, vi } from 'vitest';
import { BoxGeometry } from 'three';
import { selfContactArmInput } from './fixtures/selfContactArm';
import { prepareContactJob } from './contactPreparation';
import { contactJob, prepareContactModel } from './contactPreparationClient';
import loadMujoco from '@mujoco/mujoco';
import { SimEngine } from './engine';
import { headlessParts } from '../three/headlessParts';
import { componentMeshesReady, forgetComponentMesh } from '../three/componentMeshes';
import { buildMjcf } from './mjcf';
import type { WorldItem } from './mjcfTypes';

it('retains supplied world collision triangles through contact preparation', async () => {
  const input = selfContactArmInput(true);
  const obstacle: WorldItem = {
    ...input.parts[0],
    id: 'obstacle',
    kind: 'mesh',
    position: [500, 100, 0],
    behavior: 'static',
  };
  const geometry = new BoxGeometry(20, 30, 40).toNonIndexed();
  const triangles = new Float32Array(geometry.attributes.position.array);
  const scene = {
    ...input,
    world: [obstacle],
    worldTriangles: (id: string) => (id === obstacle.id ? triangles : null),
  };

  try {
    const model = await prepareContactModel(scene);
    const disabled = buildMjcf({ ...scene, project: { ...input.project, selfContact: {} } });
    const worldGeom = (xml: string) => xml.match(/<geom name="wg_obstacle"[^>]*>/)?.[0];

    expect(worldGeom(model.xml)).toContain('type="mesh"');
    expect(worldGeom(model.xml)).toBe(worldGeom(disabled.xml));
  } finally {
    geometry.dispose();
  }
});

it('rejects failed component display placeholders in headless contact preparation while retaining the disabled fallback', async () => {
  const input = selfContactArmInput(true);
  const componentId = 'self-contact-missing-component';
  const parts = input.parts.map((part) =>
    part.id === 'tip' ? { ...part, kind: 'component' as const, componentId } : part,
  );

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  );

  try {
    expect(await componentMeshesReady([componentId])).toEqual([componentId]);

    const loaded = await headlessParts(parts, input.rig.joints, {});
    const scene = { ...input, parts, measures: loaded.measures, partTriangles: loaded.partTriangles };

    expect(loaded.partTriangles('tip')).toBeNull();
    await expect(prepareContactModel(scene)).rejects.toThrow('Repair collision geometry for');
    expect(buildMjcf({ ...scene, project: { ...input.project, selfContact: {} } }).xml).toContain('g_tip');
  } finally {
    forgetComponentMesh(componentId);
    vi.unstubAllGlobals();
  }
});

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
