import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { readContinuation } from '../sim/continuationFile';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { WorldMoves } from '../sim/worldMoves';
import { sha256Hex } from '../skills/hash';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { branchRecording } from './branchRecording';
import { encodeRecording, decodeRecording } from './recordingFile';
import { worldItem } from './schema';
import { caseRobot, touchTheDots } from './testing';
import { scoreTry } from './tries';

it('keeps the complete failed prefix, appends a changed suffix and preserves source bytes', async () => {
  const mj = await loadMujoco();
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const rig = buildRig(robot.joints, robot.parts);
  const preset = touchTheDots(robot);
  const kase = {
    ...preset,
    task: {
      ...preset.task,
      probes: [],
      contract: {
        version: 1 as const,
        failures: [],
        success: {
          always: {
            window: 'whole' as const,
            state: {
              atom: {
                expr: { signal: 'torque' },
                cmp: '<' as const,
                value: 0.1,
                scale: 1,
              },
            },
          },
        },
      },
    },
  };
  const model = buildMjcf({
    ...caseRobot(robot),
    rig,
    project: DEFAULT_PROJECT,
    world: kase.world.objects.map(worldItem),
  });
  const engine = new SimEngine(mj, model);
  const restored = new SimEngine(mj, model);
  const world = new WorldMoves(mj, engine);
  const controller = { kind: 'hold' as const, values: { arm0: 50 } };

  try {
    engine.setController(controller);
    engine.setFault('arm0', 'weak');

    const recorder = new Recorder(engine, controller, world, {
      caseHash: sha256Hex(JSON.stringify(kase)),
      seconds: kase.task.seconds,
      world,
      physics: () => ({ active: false, delay: { count: 0, next: 0, history: [] } }),
    });

    engine.stepHook = recorder.hook;
    engine.continuationHook = recorder.continuationHook;
    engine.step(1.2);

    const source = recorder.finish();
    const unchanged = encodeRecording(source);
    const point = readContinuation(source.continuation!)!.checkpoints[1];

    expect(restored.continuation.restore(point.engine)).toBe(true);
    restored.setController({ kind: 'limp' });

    const suffixRecorder = new Recorder(restored, { kind: 'limp' });

    restored.stepHook = suffixRecorder.hook;
    restored.step(0.3);

    const suffix = suffixRecorder.finish();
    const joined = branchRecording({ source, checkpoint: point, suffix })!;

    const portable = encodeRecording(joined);

    expect(encodeRecording(decodeRecording(portable)!)).toEqual(portable);
    expect(joined.frames).toBe(point.frame + suffix.frames);
    expect(joined.qpos.subarray(0, (point.frame + 1) * source.nq)).toEqual(
      source.qpos.subarray(0, (point.frame + 1) * source.nq),
    );
    expect(joined.t.every((time, i) => !i || time > joined.t[i - 1])).toBe(true);
    expect(joined.t.at(-1)).toBeCloseTo(1.3, 5);
    expect(suffix.torque!.subarray(1).every((value) => value < 0.1)).toBe(true);
    expect((await scoreTry({ kase, model, recording: joined, effector: null, rig })).passed).toBe(false);
    expect(encodeRecording(source)).toEqual(unchanged);
    expect(joined.qpos.subarray((point.frame + 1) * source.nq)).not.toEqual(
      source.qpos.subarray((point.frame + 1) * source.nq),
    );
    expect(branchRecording({ source, checkpoint: point, suffix: { ...suffix, nq: suffix.nq + 1 } })).toBeNull();
  } finally {
    engine.dispose();
    restored.dispose();
  }
});
