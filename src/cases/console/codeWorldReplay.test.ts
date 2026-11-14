import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { V3 } from '../../utils/kinematics';
import { replayTry } from '../tryReplay';
import { liveCodeTry, type LiveRun } from './fixtures/liveCode';
import { CONVEYOR, conveyorCase, sweep, WHACK, whackCase } from './fixtures/worldApps';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const chase = (run: LiveRun) => {
  if (run.mover.looks().target?.visible) run.engine.command({ v: [0, 0, 0], target: run.objectAt('target') });
};

function scripted(commands: Array<{ at: number; target: V3 }>) {
  const left = [...commands];

  return (run: LiveRun, t: number) => {
    while (left.length && left[0].at <= t + 1e-9) run.engine.command({ v: [0, 0, 0], target: left.shift()!.target });
  };
}

const last = (qpos: Float64Array, nq: number) => Array.from(qpos.subarray(qpos.length - nq));

describe('replaying a try whose code changed its world', { timeout: 120_000 }, () => {
  it('gives the same verdict as the live try', async () => {
    const mj = await loadMujoco();
    const live = await liveCodeTry({ mj, kase: whackCase(), robot: robot('arm-3dof'), source: WHACK, player: chase });
    const replayed = await replayTry(mj, { ...live.run.scoring, recording: live.recording }, null);

    expect(live.verdict.passed).toBe(true);
    expect(replayed.passed).toBe(live.verdict.passed);
    expect(replayed.recording.world).toEqual(live.recording.world);
    live.run.engine.dispose();
  });

  it('gives the same final positions from the same seed and events', async () => {
    const mj = await loadMujoco();
    const live = await liveCodeTry({
      mj,
      kase: conveyorCase(),
      robot: robot('arm-6dof'),
      source: CONVEYOR,
      player: scripted([...sweep(0.2), ...sweep(3.6)]),
    });
    const source = { ...live.run.scoring, recording: live.recording };
    const runs = [await replayTry(mj, source, null), await replayTry(mj, source, null)];
    const seeded = [await replayTry(mj, source, 4), await replayTry(mj, source, 4)];
    const { nq } = live.recording;

    expect(live.recording.world).toHaveLength(1);
    expect(last(runs[0].recording.qpos, nq)).toEqual(last(runs[1].recording.qpos, nq));
    expect(last(seeded[0].recording.qpos, nq)).toEqual(last(seeded[1].recording.qpos, nq));
    expect(runs[0].passed).toBe(live.verdict.passed);
    live.run.engine.dispose();
  });
});
