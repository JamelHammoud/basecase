import * as THREE from 'three';
import { activeCalibrations, activeMounts } from '../../reality/history';
import { busOf, jointServo } from '../../reality/servoPart';
import type { ServoCalibration, ServoPart } from '../../reality/types';
import type { ServoFamily } from '../../robot/robotState';
import { servoLayout, type ServoLayout } from '../../robot/sceneRobot';
import type { ProjectSettings, RobotJoint, ScenePart } from '../../types/robotics';
import type { SimJoint, SimModel } from '../mjcfTypes';

export const ZERO_COUNTS = 2048;

export interface JointMapEntry {
  id: number;
  name: string;
  joint: string;
  type: 'revolute' | 'continuous' | 'prismatic';
  family: ServoFamily | null;
  servo: ServoPart | null;
  zero_counts: number;
  direction: 1 | -1;
  min_rad?: number;
  max_rad?: number;
  min_m?: number;
  max_m?: number;
  calibration: ServoCalibration | null;
}

export interface JointMap {
  robot: string;
  class: ServoLayout['class'];
  joints: JointMapEntry[];
}

interface JointMapInput {
  model: Pick<SimModel, 'joints' | 'robots'>;
  project: ProjectSettings;
  parts: ScenePart[];
  name: string;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

function limits(sim: SimJoint | undefined): Partial<JointMapEntry> {
  if (!sim?.range) return {};

  const [lo, hi] = [Math.min(...sim.range), Math.max(...sim.range)];

  if (sim.type === 'prismatic') return { min_m: round(lo / 1000), max_m: round(hi / 1000) };

  return { min_rad: round(THREE.MathUtils.degToRad(lo)), max_rad: round(THREE.MathUtils.degToRad(hi)) };
}

function servoOf(j: RobotJoint, parts: readonly ScenePart[]) {
  const servo = jointServo(j, parts);
  const bus = servo ? busOf(servo) : undefined;

  return { family: bus === 'feetech' || bus === 'dynamixel' ? bus : null, servo };
}

function entryType(j: RobotJoint, sim: SimJoint | undefined): JointMapEntry['type'] {
  if (j.type === 'prismatic') return 'prismatic';

  return sim?.range ? 'revolute' : 'continuous';
}

export function jointMap({ model, project, parts, name }: JointMapInput): JointMap {
  const layout = servoLayout(project.joints ?? []);
  const calibrations = activeCalibrations(project.servoCalibrations);
  const mounts = activeMounts(project.servoCalibrations);
  const joints = layout.movable.map((j, i): JointMapEntry => {
    const sim = model.joints.find((s) => s.id === j.id);

    return {
      id: layout.ids[i],
      name: sim?.name ?? j.id,
      joint: j.name,
      type: entryType(j, sim),
      ...servoOf(j, parts),
      zero_counts: mounts[j.id]?.zeroCounts ?? ZERO_COUNTS,
      direction: mounts[j.id]?.direction ?? 1,
      ...limits(sim),
      calibration: calibrations[j.id] ?? null,
    };
  });

  return { robot: name, class: layout.class, joints };
}
