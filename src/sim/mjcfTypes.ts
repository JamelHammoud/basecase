import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import type { RobotMorphology } from './morphology';

export const SIM_MODEL_VERSION = 0;

export type SimDrive = 'position' | 'velocity';

export interface SimBody {
  name: string;
  parts: string[];
  world?: string[];
  origin: V3;
}

export type WorldBehavior = 'static' | 'dynamic' | 'marker';

export interface WorldItem extends ScenePart {
  behavior: WorldBehavior;
}

export interface SimJoint {
  id: string;
  name: string;
  type: 'revolute' | 'prismatic';
  range?: [number, number];
  effort: number;
  effortSource: 'servo' | 'published' | 'estimate';
  robot: string;
  drive: SimDrive;
  actuator: number;
}

export interface SimRobot {
  key: string;
  name: string;
  root: string;
  floating: boolean;
  morphology: RobotMorphology;
  joints: string[];
}

export interface SimModel {
  version: number;
  xml: string;
  bodies: SimBody[];
  joints: SimJoint[];
  robots: SimRobot[];
  initial: RobotPoseState;
  massKg: Record<string, number>;
  warnings: string[];
}

export interface MjcfInput {
  parts: ScenePart[];
  rig: Rig;
  project: ProjectSettings;
  pose?: RobotPoseState;
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
  posedFloor?: number | null;
  fixedBase?: Record<string, boolean>;
  timestep?: number;
  world?: WorldItem[];
  worldTriangles?: (id: string) => Float32Array | null;
}
