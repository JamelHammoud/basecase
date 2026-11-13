import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import { filmBoxes, type FilmShot } from './filmstrip';
import type { CaseFrame, CaseResult } from './runCase';
import { worldItem } from './schema';

export const FILM_FRAMES = 3;

export function pickFrames(frames: CaseFrame[], count: number): CaseFrame[] {
  if (frames.length <= count) return frames;

  return Array.from({ length: count }, (_, k) => frames[Math.round((k / (count - 1)) * (frames.length - 1))]);
}

function sparseRecording(frames: CaseFrame[], nbody: number, dt: number): Recording {
  const poses = new Float32Array(frames.length * nbody * 7);

  frames.forEach((f, i) => poses.set(f.poses.subarray(0, nbody * 7), i * nbody * 7));

  return {
    dt,
    frames: frames.length,
    nq: 0,
    nv: 0,
    nu: 0,
    nbody,
    t: Float32Array.from(frames.map((f) => f.t)),
    ctrl: new Float32Array(),
    qpos: new Float64Array(),
    qvel: new Float32Array(),
    poses,
  };
}

export function caseFilm(result: CaseResult, parts: ScenePart[], count = FILM_FRAMES): FilmShot | null {
  const frames = pickFrames(result.frames, count);

  if (!frames.length) return null;

  const nbody = result.model.bodies.length;
  const dt = frames.length > 1 ? frames[1].t - frames[0].t : 0;

  return {
    model: result.model,
    recording: sparseRecording(frames, nbody, dt),
    boxes: filmBoxes(parts, result.case.world.objects.map(worldItem)),
  };
}
