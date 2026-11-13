import type { FilmstripInput } from './filmstrip';

let worker: Worker | null = null;
let seq = 0;

function filmWorker(): Worker {
  worker ??= new Worker(new URL('./filmstrip.worker.ts', import.meta.url), { type: 'module' });

  return worker;
}

export function drawFilmstrip(input: FilmstripInput, image: ImageEncodeOptions): Promise<Blob | null> {
  const id = ++seq;
  const w = filmWorker();

  return new Promise((resolve) => {
    const onMessage = (ev: MessageEvent<{ id: number; blob?: Blob }>) => {
      if (ev.data.id !== id) return;

      w.removeEventListener('message', onMessage);
      resolve(ev.data.blob ?? null);
    };

    w.addEventListener('message', onMessage);
    w.postMessage({ id, input, image });
  });
}
