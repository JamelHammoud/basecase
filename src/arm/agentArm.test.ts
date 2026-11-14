import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { sizeArm } from '../utils/armSizing';
import { sizeArmRequest, type ArmPayload } from './agentArm';

const TARGETS = [
  { name: 'Desk', at: [0, -300, 0] },
  { name: 'Top Shelf', at: [120, -220, 380] },
  { at: [-260, -120, -60] },
];

function run(payload: ArmPayload, links = true) {
  const placed: Array<{ parts: ScenePart[]; skeleton: RobotSkeleton }> = [];
  const reply = sizeArmRequest(payload, {
    solve: async (request) => sizeArm(request),
    parts: () => [],
    skeleton: () => undefined,
    place: (parts, skeleton) => placed.push({ parts, skeleton }),
    links,
  });

  return reply.then(({ text }) => ({ text, placed }));
}

describe('size_arm', () => {
  it('places the skeleton, a servo per joint and the links, and reports them', async () => {
    const { text, placed } = await run({ targets: TARGETS, payload_g: 200 });
    const [{ parts, skeleton }] = placed;
    const servos = parts.filter((p) => p.kind === 'component');

    expect(skeleton.joints.map((j) => j.id)).toEqual(['base_yaw', 'shoulder_pitch', 'elbow_pitch', 'wrist_pitch']);
    expect(skeleton.joints.at(-1)?.payloadG).toBe(200);
    expect(servos.map((s) => s.frame)).toEqual(skeleton.joints.map((j) => j.id));
    expect(parts.filter((p) => p.cad?.pending).map((p) => p.name)).toEqual(
      expect.arrayContaining(['Arm Base', 'Shoulder Bracket', 'Upper Arm', 'Forearm', 'Wrist Flange']),
    );
    expect(text).toMatch(/^Placed the shortest arm on the 5 mm grid that reaches 3 targets carrying 200 g/);
    expect(text).toMatch(/Target 3 within \d/);
    expect(text).toMatch(/Servos \$\d+\.\d\d/);
  });

  it('places no links on the web demo', async () => {
    const { placed } = await run({ targets: TARGETS, payload_g: 200 }, false);

    expect(placed[0].parts.every((p) => p.kind === 'component')).toBe(true);
  });

  it('names the target it cannot reach and places nothing', async () => {
    const { text, placed } = await run({
      targets: [...TARGETS, { name: 'Far Shelf', at: [2000, 0, 0] }],
      payload_g: 200,
    });

    expect(text).toBe('No arm: Far Shelf is out of reach.');
    expect(placed).toEqual([]);
  });

  it('asks for targets and a payload it can read', async () => {
    expect((await run({ targets: [], payload_g: 200 })).text).toMatch(/^Give 1 to 8 targets/);
    expect((await run({ targets: [{ at: [0, 1] }], payload_g: 200 })).text).toMatch(/^Give 1 to 8 targets/);
    expect((await run({ targets: TARGETS })).text).toMatch(/^Give payload_g/);
  });
});
