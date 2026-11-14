import type { ReplayPlan } from '../datasets/import/kinematicRecording';
import type { SourceEpisode } from '../datasets/import/types';
import type { StoredTry } from '../cases/tryFile';
import type { Recording } from '../sim/recorder';
import type { OperateLog } from './operateLog';

export const OPERATOR_VIDEO = { camera: 'operator', path: 'operator.mp4' } as const;

export function operateEpisode(log: OperateLog, joints: number): SourceEpisode {
  const frames = log.statuses.length;
  const state = new Float64Array(frames * joints);
  const held = new Array<number>(joints).fill(0);

  log.statuses.forEach((status, n) => {
    for (let k = 0; k < joints; k++) {
      held[k] = status.q[k] ?? held[k];
      state[n * joints + k] = held[k];
    }
  });

  return {
    index: 0,
    task: null,
    t: Float64Array.from(log.statuses, (s) => s.t),
    state,
    action: null,
    videos: [],
  };
}

export function operatePlan(joints: string[], episode: SourceEpisode): ReplayPlan {
  const spans = joints.map(() => ({ lo: 0, hi: 0 }));

  episode.state.forEach((v, i) => {
    const span = spans[i % joints.length];

    span.lo = Math.min(span.lo, v);
    span.hi = Math.max(span.hi, v);
  });

  return { joints, unit: 'rad', spans };
}

export interface OperateVideo {
  seconds: number;
  startedAt?: number;
}

function videoSpan(manifest: StoredTry, video: OperateVideo, seconds: number) {
  const offset = video.startedAt === undefined ? NaN : (video.startedAt - Date.parse(manifest.startedAt)) / 1000;
  const from = Number.isFinite(offset) ? Math.max(0, offset) : Math.max(0, seconds - video.seconds);

  return { ...OPERATOR_VIDEO, from, to: from + video.seconds };
}

export function operateStored(manifest: StoredTry, recording: Recording, video: OperateVideo | null): StoredTry {
  const seconds = recording.frames > 1 ? recording.t[recording.frames - 1] : manifest.seconds;
  const videos = video ? [videoSpan(manifest, video, seconds)] : (manifest.videos ?? []);

  return {
    ...manifest,
    frames: recording.frames,
    rate: recording.dt > 0 ? Math.round(1 / recording.dt) : manifest.rate,
    ...(videos.length ? { videos } : {}),
  };
}
