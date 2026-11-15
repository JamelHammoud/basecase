import { Worker } from 'node:worker_threads';

export function prepareProject(file, slicer, printer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./projectThread.mjs', import.meta.url), {
      workerData: { file, slicer, printer },
    });

    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Couldn’t prepare the print project. Export the 3MF instead.'));
    });
  });
}
