import { describe, expect, it } from 'vitest';
import type { EngineeringReport, JointLoad } from './engineeringTypes';
import { reportMetrics } from './designSweepTable';
import { torqueRow } from './engineeringTorqueRows';
import { worstJointLoad } from './worstJointLoad';

const load = (index: number, stallShare?: number): JointLoad => ({
  joint: {
    id: `joint-${index}`,
    name: `Axis ${index}`,
    type: 'revolute',
    parent: [],
    child: [],
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    range: [-90, 90],
  },
  massG: 100,
  swingNm: 0.1,
  stanceNm: 0,
  loadNm: 0.1,
  kind: 'hold',
  stallShare,
  status: stallShare === undefined ? 'not run' : 'pass',
});

const previous = (loads: JointLoad[]) =>
  loads.filter((item) => item.stallShare !== undefined).sort((a, b) => b.stallShare! - a.stallShare!)[0];

const report = (joints: JointLoad[]): EngineeringReport => ({
  joints,
  rows: [torqueRow(joints)],
  massG: 100,
  com: [0, 0, 0],
  masses: [],
});

describe('worst joint load selection', () => {
  it('matches ordered selection across generated loads, ties and missing ratings', () => {
    for (let sample = 0; sample < 160; sample++) {
      const loads = Array.from({ length: sample }, (_, index) =>
        load(index, (index + sample) % 7 === 0 ? undefined : ((index * 31 + sample * 17) % 19) / 20),
      );
      const winner = previous(loads);
      const snapshot = structuredClone(loads);
      const metrics = reportMetrics(report(loads));

      expect(worstJointLoad(loads)).toBe(winner);
      expect(metrics.worstShare).toBe(winner?.stallShare);
      expect(metrics.worstJoint).toBe(winner?.joint.name);
      expect(loads).toEqual(snapshot);

      if (winner) expect(torqueRow(loads).detail).toContain(`Worst: ${winner.joint.name},`);
    }
  });

  it('retains first ties, signed zeros, infinities and legacy NaN ordering', () => {
    const values = [undefined, -Infinity, -0, 0, 0.5, 0.5, Infinity, Number.NaN];

    for (const first of values) {
      for (const second of values) {
        const loads = [load(0, first), load(1, second), load(2, 0.75)];

        expect(worstJointLoad(loads)).toBe(previous(loads));
      }
    }

    expect(worstJointLoad([])).toBeUndefined();
    expect(worstJointLoad([load(0), load(1)])).toBeUndefined();
  });

  it('reads current shares after edits and keeps independent results', () => {
    const loads = [load(0, 0.2), load(1, 0.4), load(2)];
    const first = worstJointLoad(loads);

    loads[0].stallShare = 0.6;
    expect(worstJointLoad(loads)).toBe(loads[0]);
    expect(first).toBe(loads[1]);
    loads[2].stallShare = 0.8;
    expect(worstJointLoad(loads)).toBe(loads[2]);
    loads[2].stallShare = undefined;
    expect(worstJointLoad(loads)).toBe(loads[0]);
  });

  it.each([300, 600])('reads each share once across %i loads', (length) => {
    let reads = 0;
    const loads = Array.from({ length }, (_, index) => {
      const item = load(index);

      Object.defineProperty(item, 'stallShare', {
        get: () => {
          reads++;

          return (index * 37) % length;
        },
      });

      return item;
    });
    const expected = previous(loads);
    const previousReads = reads;

    reads = 0;
    expect(worstJointLoad(loads)).toBe(expected);
    expect(reads).toBe(length);
    expect(previousReads).toBeGreaterThan(length * 2);
  });
});
