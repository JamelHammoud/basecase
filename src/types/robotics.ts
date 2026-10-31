import type { HardwareSpec } from '../data/hardware';
import type { CadExtras, PartRelations } from './cadAudit';
import type { ProjectRecords } from './projectRecords';

export type PartCategory =
  | 'custom_models'
  | 'actuators'
  | 'structure'
  | 'primitives'
  | 'motion'
  | 'sensors'
  | 'perception'
  | 'ai_markers'
  | 'hardware';

export type PartKind =
  | 'custom_model'
  | 'sculpt_mesh'
  | 'box'
  | 'cylinder'
  | 'tube'
  | 'sphere'
  | 'wedge'
  | 'torus'
  | 'cube'
  | 'cone'
  | 'pyramid'
  | 'hex_prism'
  | 'capsule'
  | 'dome'
  | 'image_plane'
  | 'hardware'
  | 'cad_part'
  | 'component'
  | 'mesh'
  | 'servo'
  | 'stepper_motor'
  | 'hinge_joint'
  | 'linear_actuator'
  | 'l_bracket'
  | 'u_bracket'
  | 'beam'
  | 'standoff'
  | 'wheel'
  | 'gripper'
  | 'bearing_block'
  | 'camera_module'
  | 'ultrasonic'
  | 'pcb_board'
  | 'hole_cylinder'
  | 'hole_box'
  | 'pivot_axis';

export type PartRole = 'solid' | 'cutout' | 'reference';

export interface PartDimensions {
  width: number;
  height: number;
  depth: number;
  thickness?: number;
  holeDiameter?: number;
}

export interface PartDeformers {
  taper?: number;
  bendDeg?: number;
  twistDeg?: number;
  roundness?: number;
}

export interface SculptMeshData {
  positions: number[];
  indices?: number[];
}

export type SculptBrushKind = 'inflate' | 'carve' | 'flatten' | 'smooth' | 'pinch' | 'grab';

export interface SculptSettings {
  brush: SculptBrushKind;
  radiusMm: number;
  strength: number;
  symmetryX: boolean;
  symmetryZ: boolean;
}

export interface ContourExtrudeData {
  outerLoop: Array<[number, number]>;
  holes?: Array<Array<[number, number]>>;
  bevel?: boolean;
}

export interface LatheProfileData {
  profilePoints: Array<[number, number]>;
  segments?: number;
}

export interface CustomModelSubNode {
  id: string;
  name: string;
  nodeType: 'primitive' | 'contour_extrude' | 'lathe' | 'sculpt_mesh';
  primitiveKind?: Exclude<PartKind, 'custom_model' | 'sculpt_mesh'>;
  role: PartRole;
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: PartDimensions;
  color: string;
  contour?: ContourExtrudeData;
  lathe?: LatheProfileData;
  sculptMesh?: SculptMeshData;
  deformers?: PartDeformers;
  part?: Omit<ScenePart, 'id' | 'position' | 'group'>;
}

export interface CustomModelDefinition {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  sourceType: 'image-to-3d-acp' | 'agent-acp' | 'scene-selection' | 'sculpt-draw';
  sourceImagePath?: string;
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  defaultDimensions: PartDimensions;
  defaultColor: string;
  mechanicalTag: string;
  nodes: CustomModelSubNode[];
}

export interface ScenePart extends PartRelations {
  id: string;
  name: string;
  kind: PartKind;
  category: PartCategory;
  role: PartRole;
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: PartDimensions;
  color: string;
  opacity?: number;
  note: string;
  mechanicalTag?: string;
  visible: boolean;
  locked: boolean;
  deformers?: PartDeformers;
  sculptMesh?: SculptMeshData;
  customModelId?: string;
  customNodes?: CustomModelSubNode[];
  sourceImageDataUrl?: string;
  cad?: {
    language: 'openscad' | 'replicad';
    code: string;
    positions: number[];
    indices: number[];
    edges?: number[] | null;
    originOffset: [number, number, number];
    baseSize: [number, number, number];
    volume?: number;
  } & CadExtras;
  mesh?: {
    positions: number[];
    indices: number[];
    baseSize: [number, number, number];
    source?: string;
    visual?: { key: string; node: string; matrix: number[] };
  };
  hardware?: HardwareSpec;
  componentId?: string;
  componentVariant?: string;
  supplyId?: string;
  imageDataUrl?: string;
  massG?: number;
  com?: [number, number, number];
  robotLink?: { robot: string; link: string; url?: string; rotate?: Array<[string, number]>; version: number };
  simready?: { url: string; name: string; maker: string; license: string };
  physics?: { dynamic: boolean; friction?: number };
  group?: { id: string; name: string };
  printMaterial?: PrintMaterial;
  print?: PartPrint;
  jointId?: string;
}

export type { PartPrint, PrintRecord } from './print';

import type { PartPrint, PrintRecord } from './print';

export type PrintMaterial = 'PLA' | 'PETG' | 'ABS' | 'ASA' | 'TPU';

export interface RobotJoint {
  id: string;
  name: string;
  type: 'revolute' | 'prismatic' | 'fixed';
  parent: string[];
  child: string[];
  parentJoint?: string;
  origin: [number, number, number];
  axis: [number, number, number];
  frame?: { part: string; origin: [number, number, number]; axis: [number, number, number] };
  range?: [number, number];
  actuators?: string[];
  effortNm?: number;
  velocity?: number;
  published?: string;
  limb?: 'leg' | 'arm' | 'neck' | 'torso' | 'other';
}

export type { BuildGuideRecord, ProjectRecords } from './projectRecords';

export interface ProjectSettings extends ProjectRecords {
  printer: string;
  material: PrintMaterial;
  infillPct: number;
  printProcess?: string;
  prints?: PrintRecord[];
  budgetUsd?: number;
  budgetEntered?: EnteredPrice;
  extras?: Array<{ key: string; qty: number; note?: string }>;
  joints?: RobotJoint[];
  firstRanges?: Record<string, [number, number]>;
  pose?: RobotPoseState;
  poses?: RobotPose[];
  animations?: RobotAnimation[];
  policies?: PolicyRecord[];
  marks?: SceneMark[];
}

export interface SceneMark {
  id: string;
  points: Array<[number, number, number]>;
  partIds: string[];
  color?: string;
  label?: string;
  view?: string;
  createdAt: string;
}

export interface PolicyRecord {
  id: string;
  name: string;
  task: 'stand' | 'walk';
  robot: string;
  robotName: string;
  command: [number, number, number];
  trainedSteps: number;
  createdAt: string;
  eval?: { fellAt: number | null; seconds: number; forward: number; travelled: number };
}

export type JointValues = Record<string, number>;

export interface RootOffset {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export interface RobotPoseState {
  values: JointValues;
  root?: RootOffset;
  roots?: Record<string, RootOffset>;
}

export interface RobotPose extends RobotPoseState {
  id: string;
  name: string;
  robot?: string;
}

export interface AnimationKeyframe extends RobotPoseState {
  t: number;
}

export interface RobotAnimation {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  keyframes: AnimationKeyframe[];
  interpolation: 'smooth' | 'linear';
  source?: 'agent' | 'gait' | 'mocap' | 'user';
  robot?: string;
}

export const DEFAULT_PROJECT: ProjectSettings = { printer: 'default', material: 'PLA', infillPct: 15 };

export interface EnteredPrice {
  amount: number;
  currency: string;
}

export interface PurchaseRecord {
  url?: string;
  asin?: string;
  title?: string;
  packQty: number;
  priceUsd: number;
  entered?: EnteredPrice;
  checkedAt: string;
  note?: string;
}

export interface ReferenceImageRecord {
  id: string;
  name: string;
  filePath: string;
  dataUrl: string;
  uploadedAt: string;
  width?: number;
  height?: number;
}

export interface AnnotationComment {
  id: string;
  text: string;
  createdAt: string;
  editedAt?: string;
}

export interface SceneAnnotation {
  id: string;
  position: [number, number, number];
  partId?: string | null;
  offset?: [number, number, number];
  comments: AnnotationComment[];
  resolved?: boolean;
  createdAt: string;
}

export interface SavedSceneSummary {
  id: string;
  name: string;
  globalGoal: string;
  updatedAt: string;
  partCount: number;
  catalogCount?: number;
  commentCount?: number;
  previewDataUrl?: string;
  sizeMm?: [number, number, number];
}

export interface SavedSceneRecord extends SavedSceneSummary {
  chatId?: string | null;
  parts: ScenePart[];
  referenceImages?: ReferenceImageRecord[];
  annotations?: SceneAnnotation[];
  project?: ProjectSettings;
}

export interface CatalogItem {
  kind: PartKind;
  name: string;
  category: PartCategory;
  defaultRole: PartRole;
  defaultDimensions: PartDimensions;
  defaultColor: string;
  defaultTag: string;
  description: string;
  hardware?: HardwareSpec;
  componentId?: string;
  keywords?: string;
}

export type TransformMode = 'translate' | 'rotate' | 'scale' | 'sculpt' | 'pose';

export type TrackpadGestureMode = 'orbit-scroll' | 'pan-scroll';

export type MeasureUnit = 'metric' | 'imperial';

export type CameraPreset = 'perspective' | 'top' | 'front' | 'right' | 'isometric';

export type {
  AcpChatMessage,
  AcpPlanEntry,
  AcpToolCallEvent,
  AgentConversation,
  AgentConversationSummary,
  ContextUsage,
} from './agentChat';

export interface EffortLevel {
  id: string;
  name: string;
}

export interface AgentModel {
  id: string;
  name: string;
  resolvesTo?: string;
  effortLevels?: EffortLevel[];
}

export interface AgentChoice {
  model?: string;
  effort?: string;
}

export type AgentKind = 'claude' | 'codex' | 'gemini' | 'offline' | 'custom';

export interface AgentSignIn {
  methods: Array<{ id: string; name: string }>;
  apiKey?: boolean;
  message?: string;
}

export interface AcpStatusInfo {
  connected: boolean;
  connecting?: boolean;
  sessionId: string | null;
  agentName: string;
  agentCommand: string;
  agentKind?: AgentKind;
  protocolVersion?: number;
  models?: AgentModel[];
  defaultModel?: string;
  defaultEffort?: string;
  signIn?: AgentSignIn;
  error?: string;
}

export interface ProjectSummaryForAI {
  projectName: string;
  globalDesignGoal: string;
  units: 'mm';
  timestamp: string;
  boundingBoxMm: {
    width: number;
    height: number;
    depth: number;
  };
  parts: Array<{
    id: string;
    name: string;
    kind: PartKind;
    customModelId?: string;
    role: PartRole;
    mechanicalTag: string;
    positionMm: { x: number; y: number; z: number };
    rotationDeg: { x: number; y: number; z: number };
    dimensionsMm: PartDimensions;
    deformers?: PartDeformers;
    aiNote: string;
  }>;
  spatialRelationships: string[];
  annotations?: Array<{
    id: string;
    positionMm: { x: number; y: number; z: number };
    attachedPart?: string;
    comments: string[];
  }>;
}
