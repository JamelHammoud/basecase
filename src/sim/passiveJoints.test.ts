import { passiveMechanisms, passiveMechanism } from './fixtures/passiveMechanisms';
import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { SimEngine } from './engine';
import type { SimModel } from './mjcfTypes';
import { trainingJob } from './trainingJob';
import { servoLayout } from '../robot/sceneRobot';
import { jointMap } from './robotPackage/jointMap';
import { robotJoints } from '../datasets/episodes';
import { jointFrom, jointProblem, withActuation } from '../joints/declare';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('explicit passive joints', () => {
  it.each(passiveMechanisms)('$name preserves physical state with exactly the declared motors', (spec) => {
    const { count, powered } = spec;
    const { model, project, parts } = passiveMechanism(spec);
    const engine = new SimEngine(mj, model);

    try {
      expect(engine.model.nv).toBe(count);
      expect(engine.model.nu).toBe(powered);
      expect(model.joints.filter((j) => j.actuator >= 0).map((j) => j.actuator)).toEqual(
        Array.from({ length: powered }, (_, i) => i),
      );
      expect(servoLayout(project.joints).movable).toHaveLength(powered);
      expect(jointMap({ model, project, parts, name: 'Mechanism' }).joints).toHaveLength(powered);
      expect(robotJoints(model)).toHaveLength(powered);

      checkTraining(model, { count, powered });
      model.joints
        .filter((j) => j.actuator < 0)
        .forEach((j) => {
          expect(j.effort).toBe(0);
          expect(model.xml).not.toMatch(new RegExp(`<position[^>]*joint="${j.name}"`));
        });
    } finally {
      engine.dispose();
    }
  });

  it('lets gravity move a passive neighbor while a powered joint holds', () => {
    const { model } = passiveMechanism({ name: 'neighbors', type: 'revolute', axis: [0, 0, 1], count: 2, powered: 1 });
    const engine = new SimEngine(mj, model);

    try {
      engine.step(0.2);
      expect(Math.abs(engine.data.qpos[0])).toBeLessThan(0.04);
      expect(Math.abs(engine.data.qpos[1])).toBeGreaterThan(0.2);
      expect(engine.model.dof_armature[1]).toBe(0);
      expect(engine.model.dof_damping[1]).toBe(0);
      expect(engine.model.dof_frictionloss[1]).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it('matches free-fall acceleration, preserves mechanical energy and stops at its limit', () => {
    const { model } = passiveMechanism(passiveMechanisms[1]);
    const engine = new SimEngine(mj, model);

    try {
      engine.step(0.02);
      expect(engine.data.qvel[0]).toBeCloseTo(-9.81 * 0.02, 5);
      expect(engine.data.qpos[0]).toBeCloseTo(-0.5 * 9.81 * 0.02 ** 2, 3);

      const energy = 0.5 * engine.data.qvel[0] ** 2 + 9.81 * engine.data.qpos[0];

      expect(Math.abs(energy)).toBeLessThan(0.003);
      engine.step(0.5);
      expect(engine.data.qpos[0]).toBeGreaterThan(-0.102);
      expect(engine.data.qpos[0]).toBeLessThan(-0.098);
    } finally {
      engine.dispose();
    }
  });

  it('rejects contradictory declarations and preserves legacy intent through edits and JSON', () => {
    const { joints, parts } = passiveMechanism(passiveMechanisms[0]);
    const contradictory = { ...joints[0], actuators: ['base'] };

    expect(jointProblem(contradictory, new Set(parts.map((p) => p.id)))).toContain('passive');
    expect(() => jointFrom(contradictory, parts)).toThrow(/passive/);

    const legacy = { ...joints[0], actuation: undefined };
    const changed = withActuation([legacy], legacy.id, 'passive');

    expect(JSON.parse(JSON.stringify(changed))[0].actuation).toBe('passive');
    expect(legacy.actuation).toBeUndefined();
  });
});

function checkTraining(model: SimModel, { count, powered }: { count: number; powered: number }) {
  const job = () => trainingJob(model, model.robots[0].key, { task: 'stand', minutes: 1, command: [0, 0, 0] }, 'Test');

  if (!powered) {
    expect(job).toThrow('Training needs a powered joint.');

    return;
  }

  const made = job();

  expect(made.joints).toHaveLength(powered);
  expect(made.ctrlDefault).toHaveLength(powered);
  expect(Object.keys(made.initialJoints)).toHaveLength(count);
}
