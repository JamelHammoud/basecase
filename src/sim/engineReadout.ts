import type { MjData } from '@mujoco/mujoco';
import type { DriveHand, DriveLoop } from './drive';
import type { SimStats } from './engineStats';
import type { ActuatorFaults, FaultKind } from './faults';
import type { SimModel } from './mjcfTypes';

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
