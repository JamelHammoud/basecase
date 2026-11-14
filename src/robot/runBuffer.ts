import type { OperateLog } from './operateLog';
import { statusRadians, type RobotMount, type RobotStatus } from './robotState';

export const RUN_SECONDS = 20;

export interface RunStatus {
  at: number;
  positions: Array<number | null>;
}

export interface RunIntent {
  at: number;
  joints: number[];
}

export interface RobotRun {
  joints: string[];
  statuses: RunStatus[];
  intents: RunIntent[];
  faultJoint: string | null;
  faultAt: number;
  message: string;
}

export type RunFault = Pick<RobotRun, 'joints' | 'faultJoint' | 'faultAt' | 'message'>;

export const statusPositions = (
  status: RobotStatus,
  ids: readonly number[],
  calibration?: readonly RobotMount[],
): Array<number | null> => ids.map((id) => statusRadians(status, calibration, id));

export function runOf(log: OperateLog, fault: RunFault): RobotRun {
  const newest = Math.max(log.statuses.at(-1)?.t ?? 0, log.intents.at(-1)?.t ?? 0);
  const from = newest - RUN_SECONDS;

  return {
    ...fault,
    statuses: log.statuses.filter((s) => s.t >= from).map((s) => ({ at: s.t * 1000, positions: s.q })),
    intents: log.intents.filter((i) => i.t >= from).map((i) => ({ at: i.t * 1000, joints: i.q })),
  };
}

export const replayable = (run: RobotRun | null | undefined): run is RobotRun =>
  !!run && run.statuses.length > 0 && run.intents.some((i) => i.at >= run.statuses[0].at);
