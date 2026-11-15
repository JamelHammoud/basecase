import type { CameraStageJob } from '../cameras/cameraStage';
import type { Case } from '../cases/schema';
import type { StoredTry } from '../cases/tryFile';
import type { Recording } from '../sim/recorder';
import type { Rig } from '../utils/kinematics';

export type TryFrameSelection =
  | { kind: 'frame'; frame: number }
  | { kind: 'every'; step: number; from?: number; to?: number }
  | { kind: 'range'; from: number; to: number; step?: number }
  | { kind: 'sample'; count: number };

export interface TryFrameScene extends CameraStageJob {
  kase?: Case;
  rig?: Rig;
}

export interface TryFrameSource {
  stored: StoredTry;
  recording: Recording | null;
  scene?: TryFrameScene;
}

export interface TryFrameJob {
  name: string;
  tries: TryFrameSource[];
  selection: TryFrameSelection;
  cameras: string[];
  scene?: TryFrameScene;
  width?: number;
  height?: number;
}

export interface TryFramePick {
  tryIndex: number;
  frame: number;
  seconds: number;
}

export interface TryFrameProgress {
  done: number;
  total: number;
}
