import type * as THREE from 'three';
import type { Coplanar, Interference } from '../interference';
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
  onPlaceAnnotation?: (point: Vec3, partId: string | null) => void;
  markMode?: boolean;
  marks?: SceneMark[];
  markColor?: string;
  selectedMarkId?: string | null;
  onAddMark?: (mark: NewMark) => void;
  onSelectMark?: (id: string | null) => void;
  paused?: boolean;
  pose?: Map<string, THREE.Matrix4> | null;
  poseJoint?: PoseJointTarget | null;
  onPoseJoint?: (id: string, delta: number, phase: GrabPhase) => void;
  onGrab?: GrabHandler | null;
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

export interface Viewport3DHandle {
  captureScreenshot: () => string;
  setCameraPreset: (preset: CameraPreset) => void;
  focusSelected: () => void;
  zoomBy: (factor: number) => void;
  pickAt: (clientX: number, clientY: number) => { partId: string | null; point: Vec3 } | null;
  captureViews: (
    views: string[],
    onlyIds?: string[],
    opts?: { silhouette?: boolean },
  ) => Array<{ view: string; dataUrl: string }>;
  interference: (onlyIds?: string[]) => { interferences: Interference[]; coplanar: Coplanar[] };
  measureParts: (ids?: string[]) => Record<string, MeshMeasure>;
  partTriangles: (id: string) => Float32Array | null;
  servoOutput: (id: string) => { point: Vec3; axis: Vec3 } | null;
  sweepClashes: (moving: string[], origin: Vec3, axis: Vec3, anglesDeg: number[]) => ClashHit[];
  frameAll: () => void;
  animateSpawn: (ids: string[]) => void;
  setPose: (deltas: Map<string, THREE.Matrix4> | null) => void;
  restBounds: (ids: string[]) => { min: Vec3; max: Vec3 } | null;
  posedInterference: (onlyIds?: string[]) => Interference[];
  posedFloor: (ids?: string[]) => number | null;
  projectPoints: (points: Vec3[]) => Array<{ x: number; y: number; visible: boolean }>;
  measureFrom: (clientX: number, clientY: number) => void;
  cancelMeasure: () => boolean;
}

export const MIN_DIST = 25;
export const MAX_DIST = 12000;
export const FAR_PLANE = 80000;
export const MIN_POLAR = 0.08;
export const MAX_POLAR = Math.PI - 0.08;
