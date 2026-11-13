import { describe, expect, it, vi } from 'vitest';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { ZUpVec } from '../types/skeleton';
import { sizeArmRequest } from './agentArmRequest';
import type { RequestContext } from './agentRequestHandlers';

vi.mock('../utils/armSizingClient', async () => {
  const { sizeArm } = await import('../utils/armSizing');

  return { sizeArmInWorker: async (input: Parameters<typeof sizeArm>[0]) => sizeArm(input) };
});

const DESK: ZUpVec[] = [
  [0, -260, 0],
  [150, -200, 160],
  [-130, -170, 60],
];

function fakeContext() {
  const inserted: ScenePart[] = [];
  const projects: ProjectSettings[] = [];
  const ctx = {
    project: () => projects.at(-1) ?? ({} as ProjectSettings),
    insertParts: (parts: ScenePart[]) => inserted.push(...parts),
    setProjectNow: (next: ProjectSettings) => projects.push(next),
    setAction: () => undefined,
  } as unknown as RequestContext;

  return { ctx, inserted, projects };
}

describe('size_arm', () => {
  it('frames a catalog servo on every joint of the skeleton it sets', async () => {
    const { ctx, inserted, projects } = fakeContext();
    const reply = await sizeArmRequest({ targets: DESK, payload_g: 200 }, ctx);
    const joints = projects.at(-1)?.skeleton?.joints ?? [];

    expect(joints).toHaveLength(4);
    expect(inserted.filter((p) => p.kind === 'component' && p.componentId)).toHaveLength(4);
    expect(reply.text).toContain('Reach error: target 1');
  });

  it('names an out-of-reach target and places nothing', async () => {
    const { ctx, inserted, projects } = fakeContext();
    const reply = await sizeArmRequest({ targets: [DESK[0], [0, -2000, 100]], payload_g: 200 }, ctx);

    expect(reply.text).toMatch(/^Target 2 \[0, -2000, 100\] is out of reach/);
    expect(inserted).toEqual([]);
    expect(projects).toEqual([]);
  });
});
