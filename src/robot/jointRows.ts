import type { CalibrationHistory } from '../reality/history';
import type { RobotJoint } from '../types/robotics';
import type { JointStatus } from './robotState';
import { servoLayout } from './sceneRobot';

export interface JointRow {
  busId: number;
  joint: RobotJoint | null;
  reading: JointStatus | null;
  history: CalibrationHistory | null;
}

export interface RobotConnection {
  ids: readonly number[];
  jointIds: readonly string[] | null;
  readings: readonly JointStatus[];
}

export interface JointRowsInput {
  joints: readonly RobotJoint[];
  calibrations: Record<string, CalibrationHistory> | undefined;
  connection: RobotConnection | null;
}

const recorded = (history: CalibrationHistory | undefined) => (history?.versions.length ? history : null);

function connectedRows({ joints, calibrations, connection }: JointRowsInput & { connection: RobotConnection }) {
  const byId = new Map(joints.map((j) => [j.id, j]));

  return connection.ids.map((busId, i): JointRow => {
    const joint = byId.get(connection.jointIds?.[i] ?? '') ?? null;

    return {
      busId,
      joint,
      reading: connection.readings.find((r) => r.id === busId) ?? null,
      history: joint ? recorded(calibrations?.[joint.id]) : null,
    };
  });
}

export function jointRows(input: JointRowsInput): JointRow[] {
  const { joints, calibrations, connection } = input;

  if (connection) return connectedRows({ ...input, connection });

  const layout = servoLayout(joints);
  const rows = layout.movable.map((joint, i): JointRow => ({
    busId: layout.ids[i],
    joint,
    reading: null,
    history: recorded(calibrations?.[joint.id]),
  }));

  return rows.some((r) => r.history) ? rows : [];
}
