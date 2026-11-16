import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { SimEngine } from './engine';
import { Recorder } from './recorder';
import { passiveMechanism, passiveMechanisms } from './fixtures/passiveMechanisms';
import { buildMjcf } from './mjcf';
import { buildRig } from '../utils/kinematics';
import { poseJoints } from './drivePose';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('passive mechanism motion', () => {
  it.each(passiveMechanisms)('$name responds through physical coordinates without action channels', (spec) => {
    const { model, parts, joints } = passiveMechanism(spec);
    const engine = new SimEngine(mj, model);

    try {
      if (spec.free) engine.data.qvel[0] = 1;

      const recorder = new Recorder(engine);

      engine.step(0.3, recorder.hook);

      const recording = recorder.finish();

      expect(recording.nv).toBe(spec.count);
      expect(recording.nu).toBe(spec.powered);
      expect(recording.qpos).toHaveLength(recording.frames * spec.count);
      expect(recording.ctrl).toHaveLength(recording.frames * spec.powered);
      expect(poseJoints(buildRig(joints, parts))).toHaveLength(spec.powered);
      expect(Math.abs(engine.data.qpos[spec.count - 1])).toBeGreaterThan(0.02);

      if (spec.contact) {
        expect(engine.data.ncon).toBeGreaterThan(0);
        expect(engine.data.qpos[0]).toBeGreaterThan(-0.075);
      }
    } finally {
      engine.dispose();
    }
  });

  it('retains declared resistance, clamped initial pose and refuses motors on a loaded passive record', () => {
    const { parts, project } = passiveMechanism(passiveMechanisms[0]);
    const joints = [{ ...project.joints[0], damping: 0.03, frictionloss: 0.002 }];
    const input = {
      parts,
      project,
      rig: buildRig(joints, parts),
      measures: {},
      partTriangles: () => null,
      pose: { values: { joint_0: 120 } },
    };
    const model = buildMjcf(input);
    const engine = new SimEngine(mj, model);

    try {
      expect(engine.model.dof_damping[0]).toBeCloseTo(0.03);
      expect(engine.model.dof_frictionloss[0]).toBeCloseTo(0.002);
      expect(engine.data.qpos[0]).toBeCloseTo(Math.PI / 2);
      expect(engine.model.dof_armature[0]).toBe(0);
    } finally {
      engine.dispose();
    }

    expect(() => buildMjcf({ ...input, rig: buildRig([{ ...joints[0], actuators: ['base'] }], parts) })).toThrow(
      /passive/,
    );
  });
});
