import { humanoid, walkBvh } from '../utils/mocap.fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT, type RobotAnimation, type RobotJoint, type ScenePart } from '../types/robotics';
import { animateRequest, getRig, retargetRequest, setPoseRequest, type PoseContext } from './agentPose';

const part = (id: string, position: [number, number, number], size: number): ScenePart => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size, height: size, depth: size },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

const joint = (id: string, over: Partial<RobotJoint>): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  ...over,
});

function context(log: unknown[]): PoseContext {
  const parts = [part('pelvis', [0, 100, 0], 40), part('thigh', [0, 60, 0], 30), part('shin', [0, 25, 0], 24)];
  const joints = [
    joint('hip', { parent: ['pelvis'], child: ['thigh'], origin: [0, 80, 0], range: [-90, 45], velocity: 30 }),
    joint('knee', { parent: ['thigh'], child: ['shin'], origin: [0, 40, 0], range: [0, 120], axis: [0, 0, 1] }),
    joint('slide', { type: 'prismatic', parent: ['shin'], child: [], origin: [0, 10, 0], axis: [0, 1, 0] }),
  ];

  return {
    parts,
    project: {
      ...DEFAULT_PROJECT,
      joints,
      pose: { values: { hip: 10 } },
      poses: [{ id: 'p1', name: 'Crouch', values: { knee: 60 } }],
      animations: [
        {
          id: 'a1',
          name: 'Wave',
          duration: 2,
          loop: true,
          keyframes: [],
          interpolation: 'smooth',
          source: 'agent',
        },
      ],
    },
    viewport: null,
    setPose: (s) => log.push(['setPose', s]),
    savePose: (name, s) => log.push(['savePose', name, s]),
    addAnimation: (a: RobotAnimation) => {
      log.push(['addAnimation', a]);

      return { ...a, id: 'made' };
    },
    play: (id) => log.push(['play', id]),
    selectedIds: [],
  };
}

describe('getRig', () => {
  it('describes joints, pose, saved poses and animations', async () => {
    expect(getRig(context([])).text).toMatchSnapshot();
    expect(getRig({ ...context([]), project: DEFAULT_PROJECT }).text).toMatch(/^No joints\. Declare/);
  });
});

describe('setPoseRequest', () => {
  it('clamps values, applies saved poses and saves', async () => {
    const log: unknown[] = [];
    const reply = await setPoseRequest(context(log), {
      apply: 'crouch',
      values: { hip: 100, knee: 10, nope: 5 },
      relative: true,
      root: { position: [0, 0, 20], rotation: [0, 0, 15] },
      ik: [{ part: 'shin', move: [0, 0, 10] }, { part: 'thigh' }, { part: 'shin', target: [0, 10, 30] }],
      save_as: 'High',
    });

    expect(reply).toMatchSnapshot();
    expect(log).toMatchSnapshot();
  });

  it('reports unknown saved poses and a return to rest', async () => {
    expect((await setPoseRequest(context([]), { apply: 'missing' })).text).toBe(
      'No saved pose "missing". Saved: Crouch',
    );
    expect((await setPoseRequest(context([]), { from_rest: true })).text).toBe(
      'Modeled pose\nNo new collisions; the robot clears the floor.',
    );
  });
});

describe('animateRequest', () => {
  it('builds keyframed animations and flags fast joints', async () => {
    const log: unknown[] = [];
    const reply = await animateRequest(context(log), {
      name: 'Kick',
      duration: 1,
      keyframes: [
        { t: 0, values: { hip: 0 } },
        { t: 0.5, values: { hip: 40, knee: 90 }, root: { position: [0, 0, 5] } },
        { t: 1, values: { hip: 0 } },
      ],
      loop: true,
      play: false,
    });

    expect(reply).toMatchSnapshot();
    expect(log).toMatchSnapshot();
  });

  it('needs keyframes or feet', async () => {
    expect((await animateRequest(context([]), { name: 'x' })).text).toBe('Give keyframes, or a gait.');
    expect((await animateRequest(context([]), { name: 'x', gait: {} })).text).toMatch(/^Couldn’t find the feet/);
  });
});

describe('retargetRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses oversized downloads before parsing and cancels the response', async () => {
    let cancelled = false;
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          chunks++;
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const log: unknown[] = [];

    vi.stubGlobal('fetch', async () => new Response(body));

    expect((await retargetRequest(context(log), { url: 'https://example.com/huge.bvh' })).text).toContain('8 MB');
    expect(cancelled).toBe(true);
    expect(chunks).toBe(9);
    expect(log).toEqual([]);
  });

  it('downloads a normal BVH through the real parser and retargeter', async () => {
    vi.stubGlobal('fetch', async () => new Response(walkBvh()));

    const robot = humanoid();
    const ctx = context([]);
    const reply = await retargetRequest(
      { ...ctx, parts: robot.parts, project: { ...ctx.project, joints: robot.joints } },
      { url: 'https://example.com/walk.bvh', play: false },
    );

    expect(reply.text).not.toContain('Couldn’t');
    expect(reply.text).toContain('Matched:');
  });

  it('needs BVH text and reports parse errors', async () => {
    expect((await retargetRequest(context([]), {})).text).toBe('Give the BVH as an evidence path or a URL.');
    expect((await retargetRequest(context([]), { text: 'not a bvh' })).text).toMatch(/^Couldn’t read the BVH/);
  });
});
