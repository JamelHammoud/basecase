import type { RobotTake, TakeContext, TakeRow } from './robotTake.mjs';

export const MAX_TAKE_SECONDS: number;

export function newTakeId(): string;

export interface TakeSink {
  open: (id: string, header: Record<string, unknown>) => void;
  append: (id: string, row: TakeRow) => void;
  finish: (result: { id: string; kept: boolean; take: RobotTake }) => void | Promise<unknown>;
}

type Status = { joints?: unknown } & Record<string, unknown>;

export function jointValues(status: Status, ids: readonly number[], key: string): Array<number | null> | null;

export interface TakeSample {
  twin?: ReadonlyArray<number | null> | null;
  input?: { id: string; values: ReadonlyArray<number | null> } | null;
}

export class TakeTap {
  constructor(options: {
    sink: TakeSink;
    emit: (event: Record<string, unknown> & { event: string }) => void;
    now: () => number;
    joints: () => string[];
    positionsOf: (status: Status) => Array<number | null>;
    ids: readonly number[];
    newId?: () => string;
  });
  readonly take: RobotTake | null;
  setContext(context: TakeContext): void;
  setPolicy(hash: string | null): void;
  event(event: Record<string, unknown> & { event: string }): void;
  intent(joints: ReadonlyArray<number | null>): void;
  sample(sample: TakeSample): void;
  close(fault: string | null): void;
}
