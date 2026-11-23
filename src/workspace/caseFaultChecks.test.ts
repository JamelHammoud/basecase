import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseCheckJob } from '../cases/caseCheckJob';
import { caseCheckPool } from '../cases/caseChecksClient';
import { withFault, type CaseFault } from '../cases/caseFaults';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import type { Case } from '../cases/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { caseCheckRows, caseFaultVerdict, forgetCaseModels, nextCaseTurn } from './caseChecks';

vi.mock('../cases/caseChecksClient', () => ({
  caseCheckPool: { size: 2, run: vi.fn(), keepOnly: vi.fn() },
}));

vi.mock('../utils/platformBridge', () => ({ platformBridge: { getSkill: vi.fn() } }));

const run = vi.mocked(caseCheckPool.run);
const keepOnly = vi.mocked(caseCheckPool.keepOnly);

const KNEE: CaseFault = { joint: 'leg0_bend', kind: 'limp' };
const HIP: CaseFault = { joint: 'leg1_swing', kind: 'weak' };

const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;

function walkCase(): Case {
  const made = buildCase(
    { goal: 'walk', world: 'floor' },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

const sceneOf = (kase: Case) => ({
  parts: robot.parts,
  project: { joints: robot.joints, cases: [kase] } as unknown as ProjectSettings,
  measures: {},
  partTriangles: () => null,
});

const outcomes = (passed: boolean) =>
  Array.from({ length: 10 }, (_, i) => ({
    seed: i + 1,
    passed,
    margin: passed ? 1 : -1,
    failed: [],
    path: new Float32Array(),
  }));

function answer(survives: (fault: CaseFault | undefined) => boolean) {
  run.mockImplementation(((_index: number, job: CaseCheckJob) => {
    if (job.type === 'model') return Promise.resolve({ type: 'model', modelHash: 'm', walk: null, stop: null });

    const fault = job.type === 'runs' ? job.fault : undefined;

    return Promise.resolve({ type: 'runs', result: { outcomes: outcomes(survives(fault)) } });
  }) as never);
}

const runJobs = () => run.mock.calls.flatMap(([, job]) => (job.type === 'runs' ? [job] : []));

beforeEach(() => {
  run.mockReset();
  keepOnly.mockReset();
  forgetCaseModels();
});

describe('Case fault rows in Checks', () => {
  it('give each fault entry its own row under the Case’s row, judged across the same 20 seeds', async () => {
    answer((fault) => fault?.kind !== 'limp');

    const kase = withFault(withFault(walkCase(), KNEE), HIP);
    const [row] = await caseCheckRows({ ...sceneOf(kase), turn: nextCaseTurn() });

    expect(row).toMatchObject({ status: 'pass', detail: '20 of 20' });
    expect(row.faults).toEqual([
      expect.objectContaining({ joint: 'leg0_bend', kind: 'limp', status: 'fail', detail: '0 of 20' }),
      expect.objectContaining({ joint: 'leg1_swing', kind: 'weak', status: 'pass', detail: '20 of 20' }),
    ]);
    expect(row.faults![0].label).toMatch(/^Limp /);

    const seeds = (fault?: CaseFault) =>
      runJobs()
        .filter((job) => job.fault?.joint === fault?.joint)
        .flatMap((job) => job.seeds)
        .sort((a, b) => a - b);

    expect(seeds(undefined)).toEqual(seeds(KNEE));
    expect(seeds(undefined)).toHaveLength(20);
    expect(keepOnly.mock.lastCall![0].size).toBe(3);
  });

  it('leave a Case without a list with the row and the jobs it has today', async () => {
    answer(() => true);

    const [row] = await caseCheckRows({ ...sceneOf(walkCase()), turn: nextCaseTurn() });

    expect(row).not.toHaveProperty('faults');
    expect(runJobs().every((job) => !('fault' in job))).toBe(true);
  });

  it('keep a verdict until the list changes, then judge only the entry that changed', async () => {
    answer(() => true);

    const first = withFault(walkCase(), KNEE);
    const scene = sceneOf(first);

    await caseCheckRows({ ...scene, turn: nextCaseTurn() });

    const before = runJobs().length;

    await caseCheckRows({ ...scene, turn: nextCaseTurn() });
    expect(runJobs()).toHaveLength(before);

    const edited = { ...first, faults: [{ joint: 'leg0_bend', kind: 'weak' as const }] };

    await caseCheckRows({ ...sceneOf(edited), turn: nextCaseTurn() });

    const added = runJobs().slice(before);

    expect(added.length).toBeGreaterThan(0);
    expect(added.every((job) => job.fault?.kind === 'weak')).toBe(true);
  });

  it('say a fault’s joint is gone when the robot lost it, and run nothing for it', async () => {
    run.mockImplementation(((_i: number, job: CaseCheckJob) =>
      Promise.resolve(
        job.type === 'model'
          ? { type: 'model', modelHash: 'm', walk: null, stop: null }
          : {
              type: 'runs',
              result:
                job.type === 'runs' && job.fault
                  ? { refusal: 'ghost isn’t a servo on this robot.', misfit: false }
                  : { outcomes: outcomes(true) },
            },
      )) as never);

    const kase = withFault(walkCase(), { joint: 'ghost', kind: 'limp' });
    const [row] = await caseCheckRows({ ...sceneOf(kase), turn: nextCaseTurn() });

    expect(row.status).toBe('pass');
    expect(row.faults).toEqual([
      expect.objectContaining({
        joint: 'ghost',
        status: 'fail',
        detail: '',
        refusal: 'ghost isn’t a servo on this robot.',
      }),
    ]);
  });

  it('send a fault’s replay and filmstrip jobs with the fault, so the seed opens broken', async () => {
    answer(() => false);
    run.mockImplementationOnce(
      () => Promise.resolve({ type: 'model', modelHash: 'm', walk: null, stop: null }) as never,
    );

    const kase = withFault(walkCase(), KNEE);
    const verdict = await caseFaultVerdict(sceneOf(kase), kase, KNEE);

    await verdict.record(3).catch(() => null);
    await verdict.film(3).catch(() => null);

    const sent = run.mock.calls.map(([, job]) => job).filter((job) => job.type === 'record' || job.type === 'replay');

    expect(sent.map((job) => job.type)).toEqual(['record', 'replay']);
    expect(sent.every((job) => 'fault' in job && job.fault?.joint === 'leg0_bend')).toBe(true);
  });
});
