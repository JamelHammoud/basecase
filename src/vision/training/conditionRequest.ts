import { evaluationWorker } from './evaluationWorker';
import { loadDatasetContent } from '../../datasets/datasetStore/content';
import { errorMessage } from '../../utils/errorMessage';
import type { ConditionGroupInput } from './conditionGroupJob';
import type { evaluateImageGroup, ImageGroup } from './conditionEvaluation';
import type { TrainingEvaluation } from './types';
import { inspectionContextKey } from './inspectionContext';

export type ConditionComparison = Awaited<ReturnType<typeof evaluateImageGroup>>;
export interface ConditionCompletion {
  result?: ConditionComparison;
  problem?: string;
}

interface Ports {
  run: (input: ConditionGroupInput, transfer: Transferable[]) => Promise<ConditionComparison>;
  load: typeof loadDatasetContent;
}

const defaults: Ports = {
  run: (input, transfer) =>
    evaluationWorker.call(
      'inspectionGroup',
      {
        context: inspectionContextKey(input),
        group: input.group,
        port: input.port,
      },
      transfer,
    ),
  load: loadDatasetContent,
};

export function requestConditionComparison(
  input: { candidate: TrainingEvaluation; incumbent: TrainingEvaluation; group: ImageGroup },
  publish: (completion: ConditionCompletion) => void,
  ports: Ports = defaults,
) {
  let live = true;
  const channel = new MessageChannel();

  channel.port1.onmessage = async ({ data }: MessageEvent<{ content: string }>) => {
    try {
      const bytes = await ports.load(data.content);

      if (live) channel.port1.postMessage({ bytes }, bytes ? [bytes.buffer] : []);
    } catch (error) {
      if (live) channel.port1.postMessage({ error: errorMessage(error) });
    }
  };

  void ports
    .run({ ...input, port: channel.port2 }, [channel.port2])
    .then((result) => {
      if (live) publish({ result });
    })
    .catch((error: unknown) => {
      if (live) publish({ problem: errorMessage(error) });
    });

  return () => {
    live = false;
    channel.port1.postMessage({ cancel: true });
    channel.port1.close();
  };
}
