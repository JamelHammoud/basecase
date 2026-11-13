import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseCheckJob } from '../cases/caseCheckJob';
import { caseCheckPool } from '../cases/caseChecksClient';
import { presetCase } from '../cases/testing';
import type { PresetId } from '../cases/caseBuilder';
import { CASE_STOPPED, caseFindings } from '../readiness/caseChecks';
import { readinessOf } from '../readiness/readiness';
import { ruleFinding } from '../readiness/wording';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { caseCheckRows, nextCaseTurn } from './caseChecks';

vi.mock('../cases/caseChecksClient', () => ({
  caseCheckPool: { size: 2, run: vi.fn(), keepOnly: vi.fn() },
}));

vi.mock('../utils/platformBridge', () => ({ platformBridge: { getSkill: vi.fn() } }));

const run = vi.mocked(caseCheckPool.run);
const getSkill = vi.mocked(platformBridge.getSkill);
const keepOnly = vi.mocked(caseCheckPool.keepOnly);

function sceneWith(robotId: string, templateId: PresetId) {
  const robot = fixtureRobots().find((r) => r.id === robotId)!;
  const kase = presetCase(robot, templateId);
  const project = { joints: robot.joints, cases: [kase] } as unknown as ProjectSettings;

  return { parts: robot.parts, project, measures: {}, partTriangles: () => null };
}

const modelReply = { type: 'model', modelHash: 'm', walk: null } as const;

describe('Case rows in Checks', () => {
  beforeEach(() => {
    run.mockReset();
    keepOnly.mockReset();
  });

  it('turn a Case whose runs throw into a red note, leaving every other finding and the verdict alone', async () => {
    run.mockImplementation((_index, job: CaseCheckJob) =>
      job.type === 'model' ? Promise.resolve(modelReply) : Promise.reject(new Error('mj_loadXML failed')),
    );

    const scene = sceneWith('rover-diff', 'reach-the-flag');
    const rows = await caseCheckRows({ ...scene, turn: nextCaseTurn() });
    const [row] = rows;
    const wall = ruleFinding('thin', 'note', { agentText: 'A wall is 0.6 mm thick.', subject: 'wall' });
    const readiness = readinessOf([wall, ...caseFindings(rows)], { parts: scene.parts, fingerprint: 'f', rows });

    expect(row).toMatchObject({ check: 'Reach a Spot', status: 'fail', detail: '' });
    expect(row.items).toEqual([{ text: CASE_STOPPED, status: 'fail' }]);
    expect(readiness.status).toBe('ready');
    expect(readiness.blockers).toEqual([]);
    expect(readiness.notes.map((f) => f.key)).toEqual(expect.arrayContaining([wall.key, 'design:case:reach-a-spot']));
  });

  it('turn every Case into a red note when the robot’s model can’t be built', async () => {
    run.mockRejectedValue(new Error('The Case checks stopped.'));

    const rows = await caseCheckRows({ ...sceneWith('arm-3dof', 'touch-the-dots'), turn: nextCaseTurn() });

    expect(rows).toEqual([expect.objectContaining({ check: 'Touch the Dots', status: 'fail' })]);
  });

  it('leave queued runs alone when a newer check has started, and say the check was replaced', async () => {
    run.mockResolvedValue(modelReply);

    const turn = nextCaseTurn();

    nextCaseTurn();

    const rows = await caseCheckRows({ ...sceneWith('rover-four', 'reach-the-flag'), turn });
    const [note] = caseFindings(rows);

    expect(keepOnly).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('not run');
    expect(note.agentText).toContain('a newer check replaced this one');
  });

  it('give an overtaken check the newest check’s verdict for the same Case', async () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({ seed: i + 1, passed: true, margin: 1, failed: [] }));
    const gate: { open?: () => void } = {};
    const answered = new Promise<void>((resolve) => {
      gate.open = resolve;
    });

    run.mockImplementation((_index, job: CaseCheckJob) =>
      job.type === 'model'
        ? Promise.resolve({ ...modelReply, modelHash: 'shared' })
        : (answered.then(() => ({ type: 'runs', result: { outcomes } })) as never),
    );

    const scene = sceneWith('rover-diff', 'reach-the-flag');
    const older = nextCaseTurn();
    const newest = caseCheckRows({ ...scene, turn: nextCaseTurn() });

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));

    const overtaken = caseCheckRows({ ...scene, turn: older });

    gate.open?.();

    expect((await overtaken)[0]).toMatchObject({ status: 'pass', detail: '20 of 20' });
    expect((await newest)[0]).toMatchObject({ status: 'pass', detail: '20 of 20' });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('ask for the Walk again on the next check when its skill couldn’t be read', async () => {
    const walk = { hash: 'walk', kit: 'velocity-tracking', evidence: { passed: true }, createdAt: '2026-11-13' };
    const scene = sceneWith('hexapod', 'reach-the-flag');
    const project = { ...scene.project, skills: [walk] } as unknown as ProjectSettings;

    run.mockResolvedValue({ ...modelReply, walk: { hash: 'walk', topSpeed: 0.3 } });
    getSkill.mockRejectedValueOnce(new Error('The bridge is down.')).mockResolvedValue(null);

    await caseCheckRows({ ...scene, project, turn: nextCaseTurn() });
    await caseCheckRows({ ...scene, project, turn: nextCaseTurn() });

    expect(getSkill).toHaveBeenCalledTimes(2);
    expect(getSkill).toHaveBeenCalledWith('walk');
  });

  it('send every Walk to the model job and drop queued runs before rebuilding the model', async () => {
    const walks = [
      { hash: 'older', kit: 'velocity-tracking', createdAt: '2026-11-01' },
      { hash: 'newer', kit: 'velocity-tracking', createdAt: '2026-11-12' },
      { hash: 'stand', kit: 'stand', createdAt: '2026-11-12' },
    ];
    const scene = sceneWith('hexapod', 'reach-the-flag');
    const project = { ...scene.project, skills: walks } as unknown as ProjectSettings;

    run.mockResolvedValue(modelReply);

    await caseCheckRows({ ...scene, project, turn: nextCaseTurn() });

    const [, job] = run.mock.calls[0];

    expect(job).toMatchObject({ type: 'model', walks: walks.slice(0, 2) });
    expect(keepOnly.mock.calls[0]).toEqual([new Set()]);
    expect(keepOnly.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0]);
  });
});
