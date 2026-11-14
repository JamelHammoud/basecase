import type { FilmShot, FilmstripInput } from './filmstrip';

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

const TRY_FILM = { frames: 4, width: 72, height: 56 };

export const drawTryFilm = async (shot: FilmShot): Promise<Blob | null> =>
  shot.recording.nbody === shot.model.bodies.length
    ? drawFilmstrip({ ...shot, ...TRY_FILM }, { type: 'image/webp', quality: 0.8 })
    : null;
