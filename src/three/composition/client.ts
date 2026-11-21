import { renderMeshFiles } from '../componentMeshes';
import { compositionParts } from './scene';
import type { CompositionJob, CompositionOutput } from './render';

type Request = Omit<CompositionJob, 'meshes'>;

type Files = typeof renderMeshFiles;

export class CompositionJobs {
  private readonly spawn: () => Worker;
  private readonly files: Files;

  private stop: (() => void) | null = null;

  constructor(
    spawn = () => new Worker(new URL('./composition.worker.ts', import.meta.url), { type: 'module' }),
    files: Files = renderMeshFiles,
  ) {
    this.spawn = spawn;
    this.files = files;
  }

  cancel(): void {
    this.stop?.();
  }

  run(request: Request, signal: AbortSignal): Promise<CompositionOutput> {
    this.cancel();

    const started = performance.now();
    let dispatchMs = 0;

    return new Promise((resolve, reject) => {
      let worker: Worker | null = null;
      let finished = false;
      const finish = (error?: unknown, result?: CompositionOutput) => {
        if (finished) return;

        finished = true;
        signal.removeEventListener('abort', cancel);
        worker?.terminate();

        if (this.stop === cancel) this.stop = null;

        if (error) reject(error);
        else resolve({ ...result!, metrics: { ...result!.metrics, dispatchMs, totalMs: performance.now() - started } });
      };
      const cancel = () => finish(new DOMException('Rendering cancelled', 'AbortError'));

      this.stop = cancel;
      signal.addEventListener('abort', cancel, { once: true });

      if (signal.aborted) {
        cancel();

        return;
      }

      void this.files(compositionParts(request.snapshot.parts))
        .then((meshes) => {
          if (finished) return;

          worker = this.spawn();
          worker.onmessage = ({ data }: MessageEvent<{ result?: CompositionOutput; error?: string }>) => {
            if (data.error) finish(new Error(data.error));
            else finish(undefined, data.result);
          };
          worker.onerror = (event) => finish(new Error(event.message || 'Rendering stopped. Export the image again.'));

          const dispatch = performance.now();

          worker.postMessage({ id: 1, op: 'render', payload: { ...request, meshes } satisfies CompositionJob });
          dispatchMs = performance.now() - dispatch;
        })
        .catch(finish);
    });
  }
}

export const compositionJobs = new CompositionJobs();
