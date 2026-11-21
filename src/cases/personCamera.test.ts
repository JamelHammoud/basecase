import loadMujoco from '@mujoco/mujoco';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../tools/testing/offscreenWorker';
import { SimEngine } from '../sim/engine';
import { evaluateContract } from '../skills/contract';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { caseWorldItems } from './importedWorldItems';
import { PERSON_ENCOUNTERS, personEncounterFixture } from './personEncounters.fixtures';
import { preparePerson } from './personEncounter';
import type { PersonCameraInput } from './personCameraChecks';
import { caseRobot } from './testing';
import { worldItem, type WorldObject } from './schema';

let worker: OffscreenTestWorker;
let mj: Awaited<ReturnType<typeof loadMujoco>>;
const setup = new AbortController();
let opening: Promise<OffscreenTestWorker>;

beforeAll(async () => {
  mj = await loadMujoco();
  opening = openOffscreenWorker(
    fileURLToPath(new URL('./personCameraChecks.ts', import.meta.url)),
    'personCameraChecks',
    { signal: setup.signal },
  );
  worker = await opening;

  const initial = cameraInput(0);

  await worker.run({ ...initial, poses: initial.poses.slice(1, 2) });
}, 15000);

afterAll(async () => {
  await worker?.run({ close: true });
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

it.each(PERSON_ENCOUNTERS.map((name, index) => ({ name, index })))(
  '$name occludes and reveals a known target in rendered RGB, instance and depth passes',
  async ({ index }) => {
    const input = cameraInput(index);
    const samples = await worker.run<Array<{ target: number; center: number[]; depth: number }>>(input);

    expect(samples).toHaveLength(3);
    expect(samples.map((sample) => sample.target > 0)).toEqual([true, false, true]);
    expect(samples[0].center[0]).toBeGreaterThan(samples[0].center[1] + 20);
    expect(samples[2].center[0]).toBeGreaterThan(samples[2].center[1] + 20);
    expect(Math.abs(samples[1].center[0] - samples[1].center[1])).toBeLessThan(5);
    expect(samples[1].depth).toBeLessThan(samples[0].depth);
    expect(samples[0].depth).toBeCloseTo(samples[2].depth, 5);

    const observation = await evaluateContract(
      {
        version: 1,
        success: {
          always: { window: 'whole', state: { atom: { expr: { signal: 'visible' }, cmp: '>', value: 0.5, scale: 1 } } },
        },
        failures: [],
      },
      { dt: 1, signals: { visible: samples.map((sample) => Number(sample.target > 0)) } },
    );

    expect(observation.passed).toBe(false);
  },
);

function cameraInput(index: number): PersonCameraInput {
  const { kase, robot } = personEncounterFixture(index);
  const person = kase.world.objects.find((object) => object.person)!;
  const y = person.size[1] * 0.625;
  const z = person.position[2];
  const target: WorldObject = {
    id: 'observation-target',
    name: 'Observation target',
    kind: 'box',
    position: [0, y, z + 400],
    size: [160, 160, 20],
    rotation: [0, 0, 0],
    color: '#ff0000',
    behavior: 'static',
  };
  const world = [...caseWorldItems(kase), worldItem(target)];
  const input = { ...caseRobot(robot), rig: buildRig(robot.joints, robot.parts), project: DEFAULT_PROJECT, world };
  const model = buildMjcf(input);
  const engine = new SimEngine(mj, model);
  const prepared = preparePerson(person.person!);

  try {
    const initial = engine.poses();

    engine.step(prepared.arrivals[1]);

    const crossing = engine.poses();

    engine.step(prepared.departures.at(-1)! - engine.data.time + 0.02);

    return {
      parts: robot.parts,
      world,
      model,
      poses: [initial, crossing, engine.poses()],
      view: {
        key: 'encounter-camera',
        label: 'Encounter camera',
        part: null,
        position: [0, y, z - 400],
        target: target.position,
        up: [0, 1, 0],
        fovDeg: 60,
        lens: { model: 'pinhole', hfovDeg: 60 },
      },
    };
  } finally {
    engine.dispose();
  }
}
