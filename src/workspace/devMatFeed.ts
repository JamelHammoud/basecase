import type { CaseMat } from '../cases/mat/matLayout';
import { feedMatFrames, matTrackingSnapshot } from '../cameras/mat/matTracking';
import { FEED_FPS, type FeedPose, type MatFeed } from '../cameras/mat/tagsProtocol';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface MatFeedOptions {
  seconds?: number;
  hide?: [number, number];
}

export interface MatDevActions {
  caseMat: () => { sheets: number; tags: number } | null;
  matFeed: (options: MatFeedOptions) => MatFeed | null;
  samples: () => number;
}

const MOVE_SHARE = 0.6;
const CAMERA_HEIGHT_MM = 1600;
const CAMERA_BACK_MM = 300;
const FEED_HFOV_DEG = 70;
const FEED_SIZE = { width: 640, height: 360 };

function matBounds(mat: CaseMat) {
  const xs = mat.sheets.flatMap((s) => [s.x0, s.x0 + s.width]);
  const zs = mat.sheets.flatMap((s) => [s.z0, s.z0 + s.height]);

  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cz: (Math.min(...zs) + Math.max(...zs)) / 2,
    minZ: Math.min(...zs),
  };
}

export function matFeedOf(mat: CaseMat, seconds: number, hide?: [number, number]): MatFeed {
  const [rx, , rz] = mat.base.center;
  const [px, pz] = mat.path[0];
  const [sx, sz] = mat.spots.at(-1)?.center ?? mat.path[0];
  const to = { x: sx + rx - px, z: sz + rz - pz };
  const yaw = Math.atan2(mat.base.up[0], mat.base.up[1]);
  const hidden = (t: number) => !!hide && t >= hide[0] && t < hide[1];
  const poses = Array.from({ length: Math.round(seconds * FEED_FPS) + 1 }, (_, i): FeedPose => {
    const t = i / FEED_FPS;
    const k = Math.min(1, t / (seconds * MOVE_SHARE));

    return { t, base: hidden(t) ? null : { x: rx + (to.x - rx) * k, z: rz + (to.z - rz) * k, yaw } };
  });
  const { cx, cz, minZ } = matBounds(mat);

  return {
    camera: {
      position: [cx, CAMERA_HEIGHT_MM, minZ - CAMERA_BACK_MM],
      target: [cx, 0, cz],
      lens: { model: 'pinhole', hfovDeg: FEED_HFOV_DEG },
    },
    ...FEED_SIZE,
    poses,
  };
}

export function matDevActions(core: WorkspaceCore): MatDevActions {
  const { cases } = core.simTraining;
  const made = () => cases.mat.matOf();

  return {
    caseMat: () => {
      const mat = made()?.mat;

      return mat ? { sheets: mat.sheets.length, tags: mat.tags.length } : null;
    },
    matFeed: (options) => {
      const mat = made()?.mat;
      const seconds = options.seconds ?? cases.active?.task.seconds ?? 0;

      return mat ? matFeedOf(mat, seconds, options.hide) : null;
    },
    samples: () => cases.realTry.samples(),
  };
}

export function matStudioApi(mat: () => MatDevActions) {
  return {
    caseMat: () => mat().caseMat(),
    feedMatFrames: (options: MatFeedOptions = {}) => {
      const feed = mat().matFeed(options);

      if (feed) feedMatFrames(feed);

      return !!feed;
    },
    matTrack: () => {
      const { open, latest } = matTrackingSnapshot();

      return { open, seen: !!latest?.base, samples: mat().samples() };
    },
  };
}
