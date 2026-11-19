import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { armWorkspaceCase } from './armWorkspaceCases';
import { sampleArmWorkspace, workspaceValues } from './armWorkspace';
import { runSkillsJob } from './skillsJob';
import { SimEngine } from '../sim/engine';
import { moveAnimations, moveEnvironment } from './moveEnvironment';
import { validateEnvironment } from './environment';
import { trainMove } from './moves';

it('hands an actual sampled configuration to the existing bounded motion planner', async () => {
  const mj = await loadMujoco();
  const fixture = armWorkspaceCase('three-axis');
  const samples = await sampleArmWorkspace(mj, fixture.model, { part: fixture.part, point: fixture.point, budget: 8 });
  const values = workspaceValues(samples, 0);
  const ports = {
    mj,
    forge: async () => {
      throw new Error('No training');
    },
    save: async () => {
      throw new Error('No retention');
    },
  };
  const reply = await runSkillsJob(
    {
      type: 'workspace-motion',
      model: fixture.model,
      request: { parts: [fixture.part], keys: [{ t: 8, values }], horizonS: 10 },
    },
    ports,
  );

  expect(reply.type).toBe('workspace-motion');

  if (reply.type !== 'workspace-motion') throw new Error('Expected workspace motion');

  expect(reply.result.reason).toBe('');
  expect(reply.result.controller?.kind).toBe('animation');

  if (reply.result.controller?.kind !== 'animation') throw new Error('Expected planned animation');

  const animation = { ...reply.result.controller.animation, robot: fixture.model.robots[0].key };

  expect(moveAnimations(fixture.model, [animation])).toEqual([animation]);
  expect(await validateEnvironment(moveEnvironment(fixture.model, animation), fixture.model)).toEqual([]);

  const engine = new SimEngine(mj, fixture.model);
  const last = reply.result.controller.animation.keyframes.at(-1)!;

  try {
    for (const [id, value] of Object.entries(values)) expect(last.values[id]).toBeCloseTo(value, 10);
  } finally {
    engine.dispose();
  }

  const refused = await runSkillsJob(
    {
      type: 'workspace-motion',
      model: fixture.model,
      request: { parts: [fixture.part], keys: [{ t: 0.001, values }], horizonS: 0.001 },
    },
    ports,
  );

  expect(refused.type === 'workspace-motion' && refused.result.controller).toBeNull();
  expect(refused.type === 'workspace-motion' && refused.result.reason).toBe('The motion needs more time.');
});

it('scopes a target on the second arm without changing the first arm or model ordering', () => {
  const { model } = armWorkspaceCase('dual-arm');
  const robot = model.robots[1];
  const before = JSON.stringify(model);
  const animation = {
    id: 'second-arm',
    name: 'Second arm target',
    robot: robot.key,
    duration: 1,
    loop: false,
    interpolation: 'linear' as const,
    keyframes: [
      { t: 0, values: { park: -12 } },
      { t: 1, values: { park: 30 } },
    ],
  };

  expect(moveAnimations(model, [animation])).toEqual([animation]);

  const environment = moveEnvironment(model, animation);

  expect(environment.robot).toBe(robot.key);
  expect(environment.action.joints).toEqual(['park']);
  expect(environment.reference?.joints).toEqual(['park']);
  expect(environment.reset.pose?.values.arm0).toBe(model.initial.values.arm0);
  expect(JSON.stringify(model)).toBe(before);
});

it('refuses incomplete collision provenance before fixed-arm move judging or retention', async () => {
  const mj = await loadMujoco();
  const { model } = armWorkspaceCase('three-axis');
  const animation = {
    id: 'refused',
    name: 'Refused target',
    robot: model.robots[0].key,
    duration: 1,
    loop: false,
    interpolation: 'linear' as const,
    keyframes: [
      { t: 0, values: { arm0: -12 } },
      { t: 1, values: { arm0: 12 } },
    ],
  };
  const result = await trainMove({
    mj,
    model: { ...model, collisionGeometry: undefined },
    animation,
    design: 'legacy',
    forge: async () => {
      throw new Error('No training');
    },
    save: async () => {
      throw new Error('No retention');
    },
  });

  expect(result.outcome.kind).toBe('not-found');

  if (result.outcome.kind === 'not-found') expect(result.outcome.reason).toMatch(/collision geometry/);
});
