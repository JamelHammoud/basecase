import type { CalibrationHistory } from '../reality/history';
import { jointServo, offTheBus } from '../reality/servoPart';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { radiansFromCounts, mountOf, type JointStatus, type RobotMount } from './robotState';
import { servoLayout } from './sceneRobot';

export interface JointRow {
  busId: number;
  joint: RobotJoint | null;
  reading: JointStatus | null;
  radians: number | null;
  history: CalibrationHistory | null;
}

export interface RobotConnection {
  ids: readonly number[];
  jointIds: readonly string[] | null;
  readings: readonly JointStatus[];
  calibration?: readonly RobotMount[];
}

export interface JointRowsInput {
  joints: readonly RobotJoint[];
  parts?: readonly ScenePart[];
  calibrations: Record<string, CalibrationHistory> | undefined;
  connection: RobotConnection | null;
}

const recorded = (history: CalibrationHistory | undefined) => (history?.versions.length ? history : null);

function connectedRows({
  joints,
  parts = [],
  calibrations,
  connection,
}: JointRowsInput & { connection: RobotConnection }) {
  const byId = new Map(joints.map((j) => [j.id, j]));

  return connection.ids.map((busId, i): JointRow => {
    const joint = byId.get(connection.jointIds?.[i] ?? '') ?? null;
    const answers = !offTheBus(jointServo(joint ?? undefined, parts));
    const reading = (answers && connection.readings.find((r) => r.id === busId)) || null;
    const position = reading?.position;

    return {
      busId,
      joint,
      reading,
      radians:
        typeof position === 'number' ? radiansFromCounts(position, mountOf(connection.calibration, busId)) : null,
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
    radians: null,
    history: recorded(calibrations?.[joint.id]),
  }));

  return rows.some((r) => r.history) ? rows : [];
}
