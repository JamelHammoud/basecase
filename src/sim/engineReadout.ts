import type { MjData } from '@mujoco/mujoco';
import { Matrix4, Vector3 } from 'three';
import { simDelta } from './mjcfFrames';
import type { DriveHand, DriveLoop } from './drive';
import type { SimStats } from './engineStats';
import type { ActuatorFaults, FaultKind } from './faults';
import type { SimModel } from './mjcfTypes';

export function effectorAt(model: SimModel, poses: Float64Array, { part, point }: DriveHand): [number, number, number] {
  const delta = simDelta(model, poses, part);

  return new Vector3(...point).applyMatrix4(delta ?? new Matrix4()).toArray();
}

export interface EngineRobot {
  key: string;
  rootQpos: number;
  rootDof: number;
  rootBody: number;
  floating: boolean;
  joints: number[];
  startZ: number;
  startXY: [number, number];
}

interface EngineReadout {
  data: MjData;
  sim: SimModel;
  robots: EngineRobot[];
  fellAt: Map<string, number>;
  peaks: Float64Array;
  saturated: Float64Array;
  faults: ActuatorFaults;
  drive: DriveLoop | null;
  tiltOf: (robot: EngineRobot) => number;
  handAt: (hand: DriveHand) => [number, number, number];
}

function faultField(faults: ActuatorFaults, actuator: number): { fault?: FaultKind } {
  const fault = actuator >= 0 ? faults.kindOf(actuator) : undefined;

  return fault ? { fault } : {};
}

export function readEngineStats(input: EngineReadout, rtf = 1): SimStats {
  const { data } = input;

  return {
    time: data.time,
    rtf,
    robots: input.robots.map((r) => {
      const x = data.xpos[r.rootBody * 3],
        y = data.xpos[r.rootBody * 3 + 1];

      return {
        key: r.key,
        fellAt: input.fellAt.get(r.key) ?? null,
        height: data.xpos[r.rootBody * 3 + 2] - r.startZ,
        tilt: input.tiltOf(r),
        travelled: Math.hypot(x - r.startXY[0], y - r.startXY[1]),
        forward: -(y - r.startXY[1]),
        speed: r.rootDof >= 0 ? Math.hypot(data.qvel[r.rootDof], data.qvel[r.rootDof + 1]) : 0,
      };
    }),
    joints: input.sim.joints.map((j, i) => ({
      id: j.id,
      peak: input.peaks[i],
      saturatedS: input.saturated[i],
      ...faultField(input.faults, j.actuator),
    })),
    ...(input.drive?.hand ? { effector: input.handAt(input.drive.hand) } : {}),
    ...(input.drive?.hands ? { effectors: input.drive.hands.map((h) => input.handAt(h)) } : {}),
  };
}

export function robotTilt(data: MjData, body: number): number {
  return Math.acos(Math.max(-1, Math.min(1, data.xmat[body * 9 + 8]))) / (Math.PI / 180);
}
