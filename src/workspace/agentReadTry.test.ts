import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedTrack } from '../cases/console/recordedSignals';
import type { Case } from '../cases/schema';
import { presetCase } from '../cases/testing';
import type { TryRecord } from '../cases/tries';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { readTry, type LiveScene, type ReadTryContext } from './agentReadTry';

vi.mock('../cases/tryStore', () => ({ loadRecording: vi.fn(async (id: string) => (id === 'lost' ? undefined : {})) }));

vi.mock('../cases/console/consoleTrack', () => ({ consoleTrack: vi.fn(async () => track) }));

const DT = 0.02;
const FRAMES = 251;
const clamp = (frame: number) => Math.max(0, Math.min(FRAMES - 1, Math.round(frame)));
const track: RecordedTrack = {
  frames: FRAMES,
  dt: DT,
  ids: ['robot.tilt', 'robot.height'],
  time: (frame) => clamp(frame) * DT,
  frameAt: (seconds) => clamp(seconds / DT),
  values: () => new Map(),
  series: () => ({ t: [], v: [] }),
  column: (id) => Float64Array.from({ length: FRAMES }, (_, n) => (id === 'robot.tilt' ? n / 2 : 0.1)),
  goalAt: () => null,
};

const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
const reach = presetCase(robot, 'reach-the-flag');
const other: Case = { ...reach, id: 'other-case', name: 'Other Case' };

const record = (id: string, caseId: string, at: string, extra: Partial<TryRecord> = {}) =>
  ({ id, caseId, at, robot: robot.id, passed: false, margin: -0.12345, seconds: 5, ...extra }) as TryRecord;

const TRIES = [
  record('old', reach.id, '2026-11-01T00:00:00.000Z'),
  record('new', reach.id, '2026-11-02T00:00:00.000Z'),
  record('real', reach.id, '2026-11-03T00:00:00.000Z', { real: true }),
  record('elsewhere', other.id, '2026-11-01T00:00:00.000Z'),
  record('lost', reach.id, '2026-10-01T00:00:00.000Z'),
];

function scene(active: Case | null) {
  const state = { active, opened: null as TryRecord | null, sought: null as { frame: number } | null };
  const shot = vi.fn(async (views: string[]) => views.map((view) => ({ view, dataUrl: 'data:image/jpeg;base64,AA' })));
  const timeline = {
    show: vi.fn(async (r: TryRecord) => {
      state.opened = r;
    }),
    seek: vi.fn((frame: number) => {
      state.sought = { frame };
    }),
    get record() {
      return state.opened;
    },
    get recording() {
      return state.opened && {};
    },
    efforts: null,
    trips: [{ label: 'fell', frame: 120 }],
  };
  const live = () =>
    ({
      cases: { active: state.active, timeline },
      sim: { modelNow: () => ({}), sought: () => state.sought },
      rig: buildRig(robot.joints, robot.parts),
    }) as unknown as LiveScene;
  const ctx: ReadTryContext = {
    cases: { active, open: (id) => (state.active = [reach, other].find((c) => c.id === id) ?? null) },
    live,
    parts: () => robot.parts,
    project: () => ({ cases: [reach, other], tries: TRIES }) as unknown as ProjectSettings,
    viewport: () => ({ captureViews: shot }) as unknown as Viewport3DHandle,
    setAction: vi.fn(),
  };

  return { ctx, state, timeline, shot };
}

const replyOf = (reply: unknown) => JSON.parse((reply as { text: string }).text);

describe('read_try', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the open Case’s newest simulated try and captures the canvas at its first failure', async () => {
    const { ctx, timeline, shot } = scene(reach);
    const reply = await readTry({ signals: ['robot.tilt'], to: 1, every: 0.5 }, ctx);

    expect(timeline.show).toHaveBeenCalledWith(TRIES[1]);
    expect(timeline.seek).toHaveBeenCalledWith(120);
    expect(shot).toHaveBeenCalledWith(['iso'], undefined, { maxSide: 1024 });
    expect(replyOf(reply)).toEqual({
      ok: true,
      try: { id: 'new', case: reach.name, passed: false, margin: -0.123, seconds: 5 },
      window: { from: 0, to: 1, every: 0.5 },
      samples: { time: [0, 0.5, 1], 'robot.tilt': [0, 12.5, 25] },
      failures: [{ label: 'fell', time: 2.4 }],
      capture: 2.4,
    });
    expect(reply).toMatchObject({ images: [{ view: 'iso at 2.4 s' }] });
  });

  it('captures at the asked time and view', async () => {
    const { ctx, timeline, shot } = scene(reach);

    await readTry({ id: 'old', at: 3, view: 'side' }, ctx);

    expect(timeline.seek).toHaveBeenCalledWith(150);
    expect(shot).toHaveBeenCalledWith(['side'], undefined, { maxSide: 1024 });
  });

  it('opens the try’s Case first when another is open', async () => {
    const { ctx, state, timeline } = scene(reach);
    const reply = await readTry({ id: 'elsewhere' }, ctx);

    expect(state.active?.id).toBe(other.id);
    expect(timeline.show).toHaveBeenCalledWith(TRIES[3]);
    expect(replyOf(reply).try).toMatchObject({ id: 'elsewhere', case: 'Other Case' });
  });

  it('names the open Case’s tries when the id is unknown, and refuses real tries and lost recordings', async () => {
    const { ctx, timeline } = scene(reach);

    expect(await readTry({ id: 'nope' }, ctx)).toEqual({
      ok: false,
      problem: `No try nope in this scene. Tries of ${reach.name}: real, new, old, lost.`,
    });
    expect(await readTry({ id: 'real' }, ctx)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/real robot/),
    });
    expect(await readTry({ id: 'lost' }, ctx)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/No recording/),
    });
    expect(await readTry({}, scene(null).ctx)).toMatchObject({ ok: false });
    expect(timeline.show).not.toHaveBeenCalled();
  });
});
