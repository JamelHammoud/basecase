import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import loadMujoco from '@mujoco/mujoco';
import {
  buildClassroomWorkers,
  NodePipelineWorker,
  classroomWorkerMemory,
  settleClassroomWorkers,
} from '../classroom/nodeWorkers.fixtures';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { parkedBodyRun } from './bodyMotion.fixtures';
import { bodyClient } from './bodyClient';
import { BODY_SEQUENCE_LIMITS } from './bodySequenceTypes';
import * as robotStore from '../robot/robotStore';
import { mkdirSync, writeFileSync } from 'node:fs';

beforeAll(buildClassroomWorkers);
afterEach(() => vi.unstubAllGlobals());

it('runs the sequence through the production worker and leaves completed evidence intact after worker termination', async () => {
  vi.stubGlobal('Worker', NodePipelineWorker);
  vi.stubGlobal('window', {});

  const commands = vi.spyOn(robotStore, 'sendRobotCommand');
  const { request } = await bodyAnalysisScenario(await loadMujoco(), 'two-link masses');

  request.run = parkedBodyRun(request.model);

  const client = bodyClient();

  try {
    const result = await client.analyze(request);

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const started = performance.now();
    const sequence = await client.prepareSequence({ request, result, selected: [0], limits: BODY_SEQUENCE_LIMITS });
    const preparationMs = performance.now() - started;
    const roundStarted = performance.now();
    const completed = await client.advanceSequence({ request, sequence });
    const roundMs = performance.now() - roundStarted;
    const retained = structuredClone(completed);
    const memory = classroomWorkerMemory();
    const pending = client.advanceSequence({ request, sequence });
    const cancellation = performance.now();

    client.dispose();
    await expect(pending).rejects.toThrow();
    await settleClassroomWorkers();
    expect(completed.rounds).toHaveLength(1);
    expect(completed).toEqual(retained);
    expect(classroomWorkerMemory().activeWorkers).toBe(0);
    expect(commands).not.toHaveBeenCalled();
    mkdirSync('scratch', { recursive: true });
    writeFileSync(
      'scratch/body-sequence-worker.json',
      JSON.stringify(
        {
          platform: process.platform,
          node: process.version,
          preparationMs,
          roundMs,
          cancellationAckMs: performance.now() - cancellation,
          physicsSteps: completed.spent.physicsSteps,
          serializedSequenceBytes: new TextEncoder().encode(JSON.stringify(completed)).byteLength,
          memory,
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
