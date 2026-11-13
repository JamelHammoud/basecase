import { useEffect, useState } from 'react';
import { filmBoxes, type FilmBox } from '../../cases/filmstrip';
import { drawFilmstrip } from '../../cases/filmstripClient';
import type { TryRecord } from '../../cases/tries';
import { loadRecording } from '../../cases/tryStore';
import type { SimModel } from '../../sim/mjcfTypes';
import type { ScenePart } from '../../types/robotics';

const FRAME_W = 72;
const FRAME_H = 56;
const FRAMES = 4;

async function render(record: TryRecord, model: SimModel, boxes: FilmBox[]): Promise<string | null> {
  const recording = await loadRecording(record.id);

  if (!recording || recording.nbody !== model.bodies.length) return null;

  const bitmap = await drawFilmstrip({ model, recording, boxes, frames: FRAMES, width: FRAME_W, height: FRAME_H });

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
    const boxes = filmBoxes(parts, world);

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
