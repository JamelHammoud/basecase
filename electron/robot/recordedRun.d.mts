import type { RobotRun } from '../../src/robot/runBuffer';

export function readRecordedRun(
  sink: { read: (id: string) => string | null },
  recording: { id: string; joints: string[] },
): RobotRun | null;
