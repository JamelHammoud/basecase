import { workerClient, type WorkerClient } from '../../utils/workerRpc';
import type { Coplanar, Interference } from '../interference';
import type { MeshMeasure } from '../meshMeasure';
import type { ShapeReport } from './shapeReports';
import type { CollideOptions } from './collide';
import { analysisHandlers, MISSING_SHAPE, type AnalysisTask, type GeometryPayload, type Instance } from './analysisOps';
import { geometryPayload, type SceneShapes } from './sceneShapes';
import type { SweepHit, SweepSpec } from './sweep';

interface Client {
  rpc: WorkerClient<typeof analysisHandlers>;
  shapes: Set<string>;
  geometries: Set<string>;
  busy: number;
  sending: Promise<unknown>;
}

const POOL_SIZE = Math.min(4, Math.max(1, Math.floor((globalThis.navigator?.hardwareConcurrency ?? 2) / 2)));
const RETAIN_SLACK = 64;
let clients: Client[] | null = null;

function pool(): Client[] {
  clients ??= Array.from({ length: POOL_SIZE }, () => ({
    rpc: workerClient<typeof analysisHandlers>(
      () => new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' }),
      async () => analysisHandlers,
    ),
    shapes: new Set<string>(),
    geometries: new Set<string>(),
    busy: 0,
    sending: Promise.resolve(),
  }));

  return clients;
}

const SLICE_MS = 8;
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function copyGeometries(scene: SceneShapes, ids: string[]) {
  const out: GeometryPayload[] = [];
  let sliceStart = performance.now();

  for (const id of ids) {
    out.push(geometryPayload(id, scene.geometries.get(id)!));

    if (performance.now() - sliceStart < SLICE_MS) continue;

    await yieldToMain();
    sliceStart = performance.now();
  }

  return out;
}

async function payloadFor(client: Client, scene: SceneShapes, instances: Instance[]) {
  const shapes = [...new Set(instances.map((i) => i.key))]
    .filter((key) => !client.shapes.has(key))
    .map((key) => scene.shapes.get(key)!);
  const geometryIds = [...new Set(shapes.flatMap((s) => s.meshes.map((m) => m.geometry)))].filter(
    (id) => !client.geometries.has(id),
  );

  shapes.forEach((s) => client.shapes.add(s.key));
  geometryIds.forEach((id) => client.geometries.add(id));

  const geometries = await copyGeometries(scene, geometryIds);

  return {
    shapes,
    geometries,
    transfer: geometries.flatMap((g) => [g.positions.buffer, ...(g.index ? [g.index.buffer] : [])]),
  };
}

async function retain(client: Client, scene: SceneShapes) {
  if (client.shapes.size <= scene.shapes.size + RETAIN_SLACK) return;

  const keys = [...scene.shapes.keys()].filter((k) => client.shapes.has(k));
  const geometryIds = [...scene.geometries.keys()].filter((g) => client.geometries.has(g));

  client.shapes = new Set(keys);
  client.geometries = new Set(geometryIds);
  await client.rpc.call('retain', { keys, geometryIds });
}

async function analyze<R>(client: Client, scene: SceneShapes, task: AnalysisTask): Promise<R> {
  const send = () => {
    const posted = client.sending.then(async () => {
      const { shapes, geometries, transfer } = await payloadFor(client, scene, task.instances);

      return client.rpc.call('analyze', { shapes, geometries, task }, transfer) as Promise<R>;
    });

    client.sending = posted.catch(() => {});

    return posted;
  };

  client.busy++;

  try {
    return await send().catch((error: unknown) => {
      client.shapes.clear();
      client.geometries.clear();

      if (!String((error as Error)?.message ?? error).includes(MISSING_SHAPE)) throw error;

      return send();
    });
  } finally {
    client.busy--;
    void retain(client, scene).catch(() => {});
  }
}

const leastBusy = () => pool().reduce((best, c) => (c.busy < best.busy ? c : best));

export function interferenceIn(
  scene: SceneShapes,
  options: CollideOptions,
): Promise<{ interferences: Interference[]; coplanar: Coplanar[] }> {
  return analyze(leastBusy(), scene, { kind: 'interference', instances: scene.instances, ...options });
}

export function printReportsIn(scene: SceneShapes): Promise<Record<string, ShapeReport>> {
  return analyze(leastBusy(), scene, { kind: 'print', instances: scene.instances });
}

export function measuresIn(scene: SceneShapes): Promise<Record<string, MeshMeasure>> {
  return analyze(leastBusy(), scene, { kind: 'measure', instances: scene.instances });
}

export async function sweepsIn(scene: SceneShapes, sweeps: SweepSpec[]): Promise<SweepHit[][]> {
  if (!sweeps.length) return [];

  const workers = pool().slice(0, sweeps.length);
  const chunks = workers.map((_, w) => sweeps.map((s, i) => ({ s, i })).filter(({ i }) => i % workers.length === w));
  const results = await Promise.all(
    chunks.map((chunk, w) =>
      analyze<SweepHit[][]>(workers[w], scene, {
        kind: 'sweeps',
        instances: scene.instances,
        sweeps: chunk.map((c) => c.s),
      }),
    ),
  );
  const out: SweepHit[][] = new Array(sweeps.length);

  chunks.forEach((chunk, w) => chunk.forEach((c, k) => (out[c.i] = results[w][k])));

  return out;
}
