import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { seeded } from '../utils/seeded';
import { caseFactReader } from './caseFacts';
import { knockGame } from './fixtureGames';
import { worldDeltas } from '../sim/mjcfFrames';
import { SIM_MODEL_VERSION, type SimModel } from '../sim/mjcfTypes';
import type { Case, ScoreRule, WorldObject } from './schema';

type FactValue = boolean | number | string;

type CaseFacts = Record<string, FactValue>;

const OVER_RAD = Math.PI / 4;
const FLOOR_SLACK_MM = 5;
const UP = new THREE.Vector3(0, 1, 0);
const D2R = Math.PI / 180;

const countFact = (spot: string) => `${spot}-count`;

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

interface CaseFactReader {
  read(poses: Float64Array, seconds: number, torque?: number): CaseFacts;
}

function previousReader(kase: Case, model: SimModel): CaseFactReader {
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

const objectOf = (id: string, behavior: WorldObject['behavior'], x = 0): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  behavior,
  position: [x, 10, 0],
  rotation: [0, 0, 0],
  size: [40, 20, 40],
  color: '#888888',
});

function caseOf(objects: WorldObject[], rule?: ScoreRule): Case {
  const kase = knockGame({ seconds: 10, target: 2 });

  return { ...kase, world: { objects }, task: { ...kase.task, score: rule } };
}

const modelOf = (objects: WorldObject[]): SimModel => ({
  version: SIM_MODEL_VERSION,
  xml: '',
  bodies: objects.map((o) => ({ name: o.id, parts: [], world: [o.id], origin: o.position })),
  joints: [],
  robots: [],
  initial: { values: {} },
  massKg: {},
});

function posesOf(objects: WorldObject[], phase = 0) {
  return Float64Array.from(
    objects.flatMap((o, i) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(phase * (i % 3), phase / 2, 0));

      return [
        (o.position[0] + phase * i * 15) / 1000,
        -o.position[2] / 1000,
        (o.position[1] + phase * i * 2) / 1000,
        q.w,
        q.x,
        -q.z,
        q.y,
      ];
    }),
  );
}

function fixture(seed: number) {
  const random = seeded(seed);
  const objects = Array.from({ length: seed % 30 }, (_, i) => {
    const o = objectOf(`object-${i}`, i % 4 === 0 ? 'marker' : 'dynamic');

    o.position = [random() * 120 - 60, random() * 50 - 10, random() * 120 - 60];
    o.rotation = [random() * 45, random() * 180, random() * 45];
    o.size = [random() * 90 + 10, random() * 20 + 1, random() * 90 + 10];

    return o;
  });

  return [...objects, objectOf('static', 'static')];
}

describe('Case occupancy accumulation', () => {
  it('matches complete facts across generated worlds, moving markers and both score rules', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const objects = fixture(seed);
      const model = modelOf(objects.filter((_, i) => i % 3 !== 1));
      const rules: Array<ScoreRule | undefined> = [
        undefined,
        { spot: 'object-0', counts: 'in' },
        { spot: 'object-0', counts: 'out' },
      ];

      for (const rule of rules) {
        const kase = caseOf(objects, rule);
        const before = structuredClone(kase);
        const actual = caseFactReader(kase, model);
        const expected = previousReader(kase, model);

        for (const phase of [0, 0.4, 1.8, -0.2, 0]) {
          const poses = posesOf(
            objects.filter((_, i) => i % 3 !== 1),
            phase,
          );
          const saved = poses.slice();

          expect(actual.read(poses, phase * 10, seed % 2 ? undefined : 3)).toEqual(
            expected.read(poses, phase * 10, seed % 2 ? undefined : 3),
          );
          expect(poses).toEqual(saved);
        }

        expect(kase).toEqual(before);
      }
    }
  });

  it('keeps first overlapping markers, inclusive edges, departures and reentry', () => {
    const objects = [
      objectOf('first', 'marker'),
      objectOf('second', 'marker'),
      objectOf('edge', 'dynamic', 20),
      objectOf('outside', 'dynamic', 21),
    ];
    const kase = caseOf(objects, { spot: 'first', counts: 'out' });
    const model = modelOf(objects);
    const reader = caseFactReader(kase, model);
    const poses = posesOf(objects);
    const initial = reader.read(poses, 0);

    expect(initial).toMatchObject({
      'first-count': 1,
      'second-count': 0,
      'edge-spot': 'first',
      'outside-spot': '',
      score: 0,
      timer: 10,
    });
    poses[14] += 0.001;
    expect(reader.read(poses, 2)).toMatchObject({ 'first-count': 0, score: 1 });
    poses[14] -= 0.001;
    expect(reader.read(poses, 11)).toMatchObject({ 'first-count': 1, score: 0, timer: 0 });
    expect(initial['first-count']).toBe(1);
    kase.task.score = { spot: 'second', counts: 'in' };
    expect(reader.read(poses, 1).score).toBe(0);
    kase.task.score = { spot: 'first', counts: 'in' };
    expect(reader.read(poses, 1).score).toBe(1);
    delete kase.task.score;
    expect(reader.read(poses, 1).score).toBeUndefined();
  });

  it.each([100, 200])('reads mover identities without rescanning them for 20 markers and %i movers', (size) => {
    const markers = Array.from({ length: 20 }, (_, i) => objectOf(`marker-${i}`, 'marker', i * 100));
    const movers = Array.from({ length: size }, (_, i) => objectOf(`mover-${i}`, 'dynamic'));
    const kase = caseOf([...markers, ...movers], { spot: markers[0].id, counts: 'out' });
    const model = modelOf([]);
    const current = caseFactReader(kase, model);
    const previous = previousReader(kase, model);
    let reads = 0;

    movers.forEach((o) => {
      const id = o.id;

      Object.defineProperty(o, 'id', {
        get() {
          reads++;

          return id;
        },
      });
    });

    const result = current.read(new Float64Array(), 0);
    const currentReads = reads;

    reads = 0;
    expect(result).toEqual(previous.read(new Float64Array(), 0));
    expect(currentReads).toBe(size * 8);
    expect(reads).toBe(size * 28);
  });
});
