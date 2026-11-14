import { describe, expect, it } from 'vitest';
import { parseCase, type Case, type WorldObject } from './schema';
import { scaledToReach } from './scale';
import { buildCase, builderRobot } from './caseBuilder';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { checkedConsole } from './console/consoleEdits';

const object = (id = 'fruit'): WorldObject => ({
  id,
  name: 'Fruit',
  kind: 'sphere',
  position: [10, 20, 30],
  rotation: [0, 0, 0],
  size: [20, 20, 20],
  color: '#f00',
  behavior: 'static',
});

const fixture = (): Case => ({
  formatVersion: 1,
  id: 'fruit-case',
  name: 'Fruit',
  brief: '',
  slot: { needs: [], binding: {} },
  world: { objects: [object()] },
  controls: [],
  reference: { timeline: [] },
  task: { seconds: 1, probes: [], contract: { version: 1, success: { all: [] }, failures: [] } },
});

const withObject = (fields: Record<string, unknown>) => ({
  ...fixture(),
  world: { objects: [{ ...object(), ...fields }] },
});

describe('Case training image declarations', () => {
  it('leaves old Case files unchanged', () => {
    const old = fixture();

    expect(JSON.stringify(parseCase(old))).toBe(JSON.stringify(old));
    expect(parseCase(old)).not.toHaveProperty('imageRandomization');
    expect(parseCase(old).world.objects[0]).not.toHaveProperty('points');
    expect(parseCase(old).world.objects[0]).not.toHaveProperty('colors');
  });

  it('round-trips named local points, visual classes, camera tolerance and distractors', () => {
    const raw = {
      ...withObject({
        points: { stem: [0, 12, 0], 'grasp point': [1, 2, 3] },
        colors: [
          { name: 'ripe tomato', color: '#ff0000' },
          { name: 'unripe', color: '#0f0' },
        ],
      }),
      imageRandomization: {
        cameraTolerance: { mm: 15, deg: 5 },
        distractors: [{ ...object('leaf'), points: { tip: [0, 5, 0] }, colors: [{ name: 'leaf', color: '#abcd' }] }],
      },
    };

    expect(parseCase(JSON.parse(JSON.stringify(raw)))).toEqual(raw);
    expect(parseCase({ ...fixture(), imageRandomization: {} }).imageRandomization).toEqual({});
  });

  it.each([
    { stem: [0, Infinity, 0] },
    { stem: [0, NaN, 0] },
    { stem: [0, 1] },
    { '': [0, 0, 0] },
    Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, [0, 0, 0]])),
  ])('refuses malformed or unbounded point sets %#', (points) => {
    expect(() => parseCase(withObject({ points }))).toThrow(/points/);
  });

  it.each([
    [{ name: 'ripe', color: 'red' }],
    [{ name: 'ripe', color: '#zz0000' }],
    [{ name: '', color: '#fff' }],
    [{ name: 'ripe', color: '#12345' }],
    [
      { name: 'ripe', color: '#f00' },
      { name: 'ripe', color: '#f01' },
    ],
    Array.from({ length: 65 }, (_, i) => ({ name: `class${i}`, color: '#ffffff' })),
  ])('refuses malformed, repeated or unbounded classes %#', (...colors) => {
    expect(() => parseCase(withObject({ colors }))).toThrow(/colors/);
  });

  it.each([
    { mm: -1, deg: 0 },
    { mm: 501, deg: 0 },
    { mm: 0, deg: 46 },
    { mm: 0, deg: -1 },
    { mm: Infinity, deg: 0 },
    { mm: 0, deg: NaN },
  ])('refuses camera tolerance outside its finite bounds %#', (cameraTolerance) => {
    expect(() => parseCase({ ...fixture(), imageRandomization: { cameraTolerance } })).toThrow(/cameraTolerance/);
  });

  it('refuses malformed, repeated, colliding or recursive distractors', () => {
    const distractors = [
      [object('fruit')],
      [object('leaf'), object('leaf')],
      [{ ...object('leaf'), position: [NaN, 0, 0] }],
      [{ ...object('leaf'), distractors: [object('other')] }],
      Array.from({ length: 65 }, (_, i) => object(`leaf${i}`)),
    ];

    for (const list of distractors)
      expect(() => parseCase({ ...fixture(), imageRandomization: { distractors: list } })).toThrow(/distractors/);
  });
});

describe('training declarations through Case creation and placement', () => {
  it('keeps training declarations in a built and edited Case', () => {
    const robot = fixtureRobots().find((candidate) => candidate.id === 'rover-diff')!;
    const worldObject = { ...object(), points: { stem: [0, 12, 0] as [number, number, number] } };
    const imageRandomization = { cameraTolerance: { mm: 15, deg: 5 }, distractors: [object('leaf')] };
    const result = buildCase(
      { goal: 'reach', world: 'floor', objects: [worldObject], imageRandomization },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) throw new Error(result.problem);

    expect(result.kase.world.objects.find((candidate) => candidate.id === 'fruit')).toEqual(worldObject);
    expect(result.kase.imageRandomization).toEqual(imageRandomization);

    const edited = checkedConsole(result.kase, undefined);

    expect(edited).toMatchObject({ ok: true, kase: { imageRandomization } });
  });

  it('scales local points, jitter, camera tolerance and distractors in the same frame', () => {
    const kase: Case = {
      ...fixture(),
      slot: { needs: [], binding: {}, reachMm: 100, anchor: [10, 20, 30] },
      world: {
        objects: [{ ...object(), points: { stem: [1, 2, 3] }, jitter: { mm: 20, deg: 5 } }],
      },
      imageRandomization: {
        cameraTolerance: { mm: 15, deg: 4 },
        distractors: [
          { ...object('leaf'), position: [20, 30, 40], points: { tip: [2, 3, 4] }, jitter: { mm: 10, deg: 2 } },
        ],
      },
    };
    const scaled = scaledToReach(kase, 200, [100, 200, 300]);

    expect(scaled.world.objects[0]).toMatchObject({
      position: [100, 200, 300],
      size: [40, 40, 40],
      points: { stem: [2, 4, 6] },
      jitter: { mm: 40, deg: 5 },
    });
    expect(scaled.imageRandomization).toMatchObject({
      cameraTolerance: { mm: 30, deg: 4 },
      distractors: [
        { position: [120, 220, 320], size: [40, 40, 40], points: { tip: [4, 6, 8] }, jitter: { mm: 20, deg: 2 } },
      ],
    });
    expect(kase.world.objects[0].points).toEqual({ stem: [1, 2, 3] });
    expect(scaledToReach(kase, 100, [10, 20, 30])).toBe(kase);

    const gripper = scaledToReach({ ...kase, slot: { ...kase.slot!, needs: ['gripper'] } }, 200, [100, 200, 300]);

    expect(gripper.world.objects[0].position).toEqual([100, 40, 300]);
    expect(gripper.imageRandomization?.distractors?.[0].position).toEqual([120, 60, 320]);
  });
});
