import * as THREE from 'three';
import { worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { Case, ScoreRule, WorldObject } from './schema';

export type FactValue = boolean | number | string;
export type CaseFacts = Record<string, FactValue>;

const OVER_RAD = Math.PI / 4;
const FLOOR_SLACK_MM = 5;
const UP = new THREE.Vector3(0, 1, 0);
const D2R = Math.PI / 180;

export const CASE_SIGNALS = ['score', 'elapsed', 'timer', 'torque'] as const;

export const countFact = (spot: string) => `${spot}-count`;

interface Spot {
  id: string;
  object: WorldObject;
  inverse: THREE.Matrix4;
}

const restMatrix = (o: WorldObject) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...o.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation.map((r) => r * D2R))),
    new THREE.Vector3(1, 1, 1),
  );

const movedSpot = (spot: Spot, delta: THREE.Matrix4 | undefined): Spot =>
  delta ? { ...spot, inverse: delta.clone().multiply(restMatrix(spot.object)).invert() } : spot;

function inside(spot: Spot, item: WorldObject, at: THREE.Vector3): boolean {
  const local = at.clone().applyMatrix4(spot.inverse);
  const [w, h, d] = spot.object.size;
  const above = Math.max(...item.size);

  return Math.abs(local.x) <= w / 2 && Math.abs(local.z) <= d / 2 && local.y <= h / 2 + above && local.y >= -h / 2;
}

function score(rule: ScoreRule | undefined, inSpot: Map<string, string>, startedIn: Map<string, string>) {
  if (!rule) return undefined;

  const ids = [...startedIn.keys()];

  if (rule.counts === 'in') return ids.filter((id) => inSpot.get(id) === rule.spot).length;

  return ids.filter((id) => startedIn.get(id) === rule.spot && inSpot.get(id) !== rule.spot).length;
}

export interface CaseFactReader {
  read(poses: Float64Array, seconds: number, torque?: number): CaseFacts;
}

export function caseFactReader(kase: Case, model: SimModel): CaseFactReader {
  const objects = kase.world.objects;
  const spots: Spot[] = objects
    .filter((o) => o.behavior === 'marker')
    .map((o) => ({ id: o.id, object: o, inverse: restMatrix(o).invert() }));
  const movers = objects.filter((o) => o.behavior === 'dynamic');
  const spotOf = (o: WorldObject, at: THREE.Vector3, among = spots) => among.find((s) => inside(s, o, at))?.id ?? '';
  const startedIn = new Map(movers.map((o) => [o.id, spotOf(o, new THREE.Vector3(...o.position))]));

  return {
    read(poses, seconds, torque) {
      const deltas = worldDeltas(model, poses);
      const placed = spots.map((s) => movedSpot(s, deltas.get(s.id)));
      const facts: CaseFacts = { elapsed: seconds, timer: Math.max(0, kase.task.seconds - seconds) };
      const inSpot = new Map<string, string>();

      for (const o of movers) {
        const delta = deltas.get(o.id) ?? new THREE.Matrix4();
        const at = new THREE.Vector3(...o.position).applyMatrix4(delta);
        const up = UP.clone().transformDirection(delta);
        const spot = spotOf(o, at, placed);

        inSpot.set(o.id, spot);
        Object.assign(facts, {
          [`${o.id}-x`]: at.x,
          [`${o.id}-y`]: at.y,
          [`${o.id}-z`]: at.z,
          [`${o.id}-floor`]: at.y <= Math.max(...o.size) / 2 + FLOOR_SLACK_MM,
          [`${o.id}-over`]: up.angleTo(UP) > OVER_RAD,
          [`${o.id}-spot`]: spot,
        });
      }

      for (const s of spots) facts[countFact(s.id)] = movers.filter((o) => inSpot.get(o.id) === s.id).length;

      const points = score(kase.task.score, inSpot, startedIn);

      if (points !== undefined) facts.score = points;

      if (torque !== undefined) facts.torque = torque;

      return facts;
    },
  };
}

export function caseSignalNames(kase: Case): Set<string> {
  const spots = kase.world.objects.filter((o) => o.behavior === 'marker').map((o) => countFact(o.id));

  return new Set<string>([...CASE_SIGNALS, ...spots]);
}

export function sampleSignals(facts: CaseFacts, names: Set<string>, out: Record<string, number[]>) {
  for (const name of names) {
    const value = facts[name];

    if (typeof value !== 'number') continue;

    const series = out[name] ?? [];

    series.push(value);
    out[name] = series;
  }
}
