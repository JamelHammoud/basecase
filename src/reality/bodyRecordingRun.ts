import { readOperateLog, type OperateLog } from '../robot/operateLog';
import type { RobotRun } from '../robot/runBuffer';
import { BODY_ANALYSIS_LIMITS as LIMITS } from './bodyAnalysisTypes';
import { recordedMotionMatches, type MotionRecording } from '../../electron/robot/bodyMotionRecording.mjs';

export interface BodyRecordingRequest {
  motion?: MotionRecording;
  session: string;
  id: string;
  joints: string[];
}

export function readBodyRecording({ session, joints, motion }: BodyRecordingRequest): RobotRun | null {
  if (session.length > 1_048_576 || joints.length > LIMITS.joints) return null;

  const log = checkedSession(session, joints.length);

  if (!log || (motion && !recordedMotionMatches(session, motion))) return null;

  if (motion) return { ...bodyRunFromLog(log, joints), observations: motion.backend };

  if (!log.statuses.length) return null;

  const end = log.statuses.at(-1)!.t;
  const statuses = log.statuses.filter((sample) => sample.t >= end - LIMITS.durationMs / 1000);
  const first = statuses[0].t;
  const previous = log.intents.findLast((sample) => sample.t < first);
  const intents = log.intents.filter((sample) => sample.t >= first);

  if (previous) intents.unshift(previous);

  return bodyRunFromLog({ ...log, statuses, intents }, joints);
}

function bodyRunFromLog(log: OperateLog, joints: string[]): RobotRun {
  return {
    joints: [...joints],
    statuses: log.statuses.map((sample) => ({ at: sample.t * 1000, positions: sample.q })),
    intents: log.intents.map((sample) => ({ at: sample.t * 1000, joints: sample.q })),
    faultJoint: null,
    faultAt: 0,
    message: '',
  };
}

function checkedSession(text: string, joints: number): OperateLog | null {
  try {
    return checkedSessionLines(text, joints);
  } catch {
    return null;
  }
}

function checkedSessionLines(text: string, joints: number): OperateLog | null {
  const raw = text.split('\n').filter(Boolean);

  if (raw.length > 8192) return null;

  const lines: unknown[] = raw.map((line) => JSON.parse(line));

  const log = readOperateLog(text);
  const samples = [
    ...log.statuses.map((sample) => ({ at: sample.t, values: sample.q })),
    ...log.intents.map((sample) => ({ at: sample.t, values: sample.q })),
  ];

  const valid =
    log.statuses.length <= LIMITS.inputSamples &&
    log.intents.length <= LIMITS.intents &&
    samples.every((sample) => Number.isFinite(sample.at) && sample.at >= 0 && sample.values.length === joints) &&
    log.statuses.every((sample, index) => index === 0 || sample.t > log.statuses[index - 1].t) &&
    log.intents.every((sample, index) => index === 0 || sample.t >= log.intents[index - 1].t) &&
    lines.every((line) => validSessionLine(line, joints));

  return valid ? log : null;
}

function validSessionLine(line: unknown, joints: number): boolean {
  if (typeof line !== 'object' || line === null || !('k' in line) || !('t' in line)) return false;

  if (typeof line.t !== 'number' || !Number.isFinite(line.t * 1000) || line.t < 0) return false;

  if (line.k !== 'status' && line.k !== 'intent') return true;

  if (!('q' in line) || !Array.isArray(line.q) || line.q.length !== joints) return false;

  return line.q.every(
    (value) => (line.k === 'status' && value === null) || (typeof value === 'number' && Number.isFinite(value)),
  );
}
