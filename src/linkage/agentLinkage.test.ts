import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { synthesizeFourBar, type Vec2 } from '../utils/linkage';
import { GROUND_PLANE } from '../utils/sketch/placement';
import { scenePlane, synthesizeLinkageRequest, type LinkageToolContext } from './agentLinkage';

const LINE: Vec2[] = [
  [0, 0],
  [20, 0],
  [40, 0],
  [60, 0],
  [80, 0],
];
const solved = synthesizeFourBar(LINE);

function context(): LinkageToolContext & { inserted: Array<{ parts: ScenePart[]; joints: RobotJoint[] }> } {
  const inserted: Array<{ parts: ScenePart[]; joints: RobotJoint[] }> = [];

  return {
    inserted,
    solve: vi.fn(async () => solved),
    insert: (parts, joints) => inserted.push({ parts, joints }),
    newBase: () => 'fb',
  };
}

describe('synthesize_linkage', () => {
  it('lists up to three four-bars with their path error in mm', async () => {
    const { text } = await synthesizeLinkageRequest({ points: LINE }, context());
    const lines = text.split('\n');

    expect(solved).toHaveLength(3);
    expect(lines[0]).toMatch(/^3 crank-rocker four-bars through 5 points in CAD XY/);

    for (const n of [1, 2, 3]) {
      expect(lines[n]).toMatch(new RegExp(`^${n}\\. Path error max \\d+\\.?\\d* mm, RMS \\d+\\.?\\d* mm;`));
      expect(lines[n]).toMatch(/transmission ≥ \d+°; crank .*links ground .* mm; coupler point P/);
    }
  });

  it('says why when there are too few points, without solving', async () => {
    const ctx = context();
    const { text } = await synthesizeLinkageRequest({ points: LINE.slice(0, 4) }, ctx);

    expect(text).toBe('No buildable four-bar: give 5–12 path points, not 4.');
    expect(ctx.solve).not.toHaveBeenCalled();
  });

  it('says why when nothing fits', async () => {
    const ctx = { ...context(), solve: async () => [] };
    const { text } = await synthesizeLinkageRequest({ points: LINE }, ctx);

    expect(text).toMatch(/^No buildable four-bar: no crank-rocker with links of 10–300 mm/);
  });

  it('maps CAD planes into the scene frame', () => {
    expect(scenePlane()).toEqual(GROUND_PLANE);
    expect(scenePlane('XZ', [10, 20, 30])).toEqual({ origin: [10, 30, -20], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
    expect(scenePlane('YZ')).toEqual({ origin: [0, 0, 0], u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0] });
  });

  it('inserts the chosen four-bar with a servo on the crank', async () => {
    const ctx = context();
    const { text } = await synthesizeLinkageRequest({ points: LINE, plane: 'XZ', insert: 2 }, ctx);
    const [{ parts, joints }] = ctx.inserted;
    const crank = joints.find((j) => j.id === 'fb-crank-joint')!;

    expect(parts.map((p) => p.id)).toEqual(['fb-ground', 'fb-crank', 'fb-coupler', 'fb-rocker', 'fb-servo']);
    expect(parts.find((p) => p.id === 'fb-servo')?.componentId).toBe('feetech-sts3215');
    expect(crank.actuators).toEqual(['fb-servo']);
    expect(joints).toHaveLength(3);
    expect(text).toMatch(/Inserted solution 2 .*fb-ground, fb-crank, fb-coupler, fb-rocker, fb-servo/);
    expect(text).toMatch(/Port P on fb-coupler traces the path as fb-crank-joint turns across its range\./);
  });

  it('inserts nothing for a solution that does not exist', async () => {
    const ctx = { ...context(), solve: async () => solved.slice(0, 1) };
    const { text } = await synthesizeLinkageRequest({ points: LINE, insert: 3 }, ctx);

    expect(text).toMatch(/Not inserted: there is no solution 3; insert 1\.$/);
  });
});
