import type { EndEffector } from '../cases/robotFit';
import type { SegmentVerb } from '../cases/tryLabels';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { V3 } from '../utils/kinematics';

export interface SegmentJaw {
  qpos: number;
  open: number;
  closed: number;
  ctrl?: number;
}

export interface SegmentObject {
  id: string;
  name: string;
  position: V3;
  size: V3;
}

export type SegmentBase = 'fixed' | 'wheels' | 'legs';

export interface SegmentInput {
  recording: Recording;
  model: SimModel | null;
  kind: 'sim' | 'real';
  jaws: SegmentJaw[];
  hand: EndEffector | null;
  objects: SegmentObject[];
  stages: number[];
  base: SegmentBase;
}

export interface FrameLabel {
  verb: SegmentVerb;
  object: number;
}

export const SEGMENT_RULES = {
  pauseS: 0.3,
  minSegmentS: 0.2,
  verbEventS: 1.5,
  gripActionS: 0.5,
  gripClose: 0.6,
  gripOpen: 0.4,
  stillJoint: 0.05,
  stillBaseMS: 0.02,
  stillYawRadS: 0.15,
  turnRadiusM: 0.25,
  nearMm: 20,
  liftMm: 10,
  setDownMm: 5,
  moveMmS: 50,
  pushMmS: 30,
  speedWindow: 3,
};

export const framesOf = (seconds: number, dt: number) => Math.max(1, Math.round(seconds / dt));
