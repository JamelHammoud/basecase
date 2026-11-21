import { readRecordedRun } from '../../electron/robot/recordedRun.mjs';
import { readOperateLog } from '../robot/operateLog';

export interface BodyRecordingRequest {
  session: string;
  id: string;
  joints: string[];
}

export function readBodyRecording({ session, id, joints }: BodyRecordingRequest) {
  if (session.length > 1_048_576 || joints.length > 16 || !checkedSession(session, joints.length)) return null;

  return readRecordedRun({ read: () => session }, { id, joints });
}

function checkedSession(text: string, joints: number): boolean {
  try {
    return checkedSessionLines(text, joints);
  } catch {
    return false;
  }
}

function checkedSessionLines(text: string, joints: number): boolean {
  const raw = text.split('\n').filter(Boolean);

  if (raw.length > 8192) return false;

  const lines: unknown[] = raw.map((line) => JSON.parse(line));

  const log = readOperateLog(text);
  const samples = [
    ...log.statuses.map((sample) => ({ at: sample.t, values: sample.q })),
    ...log.intents.map((sample) => ({ at: sample.t, values: sample.q })),
  ];

  return (
    samples.every((sample) => Number.isFinite(sample.at) && sample.at >= 0 && sample.values.length === joints) &&
    log.statuses.every((sample, index) => index === 0 || sample.t > log.statuses[index - 1].t) &&
    log.intents.every((sample, index) => index === 0 || sample.t >= log.intents[index - 1].t) &&
    lines.every((line) => validSessionLine(line, joints))
  );
}

function validSessionLine(line: unknown, joints: number): boolean {
  if (typeof line !== 'object' || line === null || !('k' in line) || !('t' in line)) return false;

  if (!Number.isFinite(line.t)) return false;

  if (line.k !== 'status' && line.k !== 'intent') return true;

  if (!('q' in line) || !Array.isArray(line.q) || line.q.length !== joints) return false;

  return line.q.every(
    (value) => (line.k === 'status' && value === null) || (typeof value === 'number' && Number.isFinite(value)),
  );
}
