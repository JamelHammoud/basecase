import * as THREE from 'three';
import { reply } from '../../utils/workerRpc';
import { collide, place, type CollideOptions } from './collide';
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
  | ({ kind: 'interference'; instances: Instance[] } & CollideOptions)
  | { kind: 'sweeps'; instances: Instance[]; sweeps: SweepSpec[] }
  | { kind: 'print' | 'measure'; instances: Instance[] };

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
      const { instances, ...options } = task;

      return collide(placeAll(instances), options);
    }
    case 'sweeps': {
      const placed = placeAll(task.instances);

      return task.sweeps.map((spec) => sweepClashes(placed, spec));
    }
    case 'print':
      return byId(task.instances, (i) => printReportOf(solidOf(i.key)));
    case 'measure':
      return byId(task.instances, (i) => worldMeasure(solidOf(i.key), new THREE.Matrix4().fromArray(i.matrix)));
  }
}

export const analysisHandlers = {
  analyze: ({ geometries: newGeometries, shapes, task }: AnalyzePayload) => {
    newGeometries.forEach((g) => geometries.set(g.id, g));
    shapes.forEach((s) => specs.set(s.key, s));

    return reply(run(task));
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
