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

export const statusPositions = (
  status: RobotStatus,
  ids: readonly number[],
  calibration?: readonly RobotMount[],
): Array<number | null> => ids.map((id) => statusRadians(status, calibration, id));

function trimmed<T extends { at: number }>(entries: T[], newest: number): T[] {
  const from = newest - RUN_SECONDS * 1000;
  const keep = entries.findIndex((e) => e.at >= from);

  return keep <= 0 ? entries : entries.slice(keep);
}

export class RunBuffer {
  private statuses: RunStatus[] = [];

  private intents: RunIntent[] = [];

  status(at: number, positions: Array<number | null>) {
    this.statuses.push({ at, positions });
    this.trim(at);
  }

  intent(at: number, joints: number[]) {
    this.intents.push({ at, joints: [...joints] });
    this.trim(at);
  }

  clear() {
    this.statuses = [];
    this.intents = [];
  }

  kept(): Pick<RobotRun, 'statuses' | 'intents'> {
    return { statuses: [...this.statuses], intents: [...this.intents] };
  }

  private trim(newest: number) {
    this.statuses = trimmed(this.statuses, newest);
    this.intents = trimmed(this.intents, newest);
  }
}

export const replayable = (run: RobotRun | null | undefined): run is RobotRun =>
  !!run && run.statuses.length > 0 && run.intents.some((i) => i.at >= run.statuses[0].at);
