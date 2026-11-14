export const TAKE_VERSION: 1;
export const KEEP_SECONDS: number;
export const MOVED_RAD: number;
export const BY_HAND: 'by-hand';
export const MAX_INPUT_VALUES: number;
export const DEFAULT_SCENE: string;
export const REPLAY_SECONDS: number;

export type TakeRow = [string, ...unknown[]];

export interface TakeContext {
  sceneId: string;
  robot: string;
  joints: string[];
}

export interface TakeManifest {
  version: 1;
  id: string;
  sceneId: string;
  robot: { name: string; modelHash: string; joints: string[] };
  case: null;
  source: 'operate';
  input: string;
  startedAt: string;
  seconds: number;
  rate: number;
  frames: number;
  outcome: { verdict: 'unjudged'; margin: null };
  seed: 0;
  sourceTry: null;
  faults: [];
  policy?: string;
  fault?: string;
}

export function rounded(v: unknown): number | null;

export class RobotTake {
  constructor(options: { id: string; joints: readonly string[]; startedAt: string });
  readonly id: string;
  readonly joints: string[];
  readonly frames: number;
  readonly intents: number;
  readonly seconds: number;
  readonly moved: boolean;
  policy: string | null;
  fault: string | null;
  apply(row: TakeRow): void;
  keeps(faulted: boolean): boolean;
  replayable(): boolean;
  manifest(): TakeManifest;
  bytes(): Uint8Array;
}

export function takeOfLog(lines: unknown[]): RobotTake | null;
export function takeOfHeader(first: unknown): RobotTake | null;
export function applyLogRow(take: RobotTake, row: unknown): void;

export interface Take {
  joints: string[];
  frames: number;
  t: Float64Array;
  position: Float32Array;
  velocity: Float32Array | null;
  effort: Float32Array | null;
  intentT: Float64Array;
  intent: Float32Array;
  twinT: Float64Array;
  twin: Float32Array;
  inputIds: string[];
  inputT: Float64Array;
  inputId: Int32Array;
  inputLength: Int32Array;
  input: Float32Array;
}

export function decodeTake(bytes: Uint8Array): Take | null;
