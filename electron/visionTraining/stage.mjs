import { Worker } from 'node:worker_threads';

export function stageImages(options, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(new Error('Training stopped'));

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./stageWorker.mjs', import.meta.url), { workerData: options });
    let replied = false;
    const abort = () => {
      replied = true;
      worker.terminate().then(() => reject(new Error('Training stopped')), reject);
    };

    signal?.addEventListener('abort', abort, { once: true });

    worker.once('message', (reply) => {
      replied = true;

      if (reply.error) reject(new Error(reply.error));
      else resolve(reply);
    });
    worker.once('error', reject);
    worker.once('exit', () => {
      signal?.removeEventListener('abort', abort);

      if (!replied) reject(new Error('The image staging worker stopped. Start training again.'));
    });
  });
}
