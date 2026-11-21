import { mkdirSync, writeFileSync } from 'node:fs';
import loadMujoco from '@mujoco/mujoco';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  buildClassroomWorkers,
  NodePipelineWorker,
  classroomWorkerMemory,
  settleClassroomWorkers,
} from '../classroom/nodeWorkers.fixtures';
import { bodyClient, bodyAnalysisMetrics } from './bodyClient';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { parkedBodyRun } from './bodyMotion.fixtures';
import * as robotStore from '../robot/robotStore';

beforeAll(buildClassroomWorkers);
afterEach(() => vi.unstubAllGlobals());

it('runs isolated selection on the production worker and acknowledges termination without commands', async () => {
  const workers: NodePipelineWorker[] = [];

  vi.stubGlobal(
    'Worker',
    class extends NodePipelineWorker {
      constructor(url: URL) {
        super(url);
        workers.push(this);
      }
    },
  );
  vi.stubGlobal('window', {});

  const commands = vi.spyOn(robotStore, 'sendRobotCommand');
  const { request } = await bodyAnalysisScenario(await loadMujoco(), 'two-link masses');

  request.run = parkedBodyRun(request.model);

  const original = structuredClone(request);
  const client = bodyClient();

  try {
    const result = await client.analyze(request);

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const input = { request, result, selected: [0] };
    const motion = await client.recommend(input);

    expect(motion.kind).toBe('recommended');
    expect(request).toEqual(original);
    expect(commands).not.toHaveBeenCalled();

    const memory = classroomWorkerMemory();
    const running = client.recommend(input);
    const cancellation = performance.now();

    client.dispose();
    await expect(running).rejects.toThrow();
    await settleClassroomWorkers();

    const cancellationAckMs = performance.now() - cancellation;

    expect(workers.every((worker) => worker.terminated)).toBe(true);
    expect(classroomWorkerMemory().activeWorkers).toBe(0);
    expect(commands).not.toHaveBeenCalled();
    mkdirSync('scratch', { recursive: true });
    writeFileSync(
      'scratch/body-motion-worker-measurements.json',
      JSON.stringify(
        {
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          ...bodyAnalysisMetrics(),
          memory,
          cancellationAckMs,
          previewBytes: JSON.stringify(motion).length,
        },
        null,
        2,
      ),
    );
  } finally {
    client.dispose();
    commands.mockRestore();
    await settleClassroomWorkers();
  }
});
