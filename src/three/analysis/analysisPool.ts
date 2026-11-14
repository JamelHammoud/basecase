import { workerClient, type WorkerClient } from '../../utils/workerRpc';
import type { Coplanar, Interference } from '../interference';
import type { MeshMeasure } from '../meshMeasure';
import type { MeshData } from '../../print/threeMf';
import type { SheetProfile } from '../../sheet/detect';
import type { ShapeReport } from './shapeReports';
import type { CollideOptions } from './collide';
import type { OutputRiders } from './outputRiders';
import {
  analysisHandlers,
  MISSING_SHAPE,
  type AnalysisTask,
  type Instance,
  type PlateFilesInput,
  type StlItem,
  type ThreeMfResult,
} from './analysisOps';
import { copyGeometries, type SceneShapes } from './sceneShapes';
import type { SweepHit, SweepSpec } from './sweep';
import type { PairIds } from './gaps';
import type { FitCoupon, FitCouponTask } from './fitCoupons';
import type { ChainResult, FastenerInput } from '../../assembly/assemblyTypes';
import type { AssemblyGeometry, AssemblyGeometryInput } from '../../assembly/assemblyGeometry';
import type { FoundAxis } from '../../joints/axisFinder';
import type { JointAxes } from '../../joints/jointCandidates';
import type { JointAxisQuery } from './jointAxis';
import type { ArmModel, PayloadMap } from '../../utils/payload';
import type { StrengthJob, StrengthReading } from '../../strength/types';
import { errorMessage } from '../../utils/errorMessage';

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

      if (!errorMessage(error).includes(MISSING_SHAPE)) throw error;

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
  options: CollideOptions & { riders?: OutputRiders },
): Promise<{ interferences: Interference[]; coplanar: Coplanar[] }> {
  return analyze(leastBusy(), scene, { kind: 'interference', instances: scene.instances, ...options });
}

export function printReportsIn(
  scene: SceneShapes,
  faces?: Record<string, Array<[number, number, number]>>,
): Promise<Record<string, ShapeReport>> {
  return analyze(leastBusy(), scene, { kind: 'print', instances: scene.instances, faces });
}

export function printMeshesIn(scene: SceneShapes): Promise<Record<string, MeshData>> {
  return analyze(leastBusy(), scene, { kind: 'meshes', instances: scene.instances });
}

export function sheetProfilesIn(scene: SceneShapes): Promise<Record<string, SheetProfile | null>> {
  return analyze(leastBusy(), scene, { kind: 'sheets', instances: scene.instances });
}

export function threeMfIn(scene: SceneShapes, plates: PlateFilesInput): Promise<ThreeMfResult> {
  return analyze(leastBusy(), scene, { kind: 'threeMf', instances: scene.instances, ...plates });
}

export function partStlsIn(scene: SceneShapes, items: StlItem[]): Promise<Record<string, Uint8Array>> {
  return analyze(leastBusy(), scene, { kind: 'partStls', instances: scene.instances, items });
}

export function stlIn(scene: SceneShapes): Promise<Uint8Array> {
  return analyze(leastBusy(), scene, { kind: 'stl', instances: scene.instances });
}

export function visibilityIn(scene: SceneShapes): Promise<Record<string, number>> {
  return analyze(leastBusy(), scene, { kind: 'visibility', instances: scene.instances });
}

export function measuresIn(scene: SceneShapes): Promise<Record<string, MeshMeasure>> {
  return analyze(leastBusy(), scene, { kind: 'measure', instances: scene.instances });
}

export function floorIn(scene: SceneShapes): Promise<number | null> {
  return analyze(leastBusy(), scene, { kind: 'floor', instances: scene.instances });
}

export function gapsIn(scene: SceneShapes, pairs: PairIds[], withinMm: number): Promise<PairIds[]> {
  if (!pairs.length) return Promise.resolve([]);

  return analyze(leastBusy(), scene, { kind: 'gaps', instances: scene.instances, pairs, withinMm });
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

export async function payloadMapsIn(arms: ArmModel[]): Promise<Array<PayloadMap | null>> {
  if (!arms.length) return [];

  const client = leastBusy();

  client.busy++;

  try {
    return await client.rpc.call('payloadMaps', arms);
  } finally {
    client.busy--;
  }
}

export async function strengthIn(scene: SceneShapes, jobs: StrengthJob[]): Promise<Array<StrengthReading | null>> {
  if (!jobs.length) return [];

  const workers = pool().slice(0, jobs.length);
  const chunks = workers.map((_, w) => jobs.map((job, i) => ({ job, i })).filter(({ i }) => i % workers.length === w));
  const results = await Promise.all(
    chunks.map((chunk, w) =>
      analyze<Array<StrengthReading | null>>(workers[w], scene, {
        kind: 'strength',
        instances: scene.instances,
        jobs: chunk.map((c) => c.job),
      }),
    ),
  );
  const out: Array<StrengthReading | null> = new Array(jobs.length).fill(null);

  chunks.forEach((chunk, w) => chunk.forEach((c, k) => (out[c.i] = results[w][k])));

  return out;
}

export function fastenersIn(scene: SceneShapes, input: FastenerInput): Promise<ChainResult> {
  return analyze(leastBusy(), scene, { kind: 'fasteners', instances: scene.instances, ...input });
}

export function assemblyIn(scene: SceneShapes, input: AssemblyGeometryInput): Promise<AssemblyGeometry> {
  return analyze(leastBusy(), scene, { kind: 'assembly', instances: scene.instances, ...input });
}

export function jointAxisIn(scene: SceneShapes, query: JointAxisQuery): Promise<FoundAxis | null> {
  return analyze(pool()[0], scene, { kind: 'jointAxis', instances: scene.instances, ...query });
}

export function jointAxesIn(scene: SceneShapes, ids: string[]): Promise<JointAxes> {
  return analyze(leastBusy(), scene, { kind: 'jointAxes', instances: scene.instances, ids });
}

export function fitCouponsIn(scene: SceneShapes, task: FitCouponTask): Promise<FitCoupon[]> {
  if (!task.fits.length || !task.hosts.length) return Promise.resolve([]);

  return analyze(leastBusy(), scene, { kind: 'fitCoupons', instances: scene.instances, ...task });
}
