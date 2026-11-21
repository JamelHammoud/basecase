import { schemaKey } from '../../topics/schemas';
import type { Recording } from '../../sim/recorder';
import type { DriveSetup } from '../../sim/drive';

const VECTOR_UNITS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'sensor_msgs/Imu': { angular_velocity: 'rad/s', linear_acceleration: 'm/s²' },
  'nav_msgs/Odometry': { 'pose.pose.position': 'm', 'twist.twist.linear': 'm/s', 'twist.twist.angular': 'rad/s' },
  'geometry_msgs/PoseStamped': { 'pose.position': 'm' },
};

export function comparisonUnit(schema: string, path: string): string | null {
  const vectors = VECTOR_UNITS[schemaKey(schema)];
  const axis = path.slice(path.lastIndexOf('.') + 1);

  if (!vectors || !['x', 'y', 'z'].includes(axis)) return null;

  return vectors[path.slice(0, path.lastIndexOf('.'))] ?? null;
}

function driveJointUnit(setup: DriveSetup, id: string, depth = 0): string | null {
  if (depth > 8) return null;

  if (setup.kind === 'team')
    return (
      setup.members.map((member) => driveJointUnit(member.setup, id, depth + 1)).find((unit) => unit !== null) ?? null
    );

  if (setup.kind === 'rover') return setup.wheels.some((wheel) => wheel.joint === id) ? 'rad' : null;

  if (setup.kind !== 'arm' && setup.kind !== 'legs') return null;

  const joint = setup.rig.byId.get(id);

  if (!joint) return null;

  return joint.type === 'prismatic' ? 'm' : 'rad';
}

export function recordedJointUnit(recording: Recording, id: string) {
  return recording.controller?.kind === 'drive' ? driveJointUnit(recording.controller.setup, id) : null;
}
