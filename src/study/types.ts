import type { SimModel } from '../sim/mjcfTypes';
import type { CaseRuns } from '../cases/caseRuns';
import type { PrinterSetup } from '../data/printers';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, Purchases, RobotPoseState, ScenePart } from '../types/robotics';
import type { SweepMetrics } from '../utils/designSweepTable';
import type { CheckRow, EngineeringReport, ServoOutput } from '../utils/engineeringTypes';
import type { V3 } from '../utils/kinematics';

type KnobLabel = { id: string; label?: string };

export type StudyKnob = KnobLabel &
  (
    | { kind: 'servo'; joints: string[]; values: string[] }
    | { kind: 'voltage'; values: number[] }
    | { kind: 'battery'; parts?: string[]; values: string[] }
    | { kind: 'battery_offset'; parts?: string[]; values: V3[] }
    | { kind: 'foot'; parts?: string[]; values: Array<{ length?: number; width?: number }> }
    | { kind: 'dimension'; part: string; name: string; values: number[] }
  );

export type StudySelection = number[];

export interface StudyScene {
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  triangles: Record<string, Float32Array>;
  meshFiles?: Record<string, ArrayBuffer>;
  printer?: PrinterSetup;
  servoOutputs?: Record<string, ServoOutput>;
}

export interface StudyRow {
  key: string;
  sceneKey: string;
  error?: string;
  selection: StudySelection;
  label: string;
  checks: CheckRow[];
  costUsd: number;
  massG: number;
  runtimeMinutes?: number;
  volts?: number;
  runs?: CaseRuns;
  metrics: SweepMetrics;
}

export interface StudyRecord {
  knobs: StudyKnob[];
  rows: StudyRow[];
  seed: number;
  caseId?: string;
  caseKey?: string;
  baseKey: string;
  total: number;
  current: StudyRow;
  base: { parts: ScenePart[]; project: Omit<ProjectSettings, 'study'> };
}

export interface StudyDimension {
  scene: StudyScene;
  part: string;
  values: Record<string, number>;
}

export interface StudySceneOptions {
  dimension?: (input: StudyDimension) => Promise<StudyScene>;
  geometry?: (scene: StudyScene, changed: string[]) => Promise<StudyScene>;
}

export interface StudyGradeOptions {
  knobs: StudyKnob[];
  selection: StudySelection;
  purchases?: Purchases;
  runs?: CaseRuns;
  kase?: { id: string; name: string };
  checks?: CheckRow[];
}

export interface StudyOptions extends StudySceneOptions {
  knobs: StudyKnob[];
  seed?: number;
  limit?: number;
  purchases?: Purchases;
  runs?: (scene: StudyScene) => Promise<CaseRuns>;
  grade?: (scene: StudyScene, options: StudyGradeOptions) => Promise<StudyRow>;
  onRow?: (row: StudyRow) => void;
  stopped?: () => boolean;
}

export interface StudyHoldOptions {
  pose?: RobotPoseState;
  posedFloor?: number | null;
}

export interface StudyHoldInput {
  report: Pick<EngineeringReport, 'joints' | 'massG'>;
  model: SimModel;
}
