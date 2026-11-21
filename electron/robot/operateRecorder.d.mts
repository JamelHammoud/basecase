import type { RobotRun } from '../../src/robot/runBuffer';

export const MIN_SECONDS: number;
export const MOVED_RAD: number;
export const MAX_INPUT_VALUES: number;
export const POLICY_RUNG: string;
export const RECORDING_STORAGE_FAILURE: string;

export interface RecorderSink {
  read?(id: string): string | null;

  append(id: string, text: string): unknown;

  keep(manifest: Record<string, unknown>): unknown;

  drop(id: string): void;
}

export interface RecordedClose {
  id: string;
  joints: string[] | null;
  reason: 'rung' | 'disconnect' | 'fault' | 'motion';
  manifest: Record<string, unknown> | null;
}

export interface RecorderOptions {
  spec: { family: string; ids: number[] };
  sink: RecorderSink;
  radians: (status: Record<string, unknown>) => Array<number | null>;
  clock?: () => number;
  newId?: () => string;
  onClosed?: (closed: RecordedClose) => void;
}

export function newOperateId(): string;

export class OperateRecorder {
  constructor(options: RecorderOptions);
  setContext(ask: unknown): boolean;
  motionContextChanged(): boolean;
  incidentContext(): {
    session: string | null;
    sceneId: string | null;
    modelHash: string | null;
    policyHash: string | null;
  };
  readRun(): RobotRun | null;
  beginMotion(value: unknown, connection: string, revision: number): boolean;
  endMotion(completion: string): void;
  failMotion(): void;
  setPolicy(hash: string | null): void;
  event(event: Record<string, unknown> & { event: string }): void;
  intent(joints: number[], at?: number): void;
  sample(ask: unknown): boolean;
  close(reason: RecordedClose['reason']): void;
}
