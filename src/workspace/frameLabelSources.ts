import { loadManifests, loadRecording } from '../cases/tryStore';
import type { StoredTry } from '../cases/tryFile';
import { recordedFrameCameraKeys } from '../vision/frameCameraClient';
import type { TryFrameScene, TryFrameSource } from '../vision/tryFramesTypes';

type Source = Pick<TryFrameSource, 'stored' | 'recording'>;

const recordedCameras = new WeakMap<Source, Promise<string[]>>();

export function recordedFrameCameras(source: Source): Promise<string[]> {
  const existing = recordedCameras.get(source);

  if (existing) return existing;

  const cameras = recordedFrameCameraKeys(source.recording?.topics).then((topics) => [
    ...new Set([...(source.stored.videos ?? []).map((video) => video.camera), ...topics]),
  ]);

  recordedCameras.set(source, cameras);

  return cameras;
}

export async function loadFrameLabelSources(ids: string[], sceneFor: (stored: StoredTry) => Promise<TryFrameScene>) {
  const stored = await loadManifests(ids);

  if (stored.length !== ids.length) throw new Error('The selected tries could not be opened.');

  const sources: TryFrameSource[] = [];

  for (const item of stored) {
    const source: TryFrameSource = { stored: item, recording: await loadRecording(item.id) };
    const cameras = await recordedFrameCameras(source);

    if ((item.source === 'real' || item.source === 'operate') && !cameras.length)
      throw new Error('This try has no recorded camera frames.');

    if (!cameras.length) source.scene = await sceneFor(item);

    sources.push(source);
  }

  return sources;
}

export async function frameSourceCameras(sources: TryFrameSource[]) {
  const cameras = await Promise.all(
    sources.map(async (source) => [
      ...(await recordedFrameCameras(source)),
      ...(source.scene?.views.map((view) => view.key) ?? []),
    ]),
  );

  return [...new Set(cameras[0] ?? [])].filter((camera) => cameras.every((values) => values.includes(camera)));
}
