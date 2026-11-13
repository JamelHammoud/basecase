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

async function render(record: TryRecord, model: SimModel, boxes: FilmBox[]): Promise<Blob | null> {
  const recording = await loadRecording(record.id);

  if (!recording || recording.nbody !== model.bodies.length) return null;

  return drawFilmstrip(
    { model, recording, boxes, frames: FRAMES, width: FRAME_W, height: FRAME_H },
    { type: 'image/webp', quality: 0.8 },
  );
}

const strips = new WeakMap<SimModel, Map<string, Promise<Blob | null>>>();

function stripOf(record: TryRecord, model: SimModel, boxes: FilmBox[]): Promise<Blob | null> {
  const key = `${record.id} ${JSON.stringify(boxes)}`;
  const forModel = strips.get(model) ?? new Map<string, Promise<Blob | null>>();
  const cached = forModel.get(key);

  if (cached) return cached;

  const forget = () => {
    forModel.delete(key);

    return null;
  };
  const strip = render(record, model, boxes).then((blob) => blob ?? forget(), forget);

  forModel.set(key, strip);
  strips.set(model, forModel);

  return strip;
}

export function useFilmstrip(record: TryRecord, model: SimModel | null, parts: ScenePart[], world: ScenePart[]) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;

    let live = true;
    const boxes = filmBoxes(parts, world);

    void stripOf(record, model, boxes).then((blob) => {
      if (live) setUrl(blob && URL.createObjectURL(blob));
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
