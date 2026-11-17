import { describe, expect, it, vi } from 'vitest';
import { metricReport } from './metricsFixtures';
import { conditionGroupJob } from './conditionGroupJob';
import { requestConditionComparison, type ConditionComparison } from './conditionRequest';
import { CONDITION_WORKFLOWS, conditionWorkflowFixture } from './conditionWorkflowFixtures';
import { evaluateTraining } from './metrics';
import { metricResult } from './metricsFixtures';
import { evaluationJobs } from './evaluationJobs';
import { inspectionContextKey } from './inspectionContext';

describe('condition request ownership', () => {
  it('loads frozen bytes through the presentation port and uses the shared scorer', async () => {
    const { prepared, fixture } = await conditionWorkflowFixture(CONDITION_WORKFLOWS[0]);
    const report = await evaluateTraining({
      task: { kind: 'detect', metric: 'box-map', classes: prepared.classes, limits: {} },
      sets: prepared.sets,
      snapshot: prepared.evaluationSamples,
      realSourceIds: prepared.realSourceIds,
      predictions: prepared.samples
        .filter((sample) => sample.split === 'test')
        .map((sample) => ({
          frameSetId: sample.frameSetId,
          frameId: sample.frameId,
          inferenceMs: 1,
          result: metricResult({ width: 8, height: 8 }),
        })),
      modelHash: 'b'.repeat(64),
      modelBytes: 100,
    });
    const channel = new MessageChannel();
    let reads = 0;

    channel.port1.onmessage = ({ data }: MessageEvent<{ content: string }>) => {
      reads++;
      channel.port1.postMessage({ bytes: fixture.blobs.get(data.content) });
    };

    try {
      const reports = {
        candidate: report,
        incumbent: report,
      };
      const index = await evaluationJobs.inspectionIndex(reports);
      const result = (
        await evaluationJobs.inspectionGroup({
          context: inspectionContextKey(reports),
          group: { kind: 'condition', name: 'night' },
          port: channel.port2,
        })
      ).result;

      expect(index.result.groups.find((group) => group.name === 'night')?.realTest).toBe(1);
      expect(result.support.realTest).toBe(1);
      expect(result.candidate.primary).toBe(1);
      expect(result.incumbent.primary).toBe(1);
      expect(reads).toBe(1);
    } finally {
      channel.port1.close();
      evaluationJobs.releaseInspection(inspectionContextKey({ candidate: report, incumbent: report }));
    }
  });
  it('aborts a worker waiting for image content without scoring or publishing a completion', async () => {
    const report = await metricReport();
    const channel = new MessageChannel();
    const requested = new Promise<void>((resolve) => {
      channel.port1.onmessage = () => {
        channel.port1.postMessage({ cancel: true });
        resolve();
      };
    });
    const job = conditionGroupJob({
      candidate: report,
      incumbent: report,
      group: { kind: 'camera', name: 'camera' },
      port: channel.port2,
    });
    const rejected = expect(job).rejects.toMatchObject({ name: 'AbortError' });

    await requested;
    await rejected;
    channel.port1.close();
  });

  it('revokes pending successes and errors on selection, dataset or scene replacement', async () => {
    const report = await metricReport();
    const input = { candidate: report, incumbent: report, group: { kind: 'camera' as const, name: 'camera' } };
    const publish = vi.fn();
    const workers: MessagePort[] = [];
    let succeed = (_result: ConditionComparison) => {};
    let fail = (_error: Error) => {};
    const old = requestConditionComparison(input, publish, {
      run: (request) => {
        workers.push(request.port);

        return new Promise((resolve) => {
          succeed = resolve;
        });
      },
      load: async () => null,
    });
    const newer = requestConditionComparison(input, publish, {
      run: (request) => {
        workers.push(request.port);

        return new Promise((_resolve, reject) => {
          fail = reject;
        });
      },
      load: async () => null,
    });

    old();
    newer();
    succeed({} as ConditionComparison);
    fail(new Error('obsolete scene'));
    await Promise.resolve();
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    workers.forEach((port) => port.close());
  });
});
