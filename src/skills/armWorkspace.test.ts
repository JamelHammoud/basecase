import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { Vector3 } from 'three';
import { beforeAll, expect, it, vi } from 'vitest';
import { poseDeltas } from '../utils/kinematics';
import { SimEngine } from '../sim/engine';
import { selfContactArm } from '../sim/fixtures/selfContactArm';
import { fixtureModel } from './fixtureModels';
import { armWorkspaceCase, WORKSPACE_DESIGNS } from './armWorkspaceCases';
import { sampleArmWorkspace, workspaceValues } from './armWorkspace';
import { box } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each(WORKSPACE_DESIGNS)(
  'reproduces every %s sample through ordinary FK and independent collision generation',
  async (kind) => {
    const { input, model, point, part } = armWorkspaceCase(kind);
    const before = JSON.stringify({ input, model });
    const request = { part, point, budget: 96 };
    const result = await sampleArmWorkspace(mj, model, request);
    const replay = await sampleArmWorkspace(mj, model, request);
    const engine = new SimEngine(mj, model);

    engine.model.geom_margin.fill(0.002);
    engine.model.body_margin.fill(0.002);
    engine.model.pair_margin.fill(0.002);

    expect(replay.positions).toEqual(result.positions);
    expect(replay.configurations).toEqual(result.configurations);
    expect(result.checks).toBe(96);
    expect(result.positions.length).toBeGreaterThan(0);

    try {
      for (let i = 0; i < result.positions.length / 3; i++) {
        const values = workspaceValues(result, i);
        const delta = poseDeltas(
          input.rig,
          { values },
          input.parts.map((p) => p.id),
        ).get(part);
        const actual = new Vector3(...point);

        if (delta) actual.applyMatrix4(delta);

        const displayed = new Vector3(...result.positions.slice(i * 3, i * 3 + 3));

        expect(actual.distanceTo(displayed)).toBeLessThan(1e-6);
        engine.reset({ values });
        mj.mj_collision(engine.model, engine.data);

        const contacts = engine.data.contact;

        for (let k = 0; k < engine.data.ncon; k++) {
          const contact = contacts.get(k)!;

          expect(contact.dist).toBeGreaterThanOrEqual(0.002 - 1e-9);
          contact.delete();
        }

        contacts.delete();

        for (const j of model.joints.filter((j) => !result.joints.includes(j.id)))
          expect(values[j.id]).toBeCloseTo(model.initial.values[j.id] ?? 0, 10);
      }
    } finally {
      engine.dispose();
    }

    expect(JSON.stringify({ input, model })).toBe(before);
  },
);

it('bounds exhausted budgets, refuses unsupported sources and releases every engine on cancellation', async () => {
  const { model, part, point } = armWorkspaceCase('three-axis');
  const dispose = vi.spyOn(SimEngine.prototype, 'dispose');
  let polls = 0;

  await expect(sampleArmWorkspace(mj, model, { part, point, stop: () => ++polls > 1 })).rejects.toThrow(/Stopped/);
  expect(dispose).toHaveBeenCalledOnce();
  dispose.mockRestore();

  for (const budget of [0, -1, Infinity, 8193, NaN])
    await expect(sampleArmWorkspace(mj, model, { part, point, budget })).rejects.toThrow(/budget/);

  await expect(sampleArmWorkspace(mj, { ...model, collisionGeometry: undefined }, { part, point })).rejects.toThrow(
    /collision geometry/,
  );
  await expect(sampleArmWorkspace(mj, model, { part: 'disconnected', point })).rejects.toThrow(/part/);

  const disconnected = {
    ...model,
    joints: model.joints.map((j, i) => (i === 0 ? { ...j, name: 'disconnected_joint' } : j)),
  };

  await expect(sampleArmWorkspace(mj, disconnected, { part, point })).rejects.toThrow(/Reconnect/);
  await expect(sampleArmWorkspace(mj, fixtureModel('quad-servo'), { part: 'leg0_lower', point })).rejects.toThrow(
    /fixed/,
  );

  const moving = {
    ...model,
    bodies: model.bodies.map((b) => ({
      ...b,
      moves: { kind: 'mocap' as const, rotation: [0, 0, 0] as [number, number, number] },
    })),
  };

  await expect(sampleArmWorkspace(mj, moving, { part, point })).rejects.toThrow(/moving/);
});

it('filters forbidden self-contact and reports sampled endpoint evidence without a reachability verdict', async () => {
  const model = selfContactArm(true);
  const result = await sampleArmWorkspace(mj, model, { part: 'tip', point: [90, 200, 0], budget: 2048 });

  expect(result.checks).toBe(2048);
  expect(result.positions.length / 3).toBeLessThan(result.checks);
  expect(result.positions.length).toBeGreaterThan(0);
  expect(() => workspaceValues(result, -1)).toThrow();
  expect(() => workspaceValues(result, result.positions.length / 3)).toThrow();
});

it('yields during sampling so an asynchronous stop releases the model before exhausting its budget', async () => {
  const { model, part, point } = armWorkspaceCase('three-axis');
  let polls = 0;
  let stopped = false;
  const stop = () => {
    polls++;

    if (polls === 65)
      queueMicrotask(() => {
        stopped = true;
      });

    return stopped;
  };

  await expect(sampleArmWorkspace(mj, model, { part, point, stop })).rejects.toThrow('Stopped.');
  expect(polls).toBeGreaterThan(64);
  expect(polls).toBeLessThan(2048);
});

it('filters intervening world obstacles and leaves an exhausted empty sample unknown', async () => {
  const fixture = armWorkspaceCase('three-axis');
  const obstacle = { ...box('intervening', [0, 480, 0], [100, 30, 140], 1000), behavior: 'static' as const };
  const model = buildMjcf({ ...fixture.input, world: [obstacle] });
  const result = await sampleArmWorkspace(mj, model, { part: fixture.part, point: fixture.point, budget: 256 });
  const engine = new SimEngine(mj, model);

  engine.model.geom_margin.fill(0.002);
  engine.model.body_margin.fill(0.002);

  try {
    expect(result.positions.length / 3).toBeLessThan(result.checks);
    expect(result.positions.length).toBeGreaterThan(0);

    for (let i = 0; i < result.positions.length / 3; i++) {
      engine.reset({ values: workspaceValues(result, i) });

      const contacts = engine.data.contact;

      for (let k = 0; k < engine.data.ncon; k++) {
        const contact = contacts.get(k)!;

        expect(contact.dist).toBeGreaterThanOrEqual(0.002 - 1e-9);
        contact.delete();
      }

      contacts.delete();
    }
  } finally {
    engine.dispose();
  }

  const enclosed = buildMjcf({
    ...fixture.input,
    world: [{ ...obstacle, dimensions: { width: 2000, height: 2000, depth: 2000 } }],
  });
  const empty = await sampleArmWorkspace(mj, enclosed, { part: fixture.part, point: fixture.point, budget: 1 });

  expect(empty.checks).toBe(1);
  expect(empty.positions).toHaveLength(0);
  expect(empty.configurations).toHaveLength(0);
});
