import type { CameraSpec, SilhouetteShot } from './fitCapture';
import type { FixedCamera } from '../../cameras/fixed';
import type { ThreeMfFileSpec } from '../analysis/analysisOps';
import type { MeshData } from '../../print/threeMf';
import type * as THREE from 'three';
import type { Coplanar, Interference } from '../interference';
import type { ChainResult } from '../../assembly/assemblyTypes';
import type { AssemblyGeometry } from '../../assembly/assemblyGeometry';
import type { ShapeReport } from '../analysis/shapeReports';
import type { SweepSpec } from '../analysis/sweep';
import type { MeshMeasure } from '../meshMeasure';
import type {
  CameraPreset,
  MeasureUnit,
  SceneMark,
  ScenePart,
  SculptMeshData,
  SculptSettings,
  TrackpadGestureMode,
  TransformMode,
} from '../../types/robotics';

export type Vec3 = [number, number, number];

export type FigureKind = 'human' | 'dog';

export type MeasureKind = 'ruler' | FigureKind;

export type FigurePlacements = Partial<Record<FigureKind, Vec3>>;

export const DEFAULT_HUMAN_HEIGHT_MM = 1753;

export interface PartTransformUpdate {
  id: string;
  position: Vec3;
  rotation: Vec3;
  dimensions?: ScenePart['dimensions'];
}

export interface PoseJointTarget {
  id: string;
  type: 'revolute' | 'prismatic';
  origin: THREE.Vector3;
  axis: THREE.Vector3;
}

export type GrabPhase = 'start' | 'move' | 'end';

export type GrabHandler = (
  partIds: string[],
  hand: { position: THREE.Vector3; turn: THREE.Quaternion | null } | null,
  phase: GrabPhase,
) => void;

export interface SkeletonView {
  joints: Array<{ id: string; at: Vec3; color: string }>;
  bones: Array<[Vec3, Vec3]>;
}

export interface SkeletonDragEvent {
  id: string;
  delta: Vec3;
  phase: GrabPhase;
  alone: boolean;
}

export interface AgentFrame {
  key: string;
  color: string;
  partIds: string[];
  emphasis: 'focus' | 'normal' | 'dim';
}

export interface ViewportProps {
  sceneKey?: string;
  parts: ScenePart[];
  selectedPartIds: string[];
  transformMode: TransformMode;
  sculptSettings: SculptSettings;
  snapStepMm: number;
  snapAngleDeg: number;
  trackpadMode: TrackpadGestureMode;
  showGrid: boolean;
  blueprintDataUrl?: string | null;
  onSelectPart: (id: string | null, additive?: boolean, drill?: boolean) => void;
  onMarqueeSelect?: (ids: string[]) => void;
  onUpdatePartsTransform?: (updates: PartTransformUpdate[]) => void;
  onUpdatePartTransform: (id: string, position: Vec3, rotation: Vec3, dimensions?: ScenePart['dimensions']) => void;
  onCommitSculptMesh: (id: string, sculptMesh: SculptMeshData) => void;
  annotateMode?: boolean;
  measureMode?: boolean;
  measureUnit?: MeasureUnit;
  measureKind?: MeasureKind;
  figures?: FigurePlacements;
  humanHeightMm?: number;
  onPlaceFigure?: (kind: FigureKind, point: Vec3) => void;
  onPlaceAnnotation?: (point: Vec3, partId: string | null) => void;
  markMode?: boolean;
  marks?: SceneMark[];
  markColor?: string;
  markTool?: MarkTool;
  selectedMarkId?: string | null;
  agentFrames?: AgentFrame[];
  fixedCameras?: FixedCamera[];
  onAddMark?: (mark: NewMark) => void;
  onSelectMark?: (id: string | null) => void;
  onEraseMarks?: (ids: string[]) => void;
  onMoveMark?: (move: MarkMove) => void;
  paused?: boolean;
  pose?: Map<string, THREE.Matrix4> | null;
  worldParts?: ScenePart[];
  poseJoint?: PoseJointTarget | null;
  onPoseJoint?: (id: string, delta: number, phase: GrabPhase) => void;
  onGrab?: GrabHandler | null;
  skeleton?: SkeletonView | null;
  onSkeletonDrag?: (drag: SkeletonDragEvent) => void;
  onSkeletonPick?: (id: string, at: { x: number; y: number }) => void;
}

export type MarkTool = 'marker' | 'eraser';

export interface MarkMove {
  id: string;
  points: Vec3[];
  partIds: string[];
}

export interface NewMark {
  points: Vec3[];
  partIds: string[];
  view: string;
}

export interface ClashHit {
  a: string;
  b: string;
  depthMm: number;
  angle: number;
}

export interface ViewShot {
  position: Vec3;
  target: Vec3;
  hfovDeg: number;
}

export interface Viewport3DHandle {
  captureScreenshot: () => string;
  currentView: () => ViewShot;
  lookThrough: (shot: Pick<ViewShot, 'position' | 'target'>) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  focusSelected: () => void;
  zoomBy: (factor: number) => void;
  pickAt: (clientX: number, clientY: number) => { partId: string | null; point: Vec3 } | null;
  captureViews: (
    views: string[],
    onlyIds?: string[],
    opts?: { silhouette?: boolean; maxSide?: number; labels?: string[]; grid?: boolean },
  ) => Promise<Array<{ view: string; dataUrl: string; labels?: number[] }>>;
  interference: (onlyIds?: string[]) => Promise<{ interferences: Interference[]; coplanar: Coplanar[] }>;
  fastenerChains: () => Promise<ChainResult>;
  assembly: (options: { serviceable: string[]; budgetMs: number; batteries?: string[] }) => Promise<AssemblyGeometry>;
  measureParts: (ids?: string[]) => Promise<Record<string, MeshMeasure>>;
  visibleShares: () => Promise<Record<string, number>>;
  printShapes: (
    ids: string[],
    faces?: Record<string, Array<[number, number, number]>>,
  ) => Promise<Record<string, ShapeReport>>;
  printMeshes: (ids: string[]) => Promise<Record<string, MeshData>>;
  printThreeMf: (files: ThreeMfFileSpec[], plateSize: [number, number]) => Promise<Record<string, Uint8Array>>;
  exportUsdz: () => Promise<Uint8Array>;
  partTriangles: (id: string) => Float32Array | null;
  servoOutput: (id: string) => { point: Vec3; axis: Vec3 } | null;
  meshesReady: () => Promise<string[]>;
  sweepClashes: (sweeps: SweepSpec[]) => Promise<ClashHit[][]>;
  frameAll: () => void;
  animateSpawn: (ids: string[]) => void;
  setPose: (deltas: Map<string, THREE.Matrix4> | null, worldDeltas?: Map<string, THREE.Matrix4> | null) => void;
  followPart: (partId: string | null) => void;
  restBounds: (ids: string[]) => { min: Vec3; max: Vec3 } | null;
  silhouetteShots: (specs: CameraSpec[], opts: { onlyIds?: string[]; maxSide: number }) => SilhouetteShot[];
  posedInterference: (onlyIds?: string[], riders?: Record<string, string[]>) => Promise<Interference[]>;
  posedFloor: (ids?: string[]) => Promise<number | null>;
  meshGaps: (pairs: Array<[string, string]>, withinMm: number) => Promise<Array<[string, string]>>;
  projectPoints: (points: Vec3[]) => Array<{ x: number; y: number; visible: boolean }>;
  measureFrom: (clientX: number, clientY: number) => void;
  cancelMeasure: () => boolean;
}

export const MIN_DIST = 25;
export const MAX_DIST = 12000;
export const FAR_PLANE = 80000;
export const MIN_POLAR = 0.08;
export const MAX_POLAR = Math.PI - 0.08;
