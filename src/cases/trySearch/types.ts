import type { TrySource, TryVerdict } from '../tryFile';

export type BodyClass = 'fixed' | 'mobile';

export const MOTION_SAMPLES = 128;

export const SIGNATURE_SCALE = 127;

export interface MotionTrace {
  body: BodyClass;
  joints: number;
  path: number[];
  speed: number[];
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
  like: string | null;
}

export interface ParsedQuery {
  words: string[];
  filters: QueryFilters;
  alternate?: ParsedQuery;
}

export interface QueryVocab {
  robots: string[];
  inputs: string[];
  named?: string[];
}

export type HitMatch = 'words' | 'facts' | 'motion';

export interface TryHit {
  tryId: string;
  label: string;
  robot: string;
  sceneId: string;
  score: number;
  match: HitMatch;
  verdict: TryVerdict;
  seconds: number;
  startedAt: string;
}

export interface IndexedTry {
  id: string;
  label: string;
  robot: string;
  sceneId: string;
  input: string | null;
  source: TrySource;
  verdict: TryVerdict;
  seconds: number;
  startedAt: string;
  time: number;
  faulted: boolean;
  terms: Array<[term: string, weight: number]>;
  named: string[];
  motionKey: string | null;
  signature: number[] | null;
  stamp: number;
}
