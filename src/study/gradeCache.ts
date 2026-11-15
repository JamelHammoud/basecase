import { assemblyGeometry, type AssemblyGeometry } from '../assembly/assemblyGeometry';
import { serviceableIds } from '../assembly/assemblyReport';
import { fastenerInput } from '../assembly/fastenerSpec';
import { COMPONENT_BY_ID } from '../data/components';
import { collide, place, type Placed } from '../three/analysis/collide';
import { pairsWithin, type PairIds } from '../three/analysis/gaps';
import { worldMeasure } from '../three/analysis/shapeReports';
import { solidFromPositions, type ShapeSolid } from '../three/analysis/shapeSolid';
import { sweepClashes, type SweepSpec } from '../three/analysis/sweep';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { numbersHash } from '../utils/geometryHash';
import { partMatrix } from '../utils/kinematics';
import type { StudyScene } from './types';

export interface StudyPlacement {
  key: string;
  placed: Placed[];
  measures: Record<string, MeshMeasure>;
}

let nextSolidId = 0;

const equalPositions = (a: Float32Array, b: Float32Array) =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

export class StudyGradeCache {
  private byIdentity = new WeakMap<Float32Array, ShapeSolid>();
  private byHash = new Map<string, ShapeSolid[]>();
  private solidIds = new Map<ShapeSolid, number>();
  private placements = new Map<string, StudyPlacement>();
  private measures = new Map<string, MeshMeasure>();
  private assemblies = new Map<string, AssemblyGeometry>();
  private clashes = new Map<string, ReturnType<typeof collide>>();
  private sweeps = new Map<string, ReturnType<typeof sweepClashes>>();
  private touches = new Map<string, PairIds[]>();

  solid(positions: Float32Array): ShapeSolid {
    const known = this.byIdentity.get(positions);

    if (known) return known;

    const hash = numbersHash(positions);
    const bucket = this.byHash.get(hash) ?? [];
    const equal = bucket.find((candidate) => equalPositions(candidate.positions, positions));
    const made = equal ?? solidFromPositions(positions);

    if (!equal) bucket.push(made);

    this.byHash.set(hash, bucket);
    this.byIdentity.set(positions, made);

    if (!this.solidIds.has(made)) this.solidIds.set(made, ++nextSolidId);

    return made;
  }

  solidKey(solid: ShapeSolid): number {
    return this.solidIds.get(solid)!;
  }

  placement(scene: StudyScene, parts: ScenePart[]): StudyPlacement {
    const missing = parts.filter((part) => !scene.triangles[part.id]?.length);

    if (missing.length) throw new Error(`Load meshes before grading: ${missing.map((part) => part.name).join(', ')}.`);

    const placed = parts.map((part) => place(part.id, this.solid(scene.triangles[part.id]), partMatrix(part)));
    const key = JSON.stringify(placed.map((part) => [part.id, this.solidKey(part.solid), part.matrix.elements]));
    const known = this.placements.get(key);

    if (known) return known;

    const measures = Object.fromEntries(placed.map((part) => [part.id, this.measure(part)]));
    const made = { key, placed, measures };

    this.placements.set(key, made);

    return made;
  }

  private measure(part: Placed): MeshMeasure {
    const key = JSON.stringify([this.solidKey(part.solid), part.matrix.elements]);
    const known = this.measures.get(key);

    if (known) return known;

    const made = worldMeasure(part.solid, part.matrix);

    this.measures.set(key, made);

    return made;
  }

  assembly(placement: StudyPlacement, parts: ScenePart[]): AssemblyGeometry {
    const input = {
      ...fastenerInput(parts),
      serviceable: serviceableIds(parts),
      budgetMs: 30000,
      batteries: parts
        .filter(
          (part) =>
            !!part.componentId &&
            !!COMPONENT_BY_ID[part.componentId]?.battery &&
            !COMPONENT_BY_ID[part.componentId]?.battery?.cell,
        )
        .map((part) => part.id),
    };
    const key = JSON.stringify([placement.key, input]);
    const known = this.assemblies.get(key);

    if (known) return known;

    const made = assemblyGeometry(placement.placed, input);

    if (!made.timedOut) this.assemblies.set(key, made);

    return made;
  }

  interference(placement: StudyPlacement): ReturnType<typeof collide> {
    const known = this.clashes.get(placement.key);

    if (known) return known;

    const made = collide(placement.placed, { toleranceMm: 0.3, maxSamples: 400 });

    this.clashes.set(placement.key, made);

    return made;
  }

  sweep(placement: StudyPlacement, spec: SweepSpec): ReturnType<typeof sweepClashes> {
    const key = JSON.stringify([placement.key, spec]);
    const known = this.sweeps.get(key);

    if (known) return known;

    const made = sweepClashes(placement.placed, spec);

    this.sweeps.set(key, made);

    return made;
  }

  pairsWithin(placement: StudyPlacement, pairs: PairIds[], within: number): PairIds[] {
    const key = JSON.stringify([placement.key, pairs, within]);
    const known = this.touches.get(key);

    if (known) return known;

    const made = pairsWithin(placement.placed, pairs, within);

    this.touches.set(key, made);

    return made;
  }

  dispose(): void {
    this.solidIds.forEach((_key, solid) => solid.dispose());
    this.byIdentity = new WeakMap();
    this.byHash.clear();
    this.solidIds.clear();
    this.placements.clear();
    this.measures.clear();
    this.assemblies.clear();
    this.clashes.clear();
    this.sweeps.clear();
    this.touches.clear();
  }
}
