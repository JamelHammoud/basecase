import * as THREE from 'three';
import { weld, writeThreeMf } from '../../print/threeMf';
import { reply } from '../../utils/workerRpc';
import { collide, place, type CollideOptions } from './collide';
import { collideRiding, type OutputRiders } from './outputRiders';
import { printReportOf, worldMeasure } from './shapeReports';
import { mergeMeshes, solidFromPositions, type ShapeSolid } from './shapeSolid';
import { sweepClashes, type SweepSpec } from './sweep';

export interface GeometryPayload {
  id: string;
  positions: Float32Array;
  index: Uint32Array | null;
}

export interface ShapeSpec {
  key: string;
  meshes: Array<{ geometry: string; matrix: number[] }>;
}

export interface Instance {
  id: string;
  key: string;
  matrix: number[];
}

export type AnalysisTask =
  | ({ kind: 'interference'; instances: Instance[]; riders?: OutputRiders } & CollideOptions)
  | { kind: 'sweeps'; instances: Instance[]; sweeps: SweepSpec[] }
  | { kind: 'print'; instances: Instance[]; faces?: Record<string, Array<[number, number, number]>> }
  | { kind: 'measure' | 'meshes'; instances: Instance[] }
  | { kind: 'threeMf'; instances: Instance[]; files: ThreeMfFileSpec[]; plateSize: [number, number] };

export interface ThreeMfFileSpec {
  key: string;
  plates: Array<{ number: number; name: string }>;
  items: Array<{ id: string; name: string; matrix: number[]; plate: number }>;
}

export interface AnalyzePayload {
  geometries: GeometryPayload[];
  shapes: ShapeSpec[];
  task: AnalysisTask;
}

export const MISSING_SHAPE = 'analysis: missing shape';

const geometries = new Map<string, GeometryPayload>();
const specs = new Map<string, ShapeSpec>();
const solids = new Map<string, ShapeSolid>();

function solidOf(key: string): ShapeSolid {
  const cached = solids.get(key);

  if (cached) return cached;

  const spec = specs.get(key);
  const meshes = spec?.meshes.map((m) => ({ ...geometries.get(m.geometry)!, matrix: m.matrix }));

  if (!spec || meshes!.some((m) => !m.positions)) throw new Error(MISSING_SHAPE);

  const solid = solidFromPositions(mergeMeshes(meshes!));

  solids.set(key, solid);

  return solid;
}

const placeAll = (instances: Instance[]) =>
  instances.map((i) => place(i.id, solidOf(i.key), new THREE.Matrix4().fromArray(i.matrix)));

const byId = <T>(instances: Instance[], value: (i: Instance) => T) =>
  Object.fromEntries(instances.map((i) => [i.id, value(i)]));

function run(task: AnalysisTask) {
  switch (task.kind) {
    case 'interference': {
      const { instances, riders, ...options } = task;

      return riders ? collideRiding(placeAll(instances), options, riders) : collide(placeAll(instances), options);
    }
    case 'sweeps': {
      const placed = placeAll(task.instances);

      return task.sweeps.map((spec) => sweepClashes(placed, spec));
    }
    case 'print':
      return byId(task.instances, (i) => printReportOf(solidOf(i.key), task.faces?.[i.id]));
    case 'measure':
      return byId(task.instances, (i) => worldMeasure(solidOf(i.key), new THREE.Matrix4().fromArray(i.matrix)));
    case 'meshes':
      return byId(task.instances, (i) => weld(solidOf(i.key).positions));
    case 'threeMf':
      return threeMfFiles(task);
  }
}

function threeMfFiles(task: Extract<AnalysisTask, { kind: 'threeMf' }>) {
  const keyOf = new Map(task.instances.map((i) => [i.id, i.key]));
  const meshes = new Map<string, ReturnType<typeof weld>>();
  const meshOf = (key: string) => meshes.get(key) ?? meshes.set(key, weld(solidOf(key).positions)).get(key)!;

  return Object.fromEntries(
    task.files.map((file) => {
      const usable = file.items.filter((it) => keyOf.has(it.id));
      const objects = usable.map((it, i) => ({ id: i + 1, name: it.name, mesh: meshOf(keyOf.get(it.id)!) }));
      const items = usable.map((it, i) => ({ objectId: i + 1, matrix: it.matrix, plate: it.plate }));

      return [
        file.key,
        writeThreeMf({ layout: 'grid', plateSize: task.plateSize, plates: file.plates, objects, items }),
      ];
    }),
  );
}

const transferOf = (kind: AnalysisTask['kind'], result: unknown): Transferable[] => {
  if (kind === 'threeMf')
    return Object.values(result as Record<string, Uint8Array>).map((b) => b.buffer as ArrayBuffer);

  return kind === 'meshes' ? meshBuffers(result) : [];
};

const meshBuffers = (result: unknown) =>
  Object.values(result as Record<string, { vertices: Float32Array; indices: Uint32Array }>).flatMap((m) => [
    m.vertices.buffer,
    m.indices.buffer,
  ]);

export const analysisHandlers = {
  analyze: ({ geometries: newGeometries, shapes, task }: AnalyzePayload) => {
    newGeometries.forEach((g) => geometries.set(g.id, g));
    shapes.forEach((s) => specs.set(s.key, s));

    const result = run(task);

    return reply(result, transferOf(task.kind, result));
  },
  retain: ({ keys, geometryIds }: { keys: string[]; geometryIds: string[] }) => {
    const liveKeys = new Set(keys);
    const liveGeometries = new Set(geometryIds);

    for (const key of [...specs.keys()].filter((k) => !liveKeys.has(k))) {
      specs.delete(key);
      solids.get(key)?.dispose();
      solids.delete(key);
    }

    for (const id of [...geometries.keys()].filter((g) => !liveGeometries.has(g))) geometries.delete(id);

    return reply({ shapes: specs.size, geometries: geometries.size });
  },
};
