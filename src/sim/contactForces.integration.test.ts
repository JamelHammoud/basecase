import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import { forceFixture, forceFixtureEvidence } from './fixtures/gripForce';
import { SimEngine } from './engine';
import { Recorder } from './recorder';
import { evaluateContract } from '../skills/contract';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function directForces(engine: SimEngine) {
  const { data, model } = engine;
  const buffer = new mj.DoubleBuffer(6);
  const forces = new Map<string, number>();
  const contacts = data.contact;
  const count = new Map<string, number>();

  try {
    for (let i = 0; i < data.ncon; i++) {
      const contact = contacts.get(i)!;
      const bodies = [model.geom_bodyid[contact.geom1], model.geom_bodyid[contact.geom2]].sort((a, b) => a - b);
      const pair = bodies.join(',');

      mj.mj_contactForce(model, data, i, buffer);
      forces.set(pair, (forces.get(pair) ?? 0) + Math.max(0, (buffer.GetView() as Float64Array)[0]));
      count.set(pair, (count.get(pair) ?? 0) + 1);
      contact.delete();
    }
  } finally {
    contacts.delete();
    buffer.delete();
  }

  return { forces, count };
}

it('matches direct MuJoCo sums for multiple points and independent grippers without changing contact identities', () => {
  const engine = new SimEngine(mj, forceFixture());

  try {
    engine.observeForces(forceFixtureEvidence());
    engine.setController({ kind: 'hold', values: { left: 14, right: 14, otherLeft: 18, otherRight: 18 } });
    expect(Array.from(engine.forces!.values)).toEqual([0, 0, 0, 0]);
    engine.step(0.2);

    const pairs = engine.contactPairs();
    const direct = directForces(engine);
    const ids = engine.sim.bodies.map((body) => mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name));
    const against = (jaw: number, target: number) =>
      direct.forces.get([ids[jaw], ids[target]].sort((a, b) => a - b).join(',')) ?? 0;
    const expected = [against(0, 2), against(1, 2), against(0, 2) + against(1, 2), against(3, 5) + against(4, 5)];

    expect(Math.max(...expected.map((force, i) => Math.abs(force - engine.forces!.values[i])))).toBeLessThan(1e-12);
    expect(expected.every((force) => force > 0)).toBe(true);
    expect(expected[3]).toBeGreaterThan(expected[2]);
    expect([...direct.count.values()].some((count) => count > 1)).toBe(true);
    expect(engine.contactPairs()).toEqual(pairs);

    let geomReads = 0;
    const model = new Proxy(engine.model, {
      get(target, key) {
        if (key === 'geom_bodyid') geomReads++;

        return Reflect.get(target, key, target);
      },
    });

    engine.forces!.sample(mj, model, engine.data);
    expect(geomReads).toBe(1);
    expect(Math.max(...expected.map((force, i) => Math.abs(force - engine.forces!.values[i])))).toBeLessThan(1e-12);
  } finally {
    engine.dispose();
  }
});

it('retains a solved overload between 50 Hz recording frames after sampled force returns to zero', async () => {
  const engine = new SimEngine(mj, forceFixture());

  try {
    engine.observeForces(forceFixtureEvidence());
    engine.setController({ kind: 'hold' });

    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.step(0.004);

    const qpos = engine.data.qpos.slice();
    const addresses = engine.jointAddresses();

    qpos[addresses[0]] = 0.019;
    qpos[addresses[1]] = 0.019;
    engine.setState(qpos);
    engine.setController({ kind: 'hold', values: { left: 19, right: 19 } });
    engine.step(0.002);

    const overloaded = engine.forces!.values[2];

    expect(overloaded).toBeGreaterThan(1);
    qpos[addresses[0]] = 0;
    qpos[addresses[1]] = 0;
    engine.setState(qpos);
    engine.setController({ kind: 'hold' });
    engine.step(0.014);

    const recording = recorder.finish();
    const restored = decodeRecording(encodeRecording(recording))!;

    expect(recording.frames).toBe(2);
    expect(recording.contactForce![6]).toBe(0);
    expect(recording.contactForcePeak![6]).toBeGreaterThanOrEqual(overloaded);
    expect(restored.contactForcePeak).toEqual(recording.contactForcePeak);
    expect(recording.contactForce![7]).toBe(0);

    const contract = {
      version: 1 as const,
      success: {
        always: {
          window: 'whole' as const,
          state: {
            atom: {
              expr: { signal: 'force' },
              cmp: '<=' as const,
              value: 1,
              scale: 1,
            },
          },
        },
      },
      failures: [],
    };
    const sampled = [recording.contactForce![2], recording.contactForce![6]];
    const peaks = [recording.contactForcePeak![2], recording.contactForcePeak![6]];

    expect((await evaluateContract(contract, { dt: recording.dt, signals: { force: sampled } })).passed).toBe(true);
    expect((await evaluateContract(contract, { dt: recording.dt, signals: { force: peaks } })).passed).toBe(false);
  } finally {
    engine.dispose();
  }
});

it('excludes the floor and another target and retains asymmetric one-jaw contact before both jaws close', () => {
  const engine = new SimEngine(mj, forceFixture());

  try {
    engine.observeForces(forceFixtureEvidence());
    engine.setController({ kind: 'hold', values: { otherLeft: 18, otherRight: 18 } });
    engine.step(0.2);
    expect(Array.from(engine.forces!.values.slice(0, 3))).toEqual([0, 0, 0]);
    expect(engine.forces!.values[3]).toBeGreaterThan(1);

    const target = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, 'object');

    expect(directForces(engine).forces.get(`0,${target}`)).toBeGreaterThan(0);
    engine.setController({ kind: 'hold', values: { left: 18 } });

    let asymmetric = false;

    for (let step = 0; step < 100; step++) {
      engine.step(engine.dt);
      asymmetric ||= engine.forces!.values[0] > 0 && engine.forces!.values[1] === 0;
    }

    expect(asymmetric).toBe(true);
  } finally {
    engine.dispose();
  }
});

it('captures the final partial force interval when recording stops before its next frame', () => {
  const engine = new SimEngine(mj, forceFixture());

  try {
    engine.observeForces(forceFixtureEvidence());

    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.setController({ kind: 'hold', values: { left: 19, right: 19 } });
    engine.step(0.016);

    const recording = recorder.finish();

    expect(recording.t.at(-1)).toBeCloseTo(0.016, 7);
    expect(recording.contactForcePeak!.some((force) => force > 0)).toBe(true);
    expect(decodeRecording(encodeRecording(recording))).not.toBeNull();
  } finally {
    engine.dispose();
  }
});

it('leaves a recording unresolved when its force observation source changes during capture', () => {
  const engine = new SimEngine(mj, forceFixture());

  try {
    engine.observeForces(forceFixtureEvidence());

    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.step(0.02);
    engine.observeForces({ ...forceFixtureEvidence(), caseKey: 'edited' });
    engine.step(0.02);

    const recording = recorder.finish();

    expect(recording.forceEvidence).toBeUndefined();
    expect(recording.contactForce).toBeUndefined();
    expect(recording.contactForcePeak).toBeUndefined();
    expect(decodeRecording(encodeRecording(recording))).not.toBeNull();
  } finally {
    engine.dispose();
  }
});
