import type { HardwareSpec } from '../data/hardware';

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
  // Custom library model instance or boolean/sculpted mesh
  | 'custom_model'
  | 'sculpt_mesh'
  // Primitives
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
  // Reference photo on a plane (never printed)
  | 'image_plane'
  // Screws, nuts, washers, inserts, standoffs, pins, bearings (see data/hardware.ts)
  | 'hardware'
  // Real CAD part designed as code (OpenSCAD/BOSL2 or replicad) by the agent
  | 'cad_part'
  // Real purchasable component (servo, board, sensor) with its exact CAD model (see data/components.ts)
  | 'component'
  // A link of an imported robot description (URDF / MJCF): its published mesh
  | 'mesh'
  // Actuators & Joints
  | 'servo'
  | 'stepper_motor'
  | 'hinge_joint'
  | 'linear_actuator'
  // Structure & Brackets
  | 'l_bracket'
  | 'u_bracket'
  | 'beam'
  | 'standoff'
  // Motion & End-Effectors
  | 'wheel'
  | 'gripper'
  | 'bearing_block'
  // Sensors & Electronics
  | 'camera_module'
  | 'ultrasonic'
  | 'pcb_board'
  // AI Intent Markers
  | 'hole_cylinder'
  | 'hole_box'
  | 'pivot_axis';

export type PartRole = 'solid' | 'cutout' | 'reference';

export interface PartDimensions {
  width: number;      // X in mm
  height: number;     // Y in mm
  depth: number;      // Z in mm
  thickness?: number; // Wall / bracket thickness in mm
  holeDiameter?: number;
}

export interface PartDeformers {
  /** -0.8 to +1.0: tapers top X/Z relative to bottom */
  taper?: number;
  /** -120 to +120 degrees: bends geometry along Y/X arc */
  bendDeg?: number;
  /** -180 to +180 degrees: twists geometry around Y axis */
  twistDeg?: number;
  /** 0 to 1: rounds/spherifies sharp box corners */
  roundness?: number;
}

export interface SculptMeshData {
  /** Flat array of vertex [x,y,z, x,y,z, ...] in local normalized [-0.5..0.5] coordinates (scaled by dimensions) */
  positions: number[];
  /** Optional triangle index array */
  indices?: number[];
}

export type SculptBrushKind =
  | 'inflate'
  | 'carve'
  | 'flatten'
  | 'smooth'
  | 'pinch'
  | 'grab';

export interface SculptSettings {
  brush: SculptBrushKind;
  radiusMm: number;
  strength: number; // 0.1 to 1.0
  symmetryX: boolean;
  symmetryZ: boolean;
}

export interface ContourExtrudeData {
  /** Normalized [-0.5..0.5] 2D outer contour points in X-Z plane */
  outerLoop: Array<[number, number]>;
  /** Optional inner hole loops in normalized [-0.5..0.5] coordinates */
  holes?: Array<Array<[number, number]>>;
  bevel?: boolean;
}

export interface LatheProfileData {
  /** Normalized [radius 0..0.5, height -0.5..0.5] profile points */
  profilePoints: Array<[number, number]>;
  segments?: number;
}

export interface CustomModelSubNode {
  id: string;
  name: string;
  nodeType: 'primitive' | 'contour_extrude' | 'lathe' | 'sculpt_mesh';
  primitiveKind?: Exclude<PartKind, 'custom_model' | 'sculpt_mesh'>;
  role: PartRole;
  /** Offset in mm relative to model center */
  position: [number, number, number];
  /** Euler rotation in degrees */
  rotation: [number, number, number];
  /** Node dimensions in mm */
  dimensions: PartDimensions;
  color: string;
  contour?: ContourExtrudeData;
  lathe?: LatheProfileData;
  sculptMesh?: SculptMeshData;
  deformers?: PartDeformers;
  /**
   * The whole part as it was in the scene (CAD code and geometry, meshes, hardware…).
   * Inserting the model rebuilds it exactly; `position` above is its offset from the model center.
   */
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

export interface ScenePart {
  id: string;
  name: string;
  kind: PartKind;
  category: PartCategory;
  role: PartRole;
  position: [number, number, number]; // [x, y, z] in mm
  rotation: [number, number, number]; // [rx, ry, rz] in degrees
  dimensions: PartDimensions;
  color: string;
  opacity?: number;
  note: string;
  mechanicalTag?: string;
  visible: boolean;
  locked: boolean;
  deformers?: PartDeformers;
  sculptMesh?: SculptMeshData;
  /** If kind === 'custom_model', references the CustomModelDefinition.id and embeds a snapshot of its nodes */
  customModelId?: string;
  customNodes?: CustomModelSubNode[];
  sourceImageDataUrl?: string;
  /** Geometry + source of a `cad_part` (scene frame, centered on the part's bounding box) */
  cad?: {
    language: 'openscad' | 'replicad';
    code: string;
    positions: number[];
    indices: number[];
    /** Exact B-rep feature edges as line segments (replicad) */
    edges?: number[] | null;
    /** Where the code's origin sits relative to the bounding-box center (local, scene frame) */
    originOffset: [number, number, number];
    /** Size when generated; dimensions / baseSize gives the user's scale */
    baseSize: [number, number, number];
    volume?: number;
  };
  /** Geometry of a `mesh` part (scene frame, centered on its bounding box) */
  mesh?: {
    positions: number[];
    indices: number[];
    /** Size when imported; dimensions / baseSize gives the user's scale */
    baseSize: [number, number, number];
    /** Where it came from, e.g. "Unitree G1 · left_knee_link" */
    source?: string;
  };
  /** Fastener / bearing spec for `hardware` parts; geometry is generated from it */
  hardware?: HardwareSpec;
  /** Catalog id of a `component` part; its exact mesh is loaded from public/parts */
  componentId?: string;
  /** Which version of the component to buy (e.g. 'c018', the 12 V STS3215); see ComponentInfo.variants */
  componentVariant?: string;
  /**
   * A purchase-only supply this part stands for (data/supplies.ts), e.g. the battery pack's
   * envelope: it's bought, not printed, and its mass is the supply's
   */
  supplyId?: string;
  /** Photo shown on an `image_plane` part */
  imageDataUrl?: string;
  /** Parts sharing a group select and move together */
  group?: { id: string; name: string };
  /** Printed parts only: filament for this part (defaults to the project's material) */
  printMaterial?: PrintMaterial;
  /** A joint this part belongs to, declared by the agent (see agent define_joints) */
  jointId?: string;
}

export type PrintMaterial = 'PLA' | 'PETG' | 'ABS' | 'ASA' | 'TPU';

/** A degree of freedom declared at design time (scene frame, mm / degrees) */
export interface RobotJoint {
  id: string;
  name: string;
  /** revolute turns about the axis (degrees); prismatic slides along it (mm) */
  type: 'revolute' | 'prismatic' | 'fixed';
  /** Parent and child part ids: the child side moves with the joint */
  parent: string[];
  child: string[];
  /**
   * The joint this one is mounted on, when it can't be read from the parts
   * (imported robots, whose links between joints may have no geometry)
   */
  parentJoint?: string;
  /** Pivot point and axis, scene frame (mm), axis unit length */
  origin: [number, number, number];
  axis: [number, number, number];
  /**
   * The same pivot and axis in a parent part's own frame, so the joint follows that part when
   * the robot is moved (origin and axis above are then refreshed from it)
   */
  frame?: { part: string; origin: [number, number, number]; axis: [number, number, number] };
  /** Range from the modeled pose: degrees (revolute) or mm (prismatic) */
  range?: [number, number];
  /** Scene part ids of the servo(s) that drive it; two opposed servos share the load */
  actuators?: string[];
  /** Arm, leg, neck…: sets the torque margin (legs 3×, others 2×) */
  limb?: 'leg' | 'arm' | 'neck' | 'torso' | 'other';
}

/** Per-scene build settings: printer, filament, budget and purchase-only extras */
export interface ProjectSettings {
  printer: 'bambu-p1s';
  material: PrintMaterial;
  /** Infill percent used for filament estimates */
  infillPct: number;
  budgetUsd?: number;
  /** Things to buy that aren't modeled parts (battery, charger, cables, filament), by catalog key */
  extras?: Array<{ key: string; qty: number; note?: string }>;
  /** Joints declared for engineering checks and posing */
  joints?: RobotJoint[];
  /** The pose shown on the canvas (the modeled pose when absent) */
  pose?: RobotPoseState;
  /** Saved poses */
  poses?: RobotPose[];
  /** Keyframed motion: walk cycles, gestures, retargeted mocap */
  animations?: RobotAnimation[];
}

/** Joint values by joint id: degrees (revolute) or mm (prismatic), from the modeled pose */
export type JointValues = Record<string, number>;

/** Whole-robot offset from the modeled pose (scene frame): mm and XYZ degrees about the base */
export interface RootOffset {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export interface RobotPoseState {
  values: JointValues;
  /** Whole-body offset of a single robot (one robot's own pose, or a scene with one robot) */
  root?: RootOffset;
  /** Whole-body offsets by robot (`Rig.robots[].key`), for scenes with several robots */
  roots?: Record<string, RootOffset>;
}

export interface RobotPose extends RobotPoseState {
  id: string;
  name: string;
  /** The robot it belongs to (`Rig.robots[].key`) */
  robot?: string;
}

export interface AnimationKeyframe extends RobotPoseState {
  /** Seconds from the start */
  t: number;
}

export interface RobotAnimation {
  id: string;
  name: string;
  /** Seconds */
  duration: number;
  loop: boolean;
  /** Sorted by t; every keyframe lists every animated joint */
  keyframes: AnimationKeyframe[];
  /** smooth = Catmull-Rom through the keyframes; linear for dense mocap */
  interpolation: 'smooth' | 'linear';
  source?: 'agent' | 'gait' | 'mocap' | 'user';
  /** The robot it moves (`Rig.robots[].key`); keyframe roots are that robot's */
  robot?: string;
}

export const DEFAULT_PROJECT: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 15 };

/**
 * What the user saw on a product listing, recorded by hand (never fetched or generated).
 * Keyed in library/purchases.json by catalog key.
 */
export interface PurchaseRecord {
  url: string;
  asin?: string;
  title?: string;
  /** Pieces per listing (a 50-pack of screws is 50) */
  packQty: number;
  priceUsd: number;
  /** ISO date (YYYY-MM-DD) of the check */
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

/** A comment thread pinned to a point in 3D space (mm), optionally attached to a part */
export interface SceneAnnotation {
  id: string;
  /** World position when created */
  position: [number, number, number];
  /** Part the pin sticks to; the pin follows the part by `offset` */
  partId?: string | null;
  offset?: [number, number, number];
  comments: AnnotationComment[];
  resolved?: boolean;
  createdAt: string;
}

export interface SavedSceneRecord {
  id: string;
  name: string;
  globalGoal: string;
  updatedAt: string;
  partCount: number;
  thumbnailDataUrl?: string;
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
  /** Default spec for hardware catalog entries */
  hardware?: HardwareSpec;
  /** Real component entries (data/components.ts) */
  componentId?: string;
  /** Extra search words: maker, part number, aliases */
  keywords?: string;
}

export type TransformMode = 'translate' | 'rotate' | 'scale' | 'sculpt' | 'pose';

export type TrackpadGestureMode = 'orbit-scroll' | 'pan-scroll';

export type CameraPreset = 'perspective' | 'top' | 'front' | 'right' | 'isometric';

export interface AcpToolCallEvent {
  toolCallId: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  kind?: string;
  /** Tool input as the agent sent it (used for friendly labels) */
  rawInput?: unknown;
  toolName?: string;
}

export interface AcpPlanEntry {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AcpChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  thought?: string;
  timestamp: string;
  imageAttachment?: string;
  /** Several reference images sent with one message */
  imageAttachments?: string[];
  /** Attached folders (library/evidence), read by the agent on demand */
  folderAttachments?: Array<{ id: string; name: string; fileCount: number }>;
  /** Sent while the agent was working; waits for the run to end */
  queued?: boolean;
  /** A queued message that was dropped when the run was stopped */
  notSent?: boolean;
  toolCalls?: AcpToolCallEvent[];
  /** Thoughts, text and tool calls in the order they streamed (live transcript) */
  segments?: Array<{ type: 'thought' | 'text'; text: string } | { type: 'tool'; toolCallId: string }>;
  /** Latest to-do list the agent published during this reply */
  plan?: AcpPlanEntry[];
  createdModelId?: string;
  /** Order of thought/tool/text segments as they streamed, for a faithful transcript */
  stopped?: boolean;
}

export interface AgentConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface AgentConversation {
  id: string;
  title: string;
  /** ACP session to resume so the agent keeps its context */
  acpSessionId: string | null;
  createdAt: string;
  updatedAt?: string;
  messages: AcpChatMessage[];
}

export interface AcpStatusInfo {
  connected: boolean;
  sessionId: string | null;
  agentName: string;
  agentCommand: string;
  protocolVersion?: number;
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
