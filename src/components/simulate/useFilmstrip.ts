import { useEffect, useState } from 'react';
import type { FilmBox } from '../../cases/filmstrip';
import type { TryRecord } from '../../cases/tries';
import { loadRecording } from '../../cases/tryStore';
import type { SimModel } from '../../sim/mjcfTypes';
import type { ScenePart } from '../../types/robotics';

const FRAME_W = 72;
const FRAME_H = 56;
const FRAMES = 4;

let worker: Worker | null = null;
let seq = 0;

function filmWorker(): Worker {
  worker ??= new Worker(new URL('../../cases/filmstrip.worker.ts', import.meta.url), { type: 'module' });

  return worker;
}

const boxOf = (p: ScenePart, world: boolean): FilmBox => ({
  id: p.id,
  world,
  position: p.position,
  rotation: p.rotation,
  size: [p.dimensions.width, p.dimensions.height, p.dimensions.depth],
  color: world ? '#0d99ff' : '#9a9a9a',
});

async function render(record: TryRecord, model: SimModel, boxes: FilmBox[]): Promise<string | null> {
  const recording = await loadRecording(record.id);

  if (!recording || recording.nbody !== model.bodies.length) return null;

  const id = ++seq;
  const w = filmWorker();
  const bitmap = await new Promise<ImageBitmap | null>((resolve) => {
    const onMessage = (ev: MessageEvent<{ id: number; bitmap?: ImageBitmap }>) => {
      if (ev.data.id !== id) return;

      w.removeEventListener('message', onMessage);
      resolve(ev.data.bitmap ?? null);
    };

    w.addEventListener('message', onMessage);
    w.postMessage({ id, input: { model, recording, boxes, frames: FRAMES, width: FRAME_W, height: FRAME_H } });
  });

  if (!bitmap) return null;

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);

  canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap);

  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 }));
}

export function useFilmstrip(record: TryRecord, model: SimModel | null, parts: ScenePart[], world: ScenePart[]) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;

    let live = true;
    const boxes = [
      ...parts.filter((p) => p.visible && p.role === 'solid').map((p) => boxOf(p, false)),
      ...world.map((p) => boxOf(p, true)),
    ];

    void render(record, model, boxes).then((made) => {
      if (live) setUrl(made);
      else if (made) URL.revokeObjectURL(made);
    });

    return () => {
      live = false;
    };
  }, [record, model, parts, world]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return url;
}
