import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from './policy';

const closeArray = (values: ArrayLike<number>) => Array.from(values, (value) => expect.closeTo(value, 12));

function forwardEcho(model: ReturnType<typeof fixtureModel>, joints = model.joints.map((j) => j.id)): PolicySpec {
  const size = obsSize(joints.length);
  const w = new Array<number>(size * joints.length).fill(0);

  joints.forEach((_, o) => (w[o * size + 9] = 1));

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'walk',
    robot: model.robots[0].key,
    joints,
    defaultPose: joints.map(() => 0),
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0.2, 0, 0],
    obsMean: new Array<number>(size).fill(0),
    obsStd: new Array<number>(size).fill(1),
    layers: [{ in: size, out: joints.length, w, b: joints.map(() => 0) }],
    activation: 'elu',
    trainedSteps: 0,
    mujoco: 'none',
    createdAt: '2026-11-07T00:00:00.000Z',
  };
}

describe('live commands on a policy', () => {
  it('start from the spec, and a command replaces it from the next control tick', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const engine = new SimEngine(mj, model);
    const actuator = model.joints[0].actuator;

    try {
      engine.setController({ kind: 'policy', policy: forwardEcho(model), robot: model.robots[0].key });
      engine.step(0.01);
      expect(engine.data.ctrl[actuator]).toBeCloseTo(0.25 * 0.2, 6);

      engine.command({ v: [-0.6, 0, 0] });
      engine.step(0.02);
      expect(engine.data.ctrl[actuator]).toBeCloseTo(0.25 * -0.6, 6);

      engine.reset(model.initial);
      engine.step(0.01);
      expect(engine.data.ctrl[actuator]).toBeCloseTo(0.25 * 0.2, 6);
    } finally {
      engine.dispose();
    }
  });
});

describe('policy actuator bindings', () => {
  it.each(['policy', 'route'] as const)(
    'maps reordered %s outputs to sparse actuators and leaves passive joints alone',
    async (kind) => {
      const mj = await loadMujoco();
      const source = fixtureModel('quad-servo');
      const model = {
        ...source,
        joints: source.joints.toReversed().map((j, i) => (i === 1 ? { ...j, actuator: -1 } : j)),
      };
      const selected = [model.joints[3], model.joints[1], model.joints[0]];
      const policy = forwardEcho(
        model,
        selected.map((j) => j.id),
      );

      policy.defaultPose = [0.1, 0.2, -0.3];
      policy.layers[0].w.fill(0);
      policy.layers[0].b = [0.25, -0.5, 0.75];

      const engine = new SimEngine(mj, model);
      const expected = new SimEngine(mj, model);
      const values = Object.fromEntries(
        selected
          .filter((j) => j.actuator >= 0)
          .map((j) => {
            const k = selected.indexOf(j);

            return [j.id, ((policy.defaultPose[k] + policy.actionScale * policy.layers[0].b[k]) * 180) / Math.PI];
          }),
      );

      try {
        const robot = model.robots[0].key;
        const route = {
          keys: [{ t: 0, forward: 0, left: 0 }],
          gain: 1,
          headingGain: 1,
          deadband: 0.01,
          limits: { forward: [-1, 1] as [number, number], left: [-1, 1] as [number, number], turn: 1 },
        };

        engine.setController(
          kind === 'policy' ? { kind, policy, robot } : { kind, robot, route, drive: { kind: 'policy', policy } },
        );
        expected.setController({ kind: 'hold', values });

        for (let step = 0; step < 30; step++) {
          engine.step(engine.dt);
          expected.step(expected.dt);
          expect(Array.from(engine.data.ctrl)).toEqual(closeArray(expected.data.ctrl));
          expect(Array.from(engine.data.qpos)).toEqual(closeArray(expected.data.qpos));
        }

        expect(engine.data.ctrl[source.joints.at(-2)!.actuator]).toBe(0);
      } finally {
        engine.dispose();
        expected.dispose();
      }
    },
  );

  it('rebinds replaced policies after hold, reset and respawn, and still refuses missing joints', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const engine = new SimEngine(mj, model);
    const robot = model.robots[0].key;
    const first = forwardEcho(model, [model.joints[3].id]);
    const next = forwardEcho(model, [model.joints[5].id, model.joints[0].id]);

    next.defaultPose = [0.1, -0.2];

    try {
      engine.setController({ kind: 'policy', policy: first, robot });
      engine.step(engine.dt);
      engine.setController({ kind: 'hold' });
      engine.step(engine.dt);
      engine.setController({ kind: 'policy', policy: next, robot });

      for (const reset of [() => {}, () => engine.reset(), () => engine.respawn(robot)]) {
        reset();
        engine.step(engine.dt);
        expect(engine.data.ctrl[model.joints[5].actuator]).toBeCloseTo(0.15, 6);
        expect(engine.data.ctrl[model.joints[0].actuator]).toBeCloseTo(-0.15, 6);
        expect(engine.data.ctrl[model.joints[3].actuator]).toBeCloseTo(
          ((model.initial.values[model.joints[3].id] ?? 0) * Math.PI) / 180,
          6,
        );
      }

      const missing = forwardEcho(model, ['missing']);

      expect(() => engine.setController({ kind: 'policy', policy: missing, robot })).toThrow('Train it again.');
    } finally {
      engine.dispose();
    }
  });

  it.each(['quad-servo', 'hexapod'])(
    'bounds joint id reads to the hold pass while stepping %s policies',
    async (id) => {
      const mj = await loadMujoco();
      const model = fixtureModel(id);
      const engine = new SimEngine(mj, model);
      let reads = 0;

      model.joints.forEach((joint) => {
        const name = joint.id;

        Object.defineProperty(joint, 'id', {
          get: () => {
            reads++;

            return name;
          },
        });
      });

      try {
        engine.setController({ kind: 'policy', policy: forwardEcho(model), robot: model.robots[0].key });
        reads = 0;
        engine.step(engine.dt * 50);
        expect(reads).toBe(model.joints.length * 50);
      } finally {
        engine.dispose();
      }
    },
  );
});
