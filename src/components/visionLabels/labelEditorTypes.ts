import type { FrameSet, ImageAnnotation, TrainingFrame } from '../../vision/frameSet';

export interface SegmentLabelRequest {
  frame: TrainingFrame;
  classId: number;
  instance?: string;
  point: [number, number];
}

export interface TrackLabelRequest {
  set: FrameSet;
  frameId: string;
  instance: string;
}

export interface FrameLabelEditorProps {
  set: FrameSet;
  onChange: (set: FrameSet, previous: FrameSet) => void;
  onClose: () => void;
  initialFrameId?: string;
  onSegment?: (request: SegmentLabelRequest) => Promise<ImageAnnotation | null>;
  onPrelabel?: (set: FrameSet) => Promise<FrameSet>;
  onTrack?: (request: TrackLabelRequest) => Promise<FrameSet>;
}

export type LabelPoint = [number, number];
