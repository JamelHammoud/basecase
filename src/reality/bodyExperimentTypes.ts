import type { BodyEvidenceRef } from './bodyEvidence';
import type { MotionRecording } from '../../electron/robot/bodyMotionRecording.mjs';
import type { BodySequence } from './bodySequenceTypes';

export const BODY_EMULATOR_LIMIT = 'This emulator doesn’t model body mass, payload or floor contact.';

export interface BodyExperimentEvidence {
  recommendation: BodyEvidenceRef;
  recording: MotionRecording;
}

export interface BodySequenceEvidence {
  source: BodyEvidenceRef;
  state: BodySequence;
  recordings: BodyEvidenceRef[];
  retainedBytes: number;
}
