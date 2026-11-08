import { describe, expect, it } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { poseCheck, scopeOf, type PoseContext, type Scope } from './agentPoseShared';

const part = (id: string, y: number): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

interface Reading {
  floor: number;
  clashes?: Array<{ a: string; b: string; depthMm: number; fraction: number }>;
  atRest?: Array<[string, number]>;
}

function checked(name: string, reading: Reading, limb?: RobotJoint['limb']) {
  const parts = [part('base', 200), part('link', 100), ...(reading.clashes ?? []).map((c) => part(c.b, 300))];
  const joint: RobotJoint = {
    id: 'j',
    name,
    type: 'revolute',
    parent: ['base', ...(reading.clashes ?? []).map((c) => c.b)],
    child: ['link'],
    origin: [0, 150, 0],
    axis: [1, 0, 0],
    limb,
  };
  const viewport = {
    setPose: () => {},
    posedInterference: async () => reading.clashes ?? [],
    posedFloor: async () => reading.floor,
  } as unknown as Viewport3DHandle;
  const ctx: PoseContext = {
    parts,
    project: { ...DEFAULT_PROJECT, joints: [joint] },
    viewport,
    setPose: () => {},
    savePose: () => {},
    addAnimation: (a) => a,
    play: () => {},
    selectedIds: [],
  };

  return poseCheck(ctx, scopeOf(ctx) as Scope, { values: {} }, Promise.resolve(new Map(reading.atRest ?? [])));
}

const HOVERING = { floor: 100 };
const HOVER_LINE = 'Lowest point 100 mm above the floor';

describe('poseCheck', () => {
  it('sees a hovering robot whatever its leg joints are called', async () => {
    for (const name of ['left_knee', 'FL_calf_joint', 'LF_KFE', 'hip_pitch', 'thigh_l']) {
      expect(await checked(name, HOVERING)).toEqual([HOVER_LINE]);
    }
  });

  it('trusts the limb a joint declares', async () => {
    expect(await checked('j1', HOVERING, 'leg')).toEqual([HOVER_LINE]);
    expect(await checked('left_knee', HOVERING, 'arm')).toEqual([]);
  });

  it('leaves an arm on a raised stand alone', async () => {
    expect(await checked('elbow', HOVERING)).toEqual([]);
  });

  it('says how many clashes it left off the list', async () => {
    const clashes = Array.from({ length: 9 }, (_, i) => ({ a: 'link', b: `wall${i}`, depthMm: 5, fraction: 0.2 }));
    const lines = await checked('elbow', { floor: 0, clashes });

    expect(lines).toHaveLength(7);
    expect(lines.at(-1)).toBe('…and 3 more clashes');
  });

  it('reports a pair that overlaps at rest only once the pose drives it deeper', async () => {
    const atDepth = (depthMm: number) =>
      checked('elbow', {
        floor: 0,
        clashes: [{ a: 'link', b: 'wall', depthMm, fraction: 0.2 }],
        atRest: [['link|wall', 2]],
      });

    expect(await atDepth(3)).toEqual([]);
    expect(await atDepth(20)).toEqual(['link passes 20 mm into wall']);
  });

  it('adds no line when all the clashes fit', async () => {
    const clashes = Array.from({ length: 6 }, (_, i) => ({ a: 'link', b: `wall${i}`, depthMm: 5, fraction: 0.2 }));

    expect(await checked('elbow', { floor: 0, clashes })).toHaveLength(6);
  });
});
