import { REPLAY_SECONDS, type Take } from '../../electron/robot/robotTake.mjs';

export const RUN_SECONDS = REPLAY_SECONDS;

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

export interface FaultRun {
  takeId: string | null;
  replayable: boolean;
  joints: string[];
  faultJoint: string | null;
  faultAt: number;
  message: string;
}

function rows(values: ArrayLike<number>, width: number, index: number): number[] {
  return Array.from({ length: width }, (_, k) => values[index * width + k]);
}

function tailFrom(times: ArrayLike<number>, from: number): number {
  let n = 0;

  while (n < times.length && times[n] < from) n++;

  return n;
}

export function runOfTake(take: Take, fault: Omit<FaultRun, 'takeId' | 'replayable'>): RobotRun {
  const width = take.joints.length;
  const end = take.frames ? take.t[take.frames - 1] : 0;
  const from = end - RUN_SECONDS;
  const statuses: RunStatus[] = [];
  const intents: RunIntent[] = [];

  for (let n = tailFrom(take.t, from); n < take.frames; n++)
    statuses.push({
      at: take.t[n] * 1000,
      positions: rows(take.position, width, n).map((v) => (Number.isNaN(v) ? null : v)),
    });

  for (let n = tailFrom(take.intentT, from); n < take.intentT.length; n++)
    intents.push({ at: take.intentT[n] * 1000, joints: rows(take.intent, width, n) });

  return { ...fault, joints: fault.joints.length === width ? fault.joints : take.joints, statuses, intents };
}

export const replayable = (run: RobotRun | null | undefined): run is RobotRun =>
  !!run && run.statuses.length > 0 && run.intents.some((i) => i.at >= run.statuses[0].at);

export const faultReplayable = (fault: FaultRun | null | undefined): fault is FaultRun & { takeId: string } =>
  !!fault?.takeId && fault.replayable;
