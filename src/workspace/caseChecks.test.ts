import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseCheckJob } from '../cases/caseCheckJob';
import { caseCheckPool } from '../cases/caseChecksClient';
import { caseTemplates } from '../cases/templates';
import { CASE_STOPPED, caseFindings } from '../readiness/caseChecks';
import { readinessOf } from '../readiness/readiness';
import { ruleFinding } from '../readiness/wording';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { caseCheckRows, nextCaseTurn } from './caseChecks';

vi.mock('../cases/caseChecksClient', () => ({
  caseCheckPool: { size: 2, run: vi.fn(), keepOnly: vi.fn() },
}));

const run = vi.mocked(caseCheckPool.run);
const keepOnly = vi.mocked(caseCheckPool.keepOnly);

function sceneWith(robotId: string, templateId: string) {
  const robot = fixtureRobots().find((r) => r.id === robotId)!;
  const kase = caseTemplates(buildRig(robot.joints, robot.parts), robot.parts)
    .find((t) => t.id === templateId)!
    .build();
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

    expect(row).toMatchObject({ check: 'Reach the Flag', status: 'fail', detail: '' });
    expect(row.items).toEqual([{ text: CASE_STOPPED, status: 'fail' }]);
    expect(readiness.status).toBe('ready');
    expect(readiness.blockers).toEqual([]);
    expect(readiness.notes.map((f) => f.key)).toEqual(expect.arrayContaining([wall.key, 'design:case:reach-the-flag']));
  });

  it('turn every Case into a red note when the robot’s model can’t be built', async () => {
    run.mockRejectedValue(new Error('The Case checks stopped.'));

    const rows = await caseCheckRows({ ...sceneWith('arm-3dof', 'touch-the-dots'), turn: nextCaseTurn() });

    expect(rows).toEqual([expect.objectContaining({ check: 'Touch the Dots', status: 'fail' })]);
  });

  it('leave queued runs alone when a newer check has started', async () => {
    run.mockResolvedValue(modelReply);

    const turn = nextCaseTurn();

    nextCaseTurn();

    const rows = await caseCheckRows({ ...sceneWith('rover-four', 'reach-the-flag'), turn });

    expect(keepOnly).not.toHaveBeenCalled();
    expect(rows[0].items?.[0]?.text).toBe(CASE_STOPPED);
  });
});
