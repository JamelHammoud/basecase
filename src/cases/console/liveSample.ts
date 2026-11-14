import type { DriveCommand } from '../../sim/driveTypes';
import type { RobotStat } from '../../sim/engineStats';
import type { SimModel } from '../../sim/mjcfTypes';
import { endPoint, type ProbeReader, type ProbeWorld } from '../probes';
import type { SignalSample } from './signalBus';

const D2R = Math.PI / 180;

export interface LiveMoment {
  model: SimModel;
  joints: ArrayLike<number>;
  poses: Float64Array;
  robot: RobotStat | undefined;
  time: number;
  running: boolean;
  world: ProbeWorld;
  reader: ProbeReader;
  inputs: Record<string, DriveCommand | null>;
  goal: SignalSample['goal'];
  cameras: string[];
  gestures?: Record<string, number>;
}

export const liveJoints = (model: SimModel, joints: ArrayLike<number>): SignalSample['joints'] =>
  model.joints.map((j, i) => {
    const unit = j.type === 'revolute' ? D2R : 0.001;

    return { id: j.id, target: joints[i * 3] / unit, position: joints[i * 3 + 1] / unit, effort: joints[i * 3 + 2] };
  });

export function liveSample(m: LiveMoment): SignalSample {
  const probes: Record<string, number[]> = {};

  m.reader.sample(m.poses, probes);

  const base = endPoint('base', m.world, m.poses);
  const { robot } = m;

  return {
    time: m.time,
    running: m.running,
    joints: liveJoints(m.model, m.joints),
    robot: {
      ...(robot && { height: robot.height, tilt: robot.tilt, speed: robot.speed, travelled: robot.travelled }),
      x: base.x,
      z: base.z,
    },
    probes: Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, v.at(-1) ?? 0])),
    inputs: m.inputs,
    goal: m.goal,
    cameras: m.cameras,
    gestures: m.gestures,
  };
}
