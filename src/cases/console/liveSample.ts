import type { SimModel } from '../../sim/mjcfTypes';
import type { RobotStat } from '../../sim/engineStats';
import { endPoint, type ProbeReader, type ProbeWorld } from '../probes';
import type { SignalSample } from './signalBus';

const D2R = Math.PI / 180;

export const jointUnit = (type: SimModel['joints'][number]['type']) => (type === 'revolute' ? D2R : 0.001);

export const frameJoints = (model: SimModel, joints: ArrayLike<number>): SignalSample['joints'] =>
  model.joints.map((j, i) => {
    const unit = jointUnit(j.type);

    return { id: j.id, target: joints[i * 3] / unit, position: joints[i * 3 + 1] / unit, effort: joints[i * 3 + 2] };
  });

export function lastProbes(reader: ProbeReader, poses: Float64Array): Record<string, number> {
  const read: Record<string, number[]> = {};

  reader.sample(poses, read);

  return Object.fromEntries(Object.entries(read).map(([k, v]) => [k, v.at(-1) ?? 0]));
}

type RobotReading = Pick<RobotStat, 'height' | 'tilt' | 'speed' | 'travelled'>;

export function liveRobot(robot: RobotReading | undefined, world: ProbeWorld, poses: Float64Array) {
  const base = endPoint('base', world, poses);

  return {
    ...(robot && { height: robot.height, tilt: robot.tilt, speed: robot.speed, travelled: robot.travelled }),
    x: base.x,
    z: base.z,
  };
}
