import { MissingCollider } from './worldImport';
import type { DroppedFile, StoredWorld } from './worldTypes';

interface Reply {
  id: number;
  world?: StoredWorld;
  told?: boolean;
  message?: string;
}

let worker: Worker | null = null;
let seq = 0;

function worldWorker(): Worker {
  worker ??= new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' });

  return worker;
}

export function openWorldInWorker(files: DroppedFile[]): Promise<StoredWorld> {
  const id = ++seq;
  const w = worldWorker();

  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<Reply>) => {
      if (ev.data.id !== id) return;

      w.removeEventListener('message', onMessage);

      if (ev.data.world) resolve(ev.data.world);
      else reject(ev.data.told ? new MissingCollider(ev.data.message ?? '') : new Error(ev.data.message));
    };

    w.addEventListener('message', onMessage);
    w.postMessage({ id, files }, [...new Set(files.map((f) => f.bytes.buffer as ArrayBuffer))]);
  });
}
