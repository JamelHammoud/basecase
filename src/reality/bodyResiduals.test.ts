import { describe, expect, it } from 'vitest';
import type { RobotRun } from '../robot/runBuffer';
import { prepareBodyResiduals } from './bodyResiduals';

function recording(times: number[]): RobotRun {
  return {
    joints: ['angular', 'still', 'linear'],
    statuses: times.map((at, i) => ({ at, positions: [i * 0.125, 9, i * 0.001] })),
    intents: [],
    faultJoint: null,
    faultAt: 0,
    message: '',
  };
}

function predicted(run: RobotRun, offset: number) {
  return run.statuses.map((status, i) => status.positions.map((value, j) => value! + offset * (i + j + 1)));
}

describe('prepared body residuals', () => {
  it('splits by elapsed time, puts the midpoint in check and preserves frame and requested joint order', () => {
    const run = recording([100, 110, 120, 150, 190, 200]);
    const source = structuredClone(run);
    const selection = [2, 0];
    const residuals = prepareBodyResiduals(run, selection);
    const replay = run.statuses.map(() => [1, 999, 2]);
    const savedReplay = structuredClone(replay);

    expect([...residuals.fit(replay)]).toEqual([2 - 0.001, 1 - 0.125, 2 - 0.002, 1 - 0.25]);
    expect([...residuals.check(replay)]).toEqual([2 - 0.003, 1 - 0.375, 2 - 0.004, 1 - 0.5, 2 - 0.005, 1 - 0.625]);
    expect(run).toEqual(source);
    expect(selection).toEqual([2, 0]);
    expect(replay).toEqual(savedReplay);
  });

  it('owns each result while reading fresh predictions on later probes', () => {
    const run = recording([0, 250, 500, 750, 1000]);
    const residuals = prepareBodyResiduals(run, [0]);
    const replay = predicted(run, 0.25);
    const first = residuals.fit(replay);
    const checked = residuals.check(replay);

    expect([...first]).toEqual([0.5]);
    expect([...checked]).toEqual([0.75, 1, 1.25]);
    replay[1][0] = 7;
    expect([...residuals.fit(replay)]).toEqual([7 - 0.125]);
    expect([...first]).toEqual([0.5]);
    first[0] = 99;
    expect([...residuals.fit(replay)]).toEqual([7 - 0.125]);
    expect([...checked]).toEqual([0.75, 1, 1.25]);
  });

  it('keeps a per-fit snapshot and prepares edited recordings and selections afresh', () => {
    const run = recording([0, 100, 200]);
    const joints = [0];
    const original = prepareBodyResiduals(run, joints);
    const replay = run.statuses.map(() => [1, 10, 2]);

    run.statuses[1].positions[0] = 3;
    joints[0] = 2;
    expect([...original.check(replay)]).toEqual([1 - 0.125, 1 - 0.25]);
    expect([...prepareBodyResiduals(run, [0]).check(replay)]).toEqual([-2, 1 - 0.25]);
    expect([...prepareBodyResiduals(run, joints).check(replay)]).toEqual([2 - 0.001, 2 - 0.002]);
  });

  it('handles empty windows, empty selections and repeated selected joints', () => {
    const run = recording([0, 100]);
    const replay = predicted(run, 0.5);
    const residuals = prepareBodyResiduals(run, [2, 2]);

    expect([...residuals.fit(replay)]).toEqual([]);
    expect([...residuals.check(replay)]).toEqual([2, 2]);
    expect([...prepareBodyResiduals(run, []).check(replay)]).toEqual([]);
    expect([...prepareBodyResiduals(recording([0]), [0]).check([[7]])]).toEqual([]);
  });

  it('matches direct residual scoring across irregular recordings, selections and successive replays', () => {
    for (let sample = 0; sample < 60; sample++) {
      const run = recording(Array.from({ length: 2 + sample }, (_, i) => 37 + i * i * (sample + 1)));
      const joints = sample % 2 ? [0, 2] : [2];
      const residuals = prepareBodyResiduals(run, joints);
      const midpoint = (run.statuses[0].at + run.statuses.at(-1)!.at) / 2;

      for (const offset of [-0.25, 0, 0.125]) {
        const replay = predicted(run, offset);
        const fit: number[] = [];
        const check: number[] = [];

        run.statuses.forEach((status, frame) => {
          if (frame === 0) return;

          const target = status.at < midpoint ? fit : check;

          target.push(...joints.map((joint) => replay[frame][joint] - status.positions[joint]!));
        });
        expect([...residuals.fit(replay)]).toEqual(fit);
        expect([...residuals.check(replay)]).toEqual(check);
      }
    }
  });

  it.each([300, 600])('reads a %i-frame recording only while preparing all later probes', (count) => {
    const run = recording(Array.from({ length: count }, (_, i) => i * 10));
    const replay = predicted(run, 0.125);
    let timeReads = 0;
    let positionReads = 0;

    for (const status of run.statuses) {
      const { at, positions } = status;

      Object.defineProperty(status, 'at', {
        get: () => {
          timeReads++;

          return at;
        },
      });

      for (const joint of [0, 2]) {
        const value = positions[joint];

        Object.defineProperty(positions, joint, {
          get: () => {
            positionReads++;

            return value;
          },
        });
      }
    }

    const residuals = prepareBodyResiduals(run, [2, 0]);

    expect(timeReads).toBe(count + 1);
    expect(positionReads).toBe((count - 1) * 2);

    const preparedReads = [timeReads, positionReads];

    for (let probe = 0; probe < 20; probe++) {
      expect(residuals.fit(replay)).toHaveLength((count / 2 - 1) * 2);
      expect(residuals.check(replay)).toHaveLength(count);
    }

    expect([timeReads, positionReads]).toEqual(preparedReads);
  });
});
