import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { runCase, touchTheDots } from '../../src/cases/testing';
import { armProblems, groundProblems, realtimeProblems, type ClockSample, type V3 } from './driveJudge';
import { playProblems, playRobot } from './play';

const still: V3 = [0, 250, 120];

const clocks = (rate: number): ClockSample[] => Array.from({ length: 11 }, (_, i) => ({ wallS: i, simS: i * rate }));

describe('Stage 2 play canaries: the gate’s own judges reject planted faults', () => {
  it('canary limp: a runner whose limp is really the reference passes the margin check', async () => {
    const mj = await loadMujoco();
    const arm = playRobot('arm-3dof');
    const kase = touchTheDots(arm);
    const reference = await runCase(mj, kase, arm, { controller: 'reference' });

    if (!reference.passed) throw new Error('setup: the reference run must pass for this canary to mean anything');

    expect(playProblems(reference, reference, reference)).toEqual([]);
  }, 300_000);

  it('canary frozen arm: an arm drive that never moves the hand passes', () => {
    const phases = { start: still, afterIdle: still, afterForward: still, afterBack: still, afterRelease: still };

    expect(armProblems({ ...phases, fell: false })).toEqual([]);
  });

  it('canary runaway rover: a rover that keeps going after release passes', () => {
    expect(
      groundProblems({ start: 0, afterIdle: 0, afterForward: 0.4, afterBack: 0.3, afterRelease: 0.6, fell: false }),
    ).toEqual([]);
  });

  it('canary slow gallery: a gallery at half real time passes', () => {
    expect(realtimeProblems(clocks(0.5))).toEqual([]);
  });

  it('canary fast gallery: a gallery at double real time passes', () => {
    expect(realtimeProblems(clocks(2))).toEqual([]);
  });
});
