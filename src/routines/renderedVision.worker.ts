import { errorMessage } from '../utils/errorMessage';
import type { RenderedVisionRequest, RenderedVisionResponse } from './renderedVisionProtocol';
import { runRenderedVisionJob } from './renderedVisionRun';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: RenderedVisionResponse) => scope.postMessage(message);

scope.onmessage = async ({ data }: MessageEvent<RenderedVisionRequest>) => {
  try {
    post({ type: 'result', result: await runRenderedVisionJob(data, () => post({ type: 'progress' })) });
  } catch (error) {
    post({ type: 'error', error: errorMessage(error) });
  }
};
