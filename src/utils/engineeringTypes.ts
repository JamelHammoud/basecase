import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import type { V3 } from './engineeringMath';

export interface PartMass {
  id: string;
  grams: number;
  centroid: V3;
  source: 'catalog' | 'published' | 'printed' | 'hardware' | 'supply' | 'estimate';
}

export interface ServoOutput {
  point: V3;
  axis: V3;
}

export interface CheckRow {
  check: string;
  status: 'pass' | 'warn' | 'fail' | 'not run';
  detail: string;
  ids?: string[];
  items?: Array<{ text: string; ids?: string[] }>;
}

export interface JointLoad {
  joint: RobotJoint;
  massG: number;
  swingNm: number;
  stanceNm: number;
  staticNm: number;
  stallNm?: number;
  ratedNm?: number;
  status: CheckRow['status'];
}

export interface EngineeringInputs {
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  servoOutputs: Record<string, ServoOutput>;
  sweep?: (request: SweepRequest) => Array<{ a: string; b: string; depthMm: number; angle: number }>;
}

export interface SweepRequest {
  moving: string[];
  origin: V3;
  axis: V3;
  anglesDeg: number[];
  actuators?: string[];
}

export interface EngineeringReport {
  rows: CheckRow[];
  joints: JointLoad[];
  massG: number;
  com: V3;
  masses: PartMass[];
}

export interface CheckContext {
  input: EngineeringInputs;
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  joints: RobotJoint[];
  byPart: Map<string, ScenePart>;
  byId: Map<string, PartMass>;
  all: { grams: number; com: V3 };
  onFloor: ScenePart[];
  servos: ScenePart[];
}
