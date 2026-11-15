import { expect, it } from 'vitest';
import type { SimJoint, SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { demoEpisode, type DemoSpec } from './demos';
import { datasetJoints, episodeData, type DatasetSlot } from './episodes';
import { jointIndices } from './jointIndices';

const joint = (id: number): SimJoint => ({
  id: `joint-${id}`,
  name: `Joint ${id}`,
  type: 'revolute',
  effort: 1,
  effortSource: 'estimate',
  dynamics: 'estimated',
  robot: 'robot',
  drive: 'position',
  actuator: id,
});

function fixture(seed: number) {
  const joints = Array.from({ length: 3 + (seed % 17) }, (_, i) => joint(i));

  joints.push(joints[seed % joints.length], { ...joints[0] });

  const width = joints.length;
  const model: SimModel = {
    version: 2,
    xml: '',
    bodies: [],
    joints,
    robots: ['lead', 'guest'].map((key, robot) => ({
      key,
      name: key,
      root: key,
      floating: false,
      morphology: 'fixed',
      joints: joints
        .filter((_, i) => (i + seed) % 2 === robot)
        .map((j) => j.id)
        .reverse(),
      fingerprint: key,
    })),
    initial: { values: {}, roots: {} },
    massKg: {},
  };
  const recording: Recording = {
    dt: 0.02,
    frames: 5,
    nq: width,
    nv: width,
    nu: width,
    nbody: 0,
    t: Float32Array.from([0, 0.02, 0.04, 0.06, 0.08]),
    ctrl: Float32Array.from({ length: 5 * width }, (_, i) => i / 4),
    qpos: Float64Array.from({ length: 5 * width }, (_, i) => (i + seed) / 4),
    qvel: Float32Array.from({ length: 5 * width }, (_, i) => (seed - i) / 4),
    poses: new Float32Array(),
    jointQpos: Int32Array.from({ length: width }, (_, i) => width - i - 1),
    jointDof: Int32Array.from({ length: width }, (_, i) => (i + seed) % width),
    root: [-1, -1],
  };

  return { model, recording };
}

function previousEpisode(recording: Recording, model: SimModel, slots?: DatasetSlot[]) {
  const { joints } = datasetJoints(model, slots);
  const indices = joints.map((j) => model.joints.indexOf(j));
  const frames = [0, 2, 4];

  return {
    task: 'task',
    frames,
    timestamps: Float32Array.from([0, 0.04, 0.08]),
    state: Float32Array.from(
      frames.flatMap((frame) => indices.map((i) => recording.qpos[frame * recording.nq + recording.jointQpos![i]])),
    ),
    action: Float32Array.from(
      frames.flatMap((frame) => joints.map((j) => recording.ctrl[frame * recording.nu + j.actuator])),
    ),
  };
}

it('keeps complete episode and demonstration columns aligned with recorded addresses', () => {
  for (let seed = 0; seed < 40; seed++) {
    const { model, recording } = fixture(seed);
    const before = structuredClone({ model, recording });
    const slots = [
      { id: 'other', robot: 'guest' },
      { id: 'first', robot: 'lead' },
      { id: 'again', robot: 'guest' },
      { id: 'empty', robot: 'missing' },
    ];

    expect(episodeData(recording, model, 'task', slots)).toEqual(previousEpisode(recording, model, slots));
    expect(episodeData(recording, model, 'task')).toEqual(previousEpisode(recording, model));

    const { joints } = datasetJoints(model);
    const indices = joints.map((j) => model.joints.indexOf(j));
    const spec: DemoSpec = { defaultPose: joints.map(() => 0.5), actionScale: 2, command: [0, 1, 2] };
    const actions = [0, 2, 4].map((f) => joints.map((j) => (recording.ctrl[f * recording.nu + j.actuator] - 0.5) / 2));
    const obs = [0, 2].map((f, row) => [
      0,
      0,
      -1,
      0,
      0,
      0,
      0,
      0,
      0,
      ...spec.command,
      ...indices.map((i) => recording.qpos[f * recording.nq + recording.jointQpos![i]] - 0.5),
      ...indices.map((i) => recording.qvel[f * recording.nv + recording.jointDof![i]]),
      ...(row ? actions[row] : joints.map(() => 0)),
    ]);

    expect(demoEpisode(recording, model, spec)).toEqual({ obs, actions: actions.slice(1) });
    expect({ model, recording }).toEqual(before);
  }
});

it('matches ordered identity searches across repeated references, ids and missing joints', () => {
  for (let seed = 0; seed < 120; seed++) {
    const pool = Array.from({ length: 1 + (seed % 23) }, (_, i) => joint(i % 4));
    const all = Array.from({ length: seed % 41 }, (_, i) => pool[(i * 7 + seed) % pool.length]);
    const selected = Array.from({ length: seed % 37 }, (_, i) => pool[(i * 11 + seed) % pool.length]);

    selected.push(joint(0));
    Object.freeze(all);
    Object.freeze(selected);
    expect(jointIndices(all, selected)).toEqual(selected.map((item) => all.indexOf(item)));
  }
});

it('reads the current model and selection on each call and returns independent indices', () => {
  const a = joint(0);
  const b = joint(0);
  const all = [a, b, a];
  const selected = [a, b, a];
  const before = jointIndices(all, selected);

  all.reverse();
  all[0] = b;
  selected.push(joint(0));
  expect(jointIndices(all, selected)).toEqual([2, 0, 2, -1]);
  expect(before).toEqual([0, 1, 0]);
  expect(jointIndices([], selected)).toEqual([-1, -1, -1, -1]);
  expect(jointIndices(all, [])).toEqual([]);
});

it('preserves sparse model and selection behavior', () => {
  const all = Array<SimJoint>(8);
  const selected = Array<SimJoint>(5);

  all[3] = joint(1);
  all[7] = all[3];
  selected[1] = all[3];
  selected[4] = joint(1);
  expect(jointIndices(all, selected)).toEqual(selected.map((item) => all.indexOf(item)));
});

it.each([300, 600])('reads %i model columns once instead of rescanning each selected joint', (size) => {
  const source = Array.from({ length: size }, (_, i) => joint(i));
  let reads = 0;
  const all = new Proxy(source, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, receiver);
    },
  });
  const previous = source.map((item) => all.indexOf(item));

  expect(reads).toBe((size * (size + 1)) / 2);
  reads = 0;
  expect(jointIndices(all, source)).toEqual(previous);
  expect(reads).toBe(size);
  reads = 0;
  expect(jointIndices(all, [])).toEqual([]);
  expect(reads).toBe(0);
});
