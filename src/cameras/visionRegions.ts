import { visionRuntime } from '../vision/runtime';
import type { CameraRegions } from '../vision/tracking/types';
import type { VisionSource } from '../vision/types';

const regions = new Map<string, CameraRegions>();
const listeners = new Set<(camera: string) => void>();

const keyOf = (source: VisionSource, camera: string) => `${source.id}/${camera}`;

export function setCameraRegions(source: VisionSource, camera: string, next: CameraRegions | undefined) {
  const key = keyOf(source, camera);
  const empty = !next || (!next.zones.length && !next.lines.length);

  if (JSON.stringify(regions.get(key)) === JSON.stringify(empty ? undefined : next)) return;

  if (empty) regions.delete(key);
  else regions.set(key, next);

  visionRuntime().track(source.id, camera, empty ? undefined : next);
  listeners.forEach((listen) => listen(key));
}

export const cameraRegions = (key: string) => regions.get(key);

export function onCameraRegions(listener: (camera: string) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function resetCameraTracking(key: string) {
  const split = key.indexOf('/');

  if (split > 0 && regions.has(key)) visionRuntime().resetTracking(key.slice(0, split), key.slice(split + 1));
}
