import * as THREE from 'three';
import type { Recording } from '../sim/recorder';
import { mapCloud, ScanMap, type MapOptions } from './map';
import type { BuiltMap } from './mapFeed';
import type { PlacedSweep } from './mapSession';
import { scanHits, type ScanSource } from './simTracks';

export type ScanRecording = Pick<Recording, 'scan' | 'scanWidth' | 'poses' | 'nbody' | 'frames' | 't' | 'dt'>;

export interface SimScans {
  recording: ScanRecording;
  sources: ScanSource[];
}

const WORLD = new THREE.Matrix4();

export function sceneToRos(scene: Float32Array): Float32Array {
  const out = new Float32Array(scene.length);

  for (let i = 0; i < scene.length; i += 3) {
    out[i] = scene[i] / 1000;
    out[i + 1] = -scene[i + 2] / 1000;
    out[i + 2] = scene[i + 1] / 1000;
  }

  return out;
}

export function addSceneHits(map: ScanMap, scene: Float32Array): void {
  if (scene.length) map.add({ points: sceneToRos(scene), pose: WORLD });
}

function scanChanged(recording: ScanRecording, frame: number, source: ScanSource): boolean {
  if (frame === 0) return true;

  const width = recording.scanWidth!;
  const rays = source.eye.cols * source.eye.rows;

  for (let i = source.offset; i < source.offset + rays; i++)
    if (recording.scan![frame * width + i] !== recording.scan![(frame - 1) * width + i]) return true;

  return false;
}

export function simMap({ recording, sources }: SimScans, options: MapOptions = {}): BuiltMap | null {
  if (!sources.length || !recording.scan || !recording.scanWidth || recording.frames < 1) return null;

  const map = new ScanMap({ ...options, match: false });
  const placed: PlacedSweep[] = [];
  const last = sources.map(() => -Infinity);

  for (let frame = 0; frame < recording.frames; frame++) {
    const at = recording.t[frame] ?? frame * recording.dt;
    const values = recording.scan.subarray(frame * recording.scanWidth, (frame + 1) * recording.scanWidth);
    const poses = recording.poses.subarray(frame * recording.nbody * 7);

    sources.forEach((source, i) => {
      const period = source.eye.scan ? 1 / source.eye.scan.rateHz : 0;

      if (at - last[i] < period - 1e-6 && !scanChanged(recording, frame, source)) return;

      addSceneHits(map, scanHits(source, values, poses));
      placed.push({ at, frame: source.id, pose: WORLD });
      last[i] = at;
    });
  }

  return { cloud: mapCloud(map.points(), null), placed };
}
