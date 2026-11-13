import type { ServoFit } from '../data/components';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotPoseState, ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import type { Eye } from './eyes';
import type { RobotMorphology } from './morphology';

export const SIM_MODEL_VERSION = 1;

export type SimDrive = 'position' | 'velocity';

export interface SimBody {
  name: string;
  parts: string[];
  world?: string[];
  origin: V3;
  robot?: string;
  parent?: string;
  joint?: string;
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
  dynamics: 'measured' | 'estimated';
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
  fingerprint: string;
}

export interface SimModel {
  version: number;
  xml: string;
  bodies: SimBody[];
  joints: SimJoint[];
  robots: SimRobot[];
  initial: RobotPoseState;
  massKg: Record<string, number>;
  scans?: Eye[];
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
  servoFits?: Record<string, JointServoFit>;
}

export interface JointServoFit {
  fit: ServoFit;
  volts: number;
}
