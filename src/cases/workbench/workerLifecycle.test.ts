import { mkdirSync, writeFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import {
  buildClassroomWorkers,
  classroomWorkerMemory,
  NodePipelineWorker,
  settleClassroomWorkers,
} from '../../classroom/nodeWorkers.fixtures';
import { CaseCheckPool } from '../caseChecksClient';
import { WorkbenchSession } from './session';
import { workbenchTask } from './tasks.fixtures';
import { wireRobot } from '../../workspace/caseChecks';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { retainPlacement } from './retention';

beforeAll(buildClassroomWorkers);

it('terminates a warmed native Case worker without replacing prior placement evidence', async () => {
  const fixture = workbenchTask(2);
  const robot = wireRobot({ ...fixture.robot, project: { ...DEFAULT_PROJECT, joints: fixture.robot.joints } });
  const workers: NodePipelineWorker[] = [];
  const pool = new CaseCheckPool(() => {
    const worker = new NodePipelineWorker('cases');

    workers.push(worker);

    return worker;
  });
  const job = { type: 'workbench' as const, unit: 'bench-arm', robot, kase: fixture.kase, pose: fixture.pose };
  const session = new WorkbenchSession(() => pool);

  try {
    const warm = await pool.run(0, job);

    expect(warm.result.rehearsal.passed).toBe(true);

    const previous = retainPlacement(warm.result.identity, warm.result.rehearsal);
    let retained = previous;
    const running = session.run(
      async () => ({ ...job, kase: { ...job.kase, task: { ...job.kase.task, seconds: 600 } } }),
      async (result) => {
        retained = retainPlacement(result.identity, result.rehearsal);
      },
    );

    await Promise.resolve();
    expect(workers[0].jobs.at(-1)?.type).toBe('workbench');

    const started = performance.now();

    session.cancel();
    await expect(running).rejects.toThrow('Canceled');
    await settleClassroomWorkers();

    const cancellationAckMs = performance.now() - started;

    expect(retained).toBe(previous);
    expect(workers.every((worker) => worker.terminated)).toBe(true);
    expect(classroomWorkerMemory().activeWorkers).toBe(0);
    mkdirSync('scratch', { recursive: true });
    writeFileSync(
      'scratch/workbench-cancellation.json',
      JSON.stringify(
        {
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          cancellationAckMs,
          activeWorkers: classroomWorkerMemory().activeWorkers,
        },
        null,
        2,
      ),
    );
  } finally {
    session.cancel();
    pool.dispose();
    await settleClassroomWorkers();
  }
});
