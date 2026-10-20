import { useEffect, useState } from 'react';
import { scenePreview } from '../../three/scenePreview';
import type { SavedSceneSummary } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';

const generated = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

const keyOf = (scene: SavedSceneSummary) => `${scene.id}:${scene.updatedAt}`;

async function generatePreview(scene: SavedSceneSummary): Promise<string> {
  const record = await platformBridge.getScene(scene.id);

  if (!record?.parts?.length) {
    return '';
  }

  const fields = await scenePreview(record.parts);

  if (fields.previewDataUrl) {
    await platformBridge.saveScenePreview({
      id: scene.id,
      previewDataUrl: fields.previewDataUrl,
      sizeMm: fields.sizeMm,
    });
  }

  return fields.previewDataUrl ?? '';
}

function enqueue(scene: SavedSceneSummary): Promise<string> {
  const job = queue.then(() => generatePreview(scene)).catch(() => '');

  queue = job;

  return job;
}

export function useScenePreview(scene: SavedSceneSummary): string | undefined {
  const key = keyOf(scene);
  const [made, setMade] = useState<{ key: string; url: string } | null>(null);
  const needed = !scene.previewDataUrl && scene.partCount > 0 && !generated.has(key);

  useEffect(() => {
    if (!needed) return;

    let cancelled = false;

    enqueue(scene).then((url) => {
      generated.set(key, url);

      if (!cancelled) setMade({ key, url });
    });

    return () => {
      cancelled = true;
    };
  }, [key, needed, scene]);

  if (scene.previewDataUrl) {
    return scene.previewDataUrl;
  }

  if (scene.partCount === 0) {
    return '';
  }

  return made?.key === key ? made.url : generated.get(key);
}
