import { useEffect, useState } from 'react';
import { filmBoxes, type FilmBox } from '../../cases/filmstrip';
import { drawTryFilm } from '../../cases/filmstripClient';
import type { TryRecord } from '../../cases/tries';
import { loadRecording } from '../../cases/tryStore';
import type { SimModel } from '../../sim/mjcfTypes';
import type { ScenePart } from '../../types/robotics';

async function render(record: TryRecord, model: SimModel, boxes: FilmBox[]): Promise<Blob | null> {
  const recording = await loadRecording(record.id);

  return recording && drawTryFilm({ model, recording, boxes });
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
    if (!model || record.real) return;

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
