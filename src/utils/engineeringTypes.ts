import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, Purchases, RobotJoint, ScenePart } from '../types/robotics';
import type { BomInput } from './bom';
import type { RobotBody } from './engineeringBody';
import type { V3 } from './engineeringMath';
import type { ArmModel, PayloadMap } from './payload';
import type { ChainResult } from '../assembly/assemblyTypes';
import type { StrengthJob, StrengthReading } from '../strength/types';
import type { Netlist } from '../wiring/netlist';

export interface PartMass {
  id: string;
  grams: number;
  centroid: V3;
  source: 'catalog' | 'published' | 'printed' | 'hardware' | 'supply' | 'estimate';
}

export interface ServoLine {
  point: V3;
  axis: V3;
}

export interface ServoOutput extends ServoLine {
  alternates?: ServoLine[];
}

export interface CheckDot {
  at: V3;
  shade: number;
}

export type FindingFix =
  | { kind: 'print-face'; part: string; down: V3 }
  | { kind: 'calibrate'; joints: string[] }
  | { kind: 'new-case' }
  | { kind: 'replay-fall'; deg: number };

export interface CheckRow {
  check: string;
  status: 'pass' | 'warn' | 'fail' | 'not run';
  detail: string;
  ids?: string[];
  items?: Array<{ text: string; ids?: string[]; status?: 'warn' | 'fail'; fix?: FindingFix; joint?: string }>;
  itemsAreContext?: boolean;
  detailInItems?: boolean;
  caseId?: string;
  dots?: CheckDot[];
  envelopes?: JointEnvelope[];
}

export interface JointLoad {
  joint: RobotJoint;
  massG: number;
  swingNm: number;
  stanceNm: number;
  crouchNm?: number;
  crouchDeg?: number;
  leverMm?: number;
  loadNm: number;
  kind: 'stance' | 'hold';
  stallNm?: number;
  ratedNm?: number;
  ratedEstimated?: boolean;
  peakNm?: number;
  volts?: number;
  noLoadRpm?: number;
  stallShare?: number;
  heatShare?: number;
  simRmsNm?: number;
  status: CheckRow['status'];
}

export interface WalkJoint {
  p99Nm: number;
  rmsNm: number;
  overS: number;
  samples?: Array<[rpm: number, nm: number]>;
}

export interface ServoCurve {
  stallNm: number;
  ratedNm: number;
  rpm: number;
}

export interface JointEnvelope {
  joint: string;
  label: string;
  samples: Array<[rpm: number, nm: number]>;
  servo: ServoCurve & { name: string };
  up?: ServoCurve & { name: string };
  outside: number;
}

export interface WalkAmps {
  avgA: number;
  peakA: number;
}

export interface WalkPower extends WalkAmps {
  joints: Record<string, WalkAmps>;
}

export interface WalkSim {
  policy: string;
  seconds: number;
  fellAt: number | null;
  joints: Record<string, WalkJoint>;
  power?: WalkPower;
}

export interface StoredWalk extends WalkSim {
  key: string;
}

export interface FallJoint {
  p99Nm: number;
  deg: number;
}

export interface FallSim {
  directions: number;
  tipped: number;
  joints: Record<string, FallJoint>;
}

export interface StoredFalls extends FallSim {
  key: string;
}

export interface EngineeringInputs {
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  servoOutputs: Record<string, ServoOutput>;
  purchases?: Purchases;
  supportG?: BomInput['supportG'];
  sweep?: (request: SweepRequest) => Array<{ a: string; b: string; depthMm: number; angle: number }>;
  walk?: WalkSim | string;
  falls?: FallSim | string;
  servoTouches?: string[];
  payload?: (arm: ArmModel) => PayloadMap | null;
  chains?: ChainResult | null;
  printDowns?: Record<string, V3>;
  strength?: (jobs: StrengthJob[]) => Array<StrengthReading | null>;
}

export interface SweepRequest {
  moving: string[];
  origin: V3;
  axis: V3;
  anglesDeg: number[];
  actuators?: string[];
}

export interface Stability {
  marginMm: number;
  tipDeg: number;
  heightMm: number;
  onALine: boolean;
}

export interface EngineeringReport {
  rows: CheckRow[];
  joints: JointLoad[];
  massG: number;
  com: V3;
  masses: PartMass[];
  stability?: Stability;
  wiring?: Netlist;
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
  bodies: RobotBody[];
}
