import * as THREE from 'three';
import { weld, writeThreeMf } from '../../print/threeMf';
import { posedStl } from '../../print/posedStl';
import { reply } from '../../utils/workerRpc';
import { collide, place, type CollideOptions, type Placed } from './collide';
import { collideRiding, type OutputRiders } from './outputRiders';
import { printReportOf, worldMeasure } from './shapeReports';
import { mergeMeshes, solidFromPositions, type ShapeSolid } from './shapeSolid';
import { lowestPart, sweepClashes, type SweepSpec } from './sweep';
import { pairsWithin, type PairIds } from './gaps';
import { visibleShares } from './visibility';
import { fitCoupons, type FitCoupon, type FitCouponTask } from './fitCoupons';
import { traceFasteners } from '../../assembly/fastenerChain';
import type { FastenerInput } from '../../assembly/assemblyTypes';
import { assemblyGeometry, type AssemblyGeometryInput } from '../../assembly/assemblyGeometry';
import { jointAxesOf, jointAxisOf, type JointAxisQuery } from './jointAxis';
import { payloadMap, type ArmModel } from '../../utils/payload';
import type { StrengthJob } from '../../strength/types';
import { strengthOf } from './strengthPart';
import { planMerges } from '../../print/merge/mergePlan';

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
  | { kind: 'strength'; instances: Instance[]; jobs: StrengthJob[] }
  | { kind: 'print'; instances: Instance[]; faces?: Record<string, Array<[number, number, number]>> }
  | { kind: 'measure' | 'meshes' | 'visibility' | 'floor'; instances: Instance[] }
  | { kind: 'gaps'; instances: Instance[]; pairs: PairIds[]; withinMm: number }
  | ({ kind: 'fasteners'; instances: Instance[] } & FastenerInput)
  | ({ kind: 'assembly'; instances: Instance[] } & AssemblyGeometryInput)
  | { kind: 'threeMf'; instances: Instance[]; files: ThreeMfFileSpec[]; plateSize: [number, number] }
  | { kind: 'stl'; instances: Instance[]; items: StlItem[] }
  | ({ kind: 'jointAxis'; instances: Instance[] } & JointAxisQuery)
  | { kind: 'jointAxes'; instances: Instance[]; ids: string[] }
  | ({ kind: 'fitCoupons'; instances: Instance[] } & FitCouponTask);

export interface ThreeMfFileSpec {
  key: string;
  plates: Array<{ number: number; name: string }>;
  items: Array<{ id: string; name: string; matrix: number[]; plate: number }>;
}

export interface StlItem {
  id: string;
  matrix: number[];
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

function run(task: Exclude<AnalysisTask, { kind: 'strength' }>) {
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
    case 'visibility':
      return visibleShares(
        task.instances.map((i) => ({
          id: i.id,
          solid: solidOf(i.key),
          matrix: new THREE.Matrix4().fromArray(i.matrix),
        })),
      );
    case 'floor':
      return lowestPart(placeAll(task.instances))?.y ?? null;
    default:
      return runPlaced(task);
  }
}

function runPlaced(
  task: Extract<
    AnalysisTask,
    { kind: 'gaps' | 'threeMf' | 'stl' | 'fasteners' | 'assembly' | 'jointAxis' | 'jointAxes' | 'fitCoupons' }
  >,
) {
  switch (task.kind) {
    case 'gaps':
      return pairsWithin(placeAll(task.instances), task.pairs, task.withinMm);
    case 'threeMf':
      return threeMfFiles(task);
    case 'stl':
      return stlFiles(task);
    case 'jointAxis':
      return jointAxisOf(task, (key) => solidOf(key).positions);
    case 'jointAxes':
      return jointAxesOf(task, (key) => solidOf(key).positions);
    default:
      return runOnPlaced(task);
  }
}

function runOnPlaced(task: Extract<AnalysisTask, { kind: 'fasteners' | 'assembly' | 'fitCoupons' }>) {
  const placed = placeAll(task.instances);

  if (task.kind === 'fasteners') return traceFasteners(placed, task);

  return task.kind === 'assembly' ? assemblyWithMerges(placed, task) : fitCoupons(placed, task);
}

function assemblyWithMerges(placed: Placed[], task: Extract<AnalysisTask, { kind: 'assembly' }>) {
  const geometry = assemblyGeometry(placed, task);

  if (!task.merges) return geometry;

  return { ...geometry, merges: planMerges({ placed, geometry, roles: task.roles }, task.merges) };
}

function strengthJobs(task: Extract<AnalysisTask, { kind: 'strength' }>) {
  const byPart = new Map(task.instances.map((i) => [i.id, i]));

  return task.jobs.map((job) => {
    const instance = byPart.get(job.part);

    return instance ? strengthOf(solidOf(instance.key), instance.key, instance.matrix, job) : null;
  });
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

function stlFiles(task: Extract<AnalysisTask, { kind: 'stl' }>) {
  const keyOf = new Map(task.instances.map((i) => [i.id, i.key]));

  return Object.fromEntries(
    task.items
      .filter((it) => keyOf.has(it.id))
      .map((it) => [it.id, posedStl(solidOf(keyOf.get(it.id)!).positions, it.matrix)]),
  );
}

const transferOf = (kind: AnalysisTask['kind'], result: unknown): Transferable[] => {
  if (kind === 'threeMf' || kind === 'stl')
    return Object.values(result as Record<string, Uint8Array>).map((b) => b.buffer as ArrayBuffer);

  if (kind === 'fitCoupons') return (result as FitCoupon[]).map((c) => c.positions.buffer as ArrayBuffer);

  if (kind === 'strength') return fieldBuffers(result);

  return kind === 'meshes' ? meshBuffers(result) : [];
};

const fieldBuffers = (result: unknown) => {
  const fields = (result as Array<{ field: { cells: Int32Array; ratio: Float32Array } } | null>).flatMap((r) =>
    r ? [r.field.cells.buffer, r.field.ratio.buffer] : [],
  );

  return [...new Set(fields)] as ArrayBuffer[];
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

    const result = task.kind === 'strength' ? strengthJobs(task) : run(task);

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
  payloadMaps: (arms: ArmModel[]) => reply(arms.map((arm) => payloadMap(arm))),
};
