import type { DriveCommand } from '../../sim/driveTypes';
import type { Rig, V3 } from '../../utils/kinematics';
import { oneEuro } from '../../utils/oneEuro';
import { createRetargeter } from '../../utils/retargeter';
import { distance, LANDMARK_COUNT, LM, pinch, upOf, upperFrame, type PoseLandmark } from './landmarks';
import { pointsFrom, type PointTable } from './pointTable';

export type OperatorTarget =
  { kind: 'pose'; rig: Rig; points: PointTable; joints: string[] } | { kind: 'arm'; anchor: V3; reachMm: number };

export interface OperatorDriver {
  step: (landmarks: readonly PoseLandmark[], t: number) => DriveCommand | null;
}

export const SMOOTHING = { minCutoff: 1.2, beta: 4 };

const REACH_SHARE = 0.98;
const FLOOR_MM = 10;

function smoother() {
  const filter = oneEuro(SMOOTHING);

  return (lm: readonly PoseLandmark[], t: number): PoseLandmark[] | null => {
    if (lm.length < LANDMARK_COUNT) return null;

    const out = filter.filter(
      lm.flatMap((p) => [p.x, p.y, p.z]),
      t,
    );

    return lm.map((p, i) => ({ x: out[i * 3], y: out[i * 3 + 1], z: out[i * 3 + 2], visibility: p.visibility }));
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

function poseDriver(target: Extract<OperatorTarget, { kind: 'pose' }>): OperatorDriver {
  const smooth = smoother();
  const rt = createRetargeter({ rig: target.rig, pointOf: pointsFrom(target.points), upperBody: true });

  return {
    step: (raw, t) => {
      const lm = smooth(raw, t);

      if (!lm) return null;

      const step = rt.step(upperFrame(lm, !rt.body()), t);

      if (!step) return null;

      const joints = Object.fromEntries(target.joints.map((id) => [id, round(step.values[id] ?? 0)]));

      return { v: [0, 0, 0], joints, aux: [0, pinch(lm)] };
    },
  };
}

function armDriver({ anchor, reachMm }: Extract<OperatorTarget, { kind: 'arm' }>): OperatorDriver {
  const smooth = smoother();

  return {
    step: (raw, t) => {
      const lm = smooth(raw, t);

      if (!lm) return null;

      const [shoulder, elbow, wrist] = [LM.rightShoulder, LM.rightElbow, LM.rightWrist].map((i) => upOf(lm[i]));
      const arm = distance(shoulder, elbow) + distance(elbow, wrist);

      if (arm < 1e-3) return null;

      const scale = reachMm / arm;
      const offset = wrist.map((x, i) => (x - shoulder[i]) * scale);
      const length = Math.hypot(...offset);
      const fit = length > reachMm * REACH_SHARE ? (reachMm * REACH_SHARE) / length : 1;
      const at = offset.map((x, i) => round(anchor[i] + x * fit)) as V3;

      at[1] = Math.max(at[1], FLOOR_MM);

      return { v: [0, 0, 0], target: at, aux: [0, pinch(lm)] };
    },
  };
}

export const createOperatorDriver = (target: OperatorTarget): OperatorDriver =>
  target.kind === 'pose' ? poseDriver(target) : armDriver(target);
