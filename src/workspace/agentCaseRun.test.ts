import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseCheckJob } from '../cases/caseCheckJob';
import { caseCheckPool } from '../cases/caseChecksClient';
import type { FilmShot } from '../cases/filmstrip';
import { presetCase } from '../cases/testing';
import type { PresetId } from '../cases/caseBuilder';
import type { Case } from '../cases/schema';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { runCase } from './agentCaseRun';
import { caseCheckRows, nextCaseTurn } from './caseChecks';

vi.mock('../cases/caseChecksClient', () => ({
  caseCheckPool: { size: 2, run: vi.fn(), keepOnly: vi.fn() },
}));

vi.mock('../cases/filmImage', () => ({ filmImage: vi.fn(async () => 'data:image/png;base64,AAAA') }));

vi.mock('../utils/platformBridge', () => ({ platformBridge: { getSkill: vi.fn() } }));

const run = vi.mocked(caseCheckPool.run);
const film = { boxes: [] } as unknown as FilmShot;
const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

function scene(robotId: string, kase: Case) {
  const robot = fixture(robotId);
  const project = { joints: robot.joints, cases: [kase] } as unknown as ProjectSettings;
  const viewport = { measureParts: async () => ({}), partTriangles: () => null } as unknown as Viewport3DHandle;

  return {
    parts: () => robot.parts,
    project: () => project,
    viewport: () => viewport,
    cases: { active: null },
    setAction: vi.fn(),
  };
}

const presetOn = (robotId: string, id: PresetId) => presetCase(fixture(robotId), id);

function answer(modelHash: string, outcome: (seed: number) => { passed: boolean; margin: number; failed: string[] }) {
  run.mockImplementation(async (_index, job: CaseCheckJob) => {
    if (job.type === 'model') return { type: 'model', modelHash, walk: null, stop: null } as never;

    if (job.type === 'replay') return { type: 'replay', film } as never;

    if (job.type !== 'runs') throw new Error(`No ${job.type} job here.`);

    return { type: 'runs', result: { outcomes: job.seeds.map((seed) => ({ seed, ...outcome(seed) })) } } as never;
  });
}

const jobsOf = (type: CaseCheckJob['type']) => run.mock.calls.filter(([, job]) => job.type === type);

describe('run_case', () => {
  beforeEach(() => {
    run.mockReset();
  });

  it('reports a passing Case with its count, margin and the worst run’s filmstrip', async () => {
    answer('passing', (seed) => ({ passed: true, margin: seed / 100, failed: [] }));

    const reply = await runCase({ id: 'Reach a Spot' }, scene('rover-diff', presetOn('rover-diff', 'reach-the-flag')));

    expect(reply).toMatchObject({
      data: { id: 'reach-a-spot', runs: 20, passes: 20, status: 'pass', refusal: null, cached: false, failures: [] },
      images: [{ dataUrl: 'data:image/png;base64,AAAA' }],
    });
    expect('text' in reply && reply.text).toContain('passed 20 of 20 randomized runs');
    expect('text' in reply && reply.text).toContain('It passes.');
    expect(jobsOf('replay')[0][1]).toMatchObject({ type: 'replay', seed: 1 });
  });

  it('names the failures most runs share and asks for a design change when it fails', async () => {
    answer('failing', (seed) => ({ passed: seed > 15, margin: seed > 15 ? 0.1 : -seed / 10, failed: ['fell'] }));

    const reply = await runCase({ runs: 20 }, scene('rover-four', presetOn('rover-four', 'reach-the-flag')));

    expect(reply).toMatchObject({ data: { passes: 5, status: 'fail', failures: [{ label: 'fell', runs: 15 }] } });
    expect('text' in reply && reply.text).toContain('Failed most: fell (15 of 20 runs).');
    expect('text' in reply && reply.text).toContain('It needs 18 of 20.');
    expect(jobsOf('replay')[0][1]).toMatchObject({ seed: 15 });
  });

  it('names each failing seed with the frame its first failure fired at', async () => {
    run.mockImplementation(async (_index, job: CaseCheckJob) => {
      if (job.type === 'model') return { type: 'model', modelHash: 'trips', walk: null, stop: null } as never;

      if (job.type === 'replay') return { type: 'replay', film } as never;

      if (job.type !== 'runs') throw new Error(`No ${job.type} job here.`);

      const outcomes = job.seeds.map((seed) => {
        const passed = ![4, 9, 12].includes(seed);
        const trip = seed === 12 || passed ? null : { label: 'fell', frame: seed * 10 };

        return {
          seed,
          passed,
          margin: passed ? 0.2 : -0.3,
          failed: trip ? ['fell'] : [],
          path: new Float32Array(3),
          trip,
        };
      });

      return { type: 'runs', result: { outcomes } } as never;
    });

    const reply = await runCase({}, scene('quad-servo', presetOn('quad-servo', 'reach-the-flag')));

    expect(reply).toMatchObject({
      data: {
        passes: 17,
        failedRuns: [
          { seed: 4, trip: { label: 'fell', frame: 40 } },
          { seed: 9, trip: { label: 'fell', frame: 90 } },
          { seed: 12, trip: null },
        ],
      },
    });
    expect('text' in reply && reply.text).toContain(
      'Each failed run first failed at: seed 4 (fell at frame 40, 0.8 s), seed 9 (fell at frame 90, 1.8 s), seed 12 (missed).',
    );
  });

  it('says why the robot can’t enter a refused Case, without runs or a filmstrip', async () => {
    run.mockImplementation(async (_index, job: CaseCheckJob) =>
      job.type === 'model'
        ? ({ type: 'model', modelHash: 'refused', walk: null, stop: null } as never)
        : ({ type: 'runs', result: { refusal: 'This Case needs wheels or legs.', misfit: true } } as never),
    );

    const reply = await runCase({}, scene('arm-3dof', presetOn('rover-diff', 'reach-the-flag')));

    expect(reply).toMatchObject({
      data: { status: 'fail', passes: 0, refusal: 'This Case needs wheels or legs.' },
      images: [],
    });
    expect('text' in reply && reply.text).toContain('the robot can’t enter it. This Case needs wheels or legs.');
    expect(jobsOf('replay')).toEqual([]);
  });

  it('reuses the Checks row’s result while the robot and the Case are unchanged', async () => {
    const kase = presetOn('hexapod', 'reach-the-flag');
    const room = scene('hexapod', kase);

    answer('cached', () => ({ passed: true, margin: 0.2, failed: [] }));
    await caseCheckRows({
      parts: room.parts(),
      project: room.project(),
      measures: {},
      partTriangles: () => null,
      turn: nextCaseTurn(),
    });

    const ran = jobsOf('runs').length;
    const reply = await runCase({ id: kase.id }, room);

    expect(reply).toMatchObject({ data: { cached: true, passes: 20 } });
    expect('text' in reply && reply.text).toContain('Same result as its Checks row');
    expect(jobsOf('runs')).toHaveLength(ran);
    expect(jobsOf('model')).toHaveLength(1);
  });

  it('runs again when asked for a different number of runs', async () => {
    const kase = presetOn('hexapod', 'reach-the-flag');

    answer('cached', () => ({ passed: true, margin: 0.2, failed: [] }));

    const reply = await runCase({ id: kase.id, runs: 6 }, scene('hexapod', kase));

    expect(reply).toMatchObject({ data: { cached: false, runs: 6, passes: 6 } });
  });

  it('says the runs stopped when a newer check replaced them', async () => {
    run.mockRejectedValue(new Error('A newer check replaced this one.'));

    const reply = await runCase({}, scene('biped-servo', presetOn('rover-diff', 'reach-the-flag')));

    expect(reply).toEqual({ ok: false, problem: 'The runs stopped: A newer check replaced this one. Run it again.' });
  });

  it('refuses a Case the scene doesn’t have, naming the ones it does', async () => {
    const reply = await runCase(
      { id: 'Push the Crate' },
      scene('rover-diff', presetOn('rover-diff', 'reach-the-flag')),
    );

    expect(reply).toEqual({
      ok: false,
      problem: 'No Case Push the Crate in this scene. Its Cases: Reach a Spot (reach-a-spot).',
    });
    expect(run).not.toHaveBeenCalled();
  });
});
