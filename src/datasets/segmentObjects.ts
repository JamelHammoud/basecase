import * as THREE from 'three';
import { simDelta, worldDeltas } from '../sim/mjcfFrames';
import { framePoses, type Recording } from '../sim/recorder';
import { SEGMENT_RULES, type SegmentInput, type SegmentObject } from './segmentTypes';

export interface ObjectTrack {
  near: boolean[];
  distance: Float64Array;
  rise: Float64Array;
  slide: Float64Array;
  raised: boolean[];
}

const reachOf = (o: SegmentObject) => Math.max(...o.size) / 2 + SEGMENT_RULES.nearMm;

function samplePaths(input: SegmentInput & { model: NonNullable<SegmentInput['model']> }) {
  const { recording: r, model, objects } = input;
  const hand = input.hand!;
  const paths = objects.map(() => new Float64Array(r.frames * 3));
  const handPath = new Float64Array(r.frames * 3);
  const point = new THREE.Vector3();

  for (let f = 0; f < r.frames; f++) {
    const poses = framePoses(r, f);
    const handDelta = simDelta(model, poses, hand.part);
    const world = worldDeltas(model, poses);

    point.set(...hand.point).applyMatrix4(handDelta ?? new THREE.Matrix4());
    point.toArray(handPath, f * 3);
    objects.forEach((o, i) => {
      point.set(...o.position).applyMatrix4(world.get(o.id) ?? new THREE.Matrix4());
      point.toArray(paths[i], f * 3);
    });
  }

  return { paths, handPath };
}

function velocities(path: Float64Array, r: Recording) {
  const rise = new Float64Array(r.frames);
  const slide = new Float64Array(r.frames);
  const w = SEGMENT_RULES.speedWindow;

  for (let f = 0; f < r.frames; f++) {
    const before = Math.max(0, f - w) * 3;
    const after = Math.min(r.frames - 1, f + w) * 3;
    const seconds = Math.max(1, (after - before) / 3) * r.dt;

    rise[f] = (path[after + 1] - path[before + 1]) / seconds;
    slide[f] = Math.hypot(path[after] - path[before], path[after + 2] - path[before + 2]) / seconds;
  }

  return { rise, slide };
}

function raisedOf(path: Float64Array, frames: number): boolean[] {
  const rest = path[1];
  const out: boolean[] = [];
  let raised = false;

  for (let f = 0; f < frames; f++) {
    const height = path[f * 3 + 1] - rest;

    raised = raised ? height >= SEGMENT_RULES.setDownMm : height > SEGMENT_RULES.liftMm;
    out.push(raised);
  }

  return out;
}

function trackOf(path: Float64Array, handPath: Float64Array, o: SegmentObject, r: Recording): ObjectTrack {
  const distance = new Float64Array(r.frames);

  for (let f = 0; f < r.frames; f++) {
    const at = f * 3;

    distance[f] = Math.hypot(path[at] - handPath[at], path[at + 1] - handPath[at + 1], path[at + 2] - handPath[at + 2]);
  }

  const reach = reachOf(o);

  return {
    near: Array.from(distance, (d) => d < reach),
    distance,
    ...velocities(path, r),
    raised: raisedOf(path, r.frames),
  };
}

export function objectTracks(input: SegmentInput): ObjectTrack[] | null {
  const { model, hand, objects, recording } = input;

  if (input.kind !== 'sim' || !model || !hand || !objects.length || recording.frames < 1) return null;

  const { paths, handPath } = samplePaths({ ...input, model });

  return objects.map((o, i) => trackOf(paths[i], handPath, o, recording));
}

export function nearestObject(tracks: ObjectTrack[], f: number): number {
  let best = -1;

  tracks.forEach((t, i) => {
    if (t.near[f] && (best < 0 || t.distance[f] < tracks[best].distance[f])) best = i;
  });

  return best;
}
