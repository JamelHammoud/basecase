import type { Recording } from '../sim/recorder';
import type { SegmentFrames } from './segmentFrames';
import { segmentRobot, type SegmentScene } from './segmentRobot';
import type { SegmentEvent, SegmentInput } from './segments';

export interface SegmentSource {
  scene: Omit<SegmentScene, 'jointQpos'>;
  stages: number[];
  real: boolean;
}

export const segmentFrames = (r: Recording): SegmentFrames => ({
  frames: r.frames,
  dt: r.dt,
  nbody: r.nbody,
  nu: r.nu,
  nq: r.nq,
  poses: r.poses,
  ctrl: r.ctrl,
  qpos: r.qpos,
});

export const recordedEvents = (r: Pick<Recording, 'inputs'>): SegmentEvent[] =>
  (Array.isArray(r.inputs) ? r.inputs : []).filter(
    (e): e is SegmentEvent => typeof e?.name === 'string' && typeof e.at === 'number' && Number.isFinite(e.at),
  );

export function segmentInput(recording: Recording, source: SegmentSource): SegmentInput {
  const scene = source.real ? { ...source.scene, effector: null, objects: [] } : source.scene;

  return {
    frames: segmentFrames(recording),
    robot: segmentRobot({ ...scene, jointQpos: recording.jointQpos }),
    marks: { stages: source.stages, events: recordedEvents(recording), real: source.real },
  };
}
