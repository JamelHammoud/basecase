import { matTagCorners, type CaseMat } from '../../cases/mat/matLayout';
import {
  cameraPose,
  locateBase,
  viewMat,
  type BaseFix,
  type FrameSize,
  type MatView,
  type SeenTag,
  type TrackMat,
} from './matSolve';

export interface MatSample {
  t: number;
  base: BaseFix | null;
  tags: number;
}

export interface MatTracker {
  push(seen: SeenTag[], frame: FrameSize, t: number): MatSample;

  refusal(): string | null;

  focal(): number | null;
}

export const MAT_SCALE_REFUSAL = 'Print the mat at 100% scale.';

const FOCAL_FRAMES = 5;
const SCALE_FRAMES = 5;
const MAX_RESIDUAL_MM = 6;
const GUESS_AFTER = 15;
const GUESS_HALF_FOV_RAD = (35 * Math.PI) / 180;
const SCALE_TOLERANCE = 0.015;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function trackMat(mat: CaseMat): TrackMat {
  const corners = new Map(matTagCorners(mat).map((t) => [t.id, t.corners]));

  return {
    tags: mat.tags.map((t) => ({ id: t.id, size: t.size, corners: corners.get(t.id)! })),
    base: { id: mat.base.id, size: mat.base.size, height: mat.base.center[1], up: mat.base.up },
  };
}

export function createMatTracker(mat: TrackMat): MatTracker {
  const focals: number[] = [];
  let misfits = 0;
  let views = 0;
  let locked: number | null = null;
  let refused: string | null = null;

  const focalFor = (estimate: number | null): number | null => {
    if (locked !== null) return locked;

    if (estimate !== null) focals.push(estimate);

    if (focals.length >= FOCAL_FRAMES) locked = median(focals);
    else if (!focals.length && views >= GUESS_AFTER) locked = 1 / Math.tan(GUESS_HALF_FOV_RAD);

    return locked ?? estimate;
  };

  const trueToScale = (view: MatView) => {
    const fits = Math.abs(view.scale - 1) <= SCALE_TOLERANCE && view.residualMm <= MAX_RESIDUAL_MM;

    if (!fits) misfits++;

    if (misfits >= SCALE_FRAMES) refused = MAT_SCALE_REFUSAL;

    return fits;
  };

  return {
    push(seen, frame, t) {
      const view = refused ? null : viewMat(seen, mat, frame);

      if (!view) return { t, base: null, tags: 0 };

      views++;

      const fits = trueToScale(view);
      const focal = fits ? focalFor(view.focal) : null;
      const pose = focal !== null && !refused ? cameraPose(view, focal, mat) : null;

      return { t, base: pose && locateBase(seen, mat, frame, pose), tags: view.tags };
    },
    refusal: () => refused,
    focal: () => locked,
  };
}
