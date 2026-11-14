import type { TrySource, TryVerdict } from '../tryFile';

export type BodyClass = 'fixed' | 'mobile';

export const MOTION_SAMPLES = 128;

export interface MotionTrace {
  body: BodyClass;
  joints: number;
  path: number[];
  speed: number[];
}

export interface TrySegment {
  id: string;
  label: string;
  start: number;
  end: number;
  tags?: string[];
  outcome?: TryVerdict;
}

export interface LikeTarget {
  tryId: string;
  segmentId: string | null;
}

export interface Bound {
  value: number;
  inclusive: boolean;
}

export interface QueryFilters {
  verdicts: TryVerdict[];
  sources: TrySource[];
  inputs: string[];
  robots: string[];
  after: number | null;
  before: number | null;
  minSeconds: Bound | null;
  maxSeconds: Bound | null;
  faulted: boolean | null;
  like: LikeTarget | null;
}

export interface ParsedQuery {
  words: string[];
  filters: QueryFilters;
}

export interface QueryVocab {
  robots: string[];
  inputs: string[];
}

export type HitMatch = 'words' | 'facts' | 'motion' | 'frame';

export interface TryHit {
  tryId: string;
  segmentId: string | null;
  label: string;
  robot: string;
  sceneId: string;
  at: number;
  end: number | null;
  score: number;
  match: HitMatch;
  verdict: TryVerdict;
  seconds: number;
  startedAt: string;
}

export interface FrameVector {
  at: number;
  vector: Float32Array;
}
