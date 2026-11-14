export const MIN_SECONDS: number;
export const MOVED_RAD: number;
export const MAX_INPUT_VALUES: number;
export const POLICY_RUNG: string;

export interface RecorderSink {
  append(id: string, text: string): void;
  keep(manifest: Record<string, unknown>): void;
  drop(id: string): void;
}

export interface RecordedClose {
  id: string;
  reason: 'rung' | 'disconnect' | 'fault';
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
  setPolicy(hash: string | null): void;
  event(event: Record<string, unknown> & { event: string }): void;
  intent(joints: number[]): void;
  sample(ask: unknown): boolean;
  close(reason: RecordedClose['reason']): void;
}
