import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Box,
  Package,
  Brush,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Group,
  SquareDashedMousePointer,
  Ungroup,
  AlignCenterVertical,
  SquaresIntersect,
  Trash2,
  BookmarkPlus,
  SquaresSubtract,
  SquaresUnite,
  RotateCcw,
  Download,
  FileUp,
  Grid3x3,
  Hand,
  ImagePlus,
  Image as ImageIcon,
  Keyboard,
  Layers,
  MessageCircle,
  Move3d,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Rotate3d,
  Save,
  Scale3d,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Undo2,
  X,
  CopyPlus,
  History,
  ArrowRightLeft,
  PenTool,
  ImageDown,
  ClipboardCopy,
  ClipboardPaste,
  Scissors,
  Bot,
  Footprints,
  PersonStanding,
  Play,
} from 'lucide-react';
import { AcpStudioPanel } from './components/AcpStudioPanel';
import { AlignControls } from './components/AlignControls';
import { AnnotationDraft, AnnotationLayer } from './components/Annotations';
import { CommandPalette, Command } from './components/CommandPalette';
import { Inspector } from './components/Inspector';
import { BuildPanel } from './components/BuildPanel';
import { LeftSidebar, LeftTab } from './components/LeftSidebar';
import { SculptAndDrawStudio, StudioSubTab } from './components/SculptAndDrawStudio';
import { PosePanel } from './components/PosePanel';
import { detectFeet, usePosing } from './utils/usePosing';
import { anchorJoint, resolveJoints, robotOfParts, uniqueJointIds } from './utils/kinematics';
import { buildGait } from './utils/animation';
import { ImportRobotSheet } from './components/ImportRobotSheet';
import { RetargetSheet } from './components/RetargetSheet';
import {
  animateRequest,
  getRig,
  retargetRequest,
  setPoseRequest,
  type AnimatePayload,
  type PoseContext,
  type PosePayload,
  type PoseReply,
  type RetargetPayload,
} from './agent/agentPose';
import { ARTICULATED_PARTS } from './data/articulatedParts';
import { ROBOT_PRESETS, importRobot, type RobotPreset } from './utils/robotImport';
import { rememberImportedRobot, robotPreviewImage } from './utils/robotPreview';
import { ExportMenu } from './components/ExportMenu';
import type { SettingsPane } from './components/SettingsWindow';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { ViewportToolbar } from './components/ViewportToolbar';
import { CAMERA_VIEWS } from './data/cameraViews';
import { CATEGORY_LABELS, PART_CATALOG, catalogItemFromKey, catalogKey, catalogNote, hardwareVariant } from './data/catalog';
import { HARDWARE_BY_TYPE, HardwareSpec, hardwareColor, hardwareDimensions, hardwareName, hardwareNote } from './data/hardware';
import { hardwareCutoutParts } from './utils/hardwareCutouts';
import * as THREE from 'three';
import { buildPartGroup } from './three/buildPartMesh';
import {
  buildBufferGeometryFromSculptData,
  createSculptClayPreset,
  extractSculptDataFromGeometry,
  runSceneBooleanCSG,
  tessellateGeometryForSculpting,
} from './three/sculptAndBooleanEngine';
import {
  AcpChatMessage,
  AgentConversationSummary,
  AcpPlanEntry,
  AcpToolCallEvent,
  AcpStatusInfo,
  CameraPreset,
  CatalogItem,
  CustomModelDefinition,
  CustomModelSubNode,
  PartRole,
  ReferenceImageRecord,
  SavedSceneRecord,
  SceneAnnotation,
  ScenePart,
  SculptMeshData,
  SculptSettings,
  TrackpadGestureMode,
  TransformMode,
  DEFAULT_PROJECT,
  ProjectSettings,
  RobotJoint,
  RobotPoseState,
} from './types/robotics';
import { buildAIHandoffPayload, exportSceneToSTL, sceneToStl } from './utils/aiHandoff';
import { bomText, buildBom, describeKey } from './utils/bom';
import { buildPrintReport, printReportText } from './utils/printReport';
import { ServoOutput, engineeringText, runEngineering } from './utils/engineering';
import { analyzeImageFor3D } from './utils/imageTo3DAnalyzer';
import { AcpPromptPayload, AppMenuState, platformBridge } from './utils/platformBridge';
import type { EvidenceFolder } from './utils/evidenceFiles';
import { downscaleDataUrl, readImageFile } from './utils/imageFile';
import { maskProfile, photoProfile } from './utils/silhouette';
import {
  AgentOp,
  agentCatalog,
  applySpec,
  describeOp,
  mirrorParts,
  opTarget,
  partCode,
  toCad,
  toScene,
  snapshotScene,
  specToPart,
} from './agent/agentScene';
import { COMPONENT_BY_ID } from './data/components';
import { AgentCursor } from './components/AgentCursor';
import { newSceneId } from './utils/sceneIds';
import { modelToParts } from './utils/libraryParts';
import { MODEL_DRAG_TYPE, PART_DRAG_TYPE, ROBOT_DRAG_TYPE, isSceneDrag } from './data/dnd';
import {
  AlignMode,
  Axis,
  alignParts,
  boundsOverlap,
  distributeParts,
  expandToGroups,
  halfExtents,
  selectionBounds,
} from './utils/selection';
import {
  Button,
  ContextMenu,
  PanelResizer,
  ContextMenuEntry,
  DRAG_REGION,
  FloatingIsland,
  IconButton,
  IslandDivider,
  LAYOUT,
  NO_DRAG_REGION,
  PanelTabs,
  AgentSpinner,
  Toast,
  ToastData,
  GlyphProps,
  LayersIcon,
  LibraryIcon,
  PartsIcon,
  RobotsIcon,
} from './design-system';

/** Scenes saved before robots got their own joint ids: number the repeats */
const normalizeProject = (p: ProjectSettings): ProjectSettings => {
  const joints = p.joints ? uniqueJointIds(p.joints) : p.joints;
  return joints === p.joints ? p : { ...p, joints };
};

type RightTab = 'inspector' | 'pose' | 'build' | 'acp';

/** The sidebar's views, shown as the rail's icons */
const LEFT_VIEWS: Array<{ value: LeftTab; label: string; Icon: React.FC<GlyphProps> }> = [
  { value: 'parts', label: 'Parts', Icon: PartsIcon },
  { value: 'robots', label: 'Robots', Icon: RobotsIcon },
  { value: 'layers', label: 'Layers', Icon: LayersIcon },
  { value: 'library', label: 'Library', Icon: LibraryIcon },
];

/** “Sprout copy”, then “Sprout copy 2”… so library names stay unique */
function copyName(name: string, taken: string[]): string {
  const stem = `${name.replace(/ copy( \d+)?$/, '')} copy`;
  let n = 1;
  let next = stem;
  while (taken.includes(next)) next = `${stem} ${++n}`;
  return next;
}

/** What a scene tab starts from: a library scene, a duplicate, or a closed tab being reopened */
export interface WorkspaceSeed {
  sceneId: string;
  sceneName: string;
  globalGoal: string;
  parts: ScenePart[];
  annotations: SceneAnnotation[];
  /** Printer, filament, budget, purchase-only extras and joints */
  project?: ProjectSettings;
  /** The tab's agent conversation; its session is resumed on the next message */
  chat?: { chatId: string | null; messages: AcpChatMessage[]; acpSessionId: string | null };
  /** A new, empty scene (opening a library scene may reuse its tab until it's touched) */
  blank?: boolean;
}

/** What the tab strip shows about a scene */
export interface WorkspaceMeta {
  sceneId: string;
  name: string;
  partCount: number;
  /** The agent is working in this scene */
  busy: boolean;
  /** What the agent is doing right now (“Designing Left Coxa Bracket”) */
  activity: string;
  chatId: string | null;
  /** Untitled, empty and never used: opening a scene can reuse the tab */
  pristine: boolean;
}

/** What the tab host can ask of a mounted scene */
export interface WorkspaceHandle {
  /** Agent and bridge events addressed to this scene */
  onEvent: (event: Record<string, unknown>) => void;
  snapshot: () => WorkspaceSeed;
  thumbnail: () => Promise<string>;
  load: (seed: WorkspaceSeed, toast?: string) => void;
  rename: (name: string) => void;
  toast: (message: string, opts?: Omit<ToastData, 'id' | 'message'>) => void;
  /** Saves the agent conversation now (before the tab closes) */
  persistChat: () => void;
  /** Stops the agent and drops queued messages (the tab is closing) */
  stopAgent: () => void;
}

export interface Preferences {
  snapStepMm: number;
  snapAngleDeg: number;
  trackpadMode: TrackpadGestureMode;
  showGrid: boolean;
  /** Experimental: shows the Sculpt tool (C) in the toolbar */
  sculptEnabled: boolean;
}

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/** App-wide state and tab actions every scene shares (owned by App) */
export interface StudioShared {
  snapStepMm: number;
  setSnapStepMm: Setter<number>;
  snapAngleDeg: number;
  trackpadMode: TrackpadGestureMode;
  setTrackpadMode: Setter<TrackpadGestureMode>;
  showGrid: boolean;
  setShowGrid: Setter<boolean>;
  sculptEnabled: boolean;
  showReferenceImages: boolean;
  setShowReferenceImages: Setter<boolean>;
  isLeftOpen: boolean;
  setIsLeftOpen: Setter<boolean>;
  isRightOpen: boolean;
  setIsRightOpen: Setter<boolean>;
  panelWidths: { left: number; right: number };
  setPanelWidths: Setter<{ left: number; right: number }>;
  resizingPanel: 'left' | 'right' | null;
  setResizingPanel: Setter<'left' | 'right' | null>;
  customModels: CustomModelDefinition[];
  setCustomModels: Setter<CustomModelDefinition[]>;
  savedScenes: SavedSceneRecord[];
  setSavedScenes: Setter<SavedSceneRecord[]>;
  uploadedImages: ReferenceImageRecord[];
  setUploadedImages: Setter<ReferenceImageRecord[]>;
  chatList: AgentConversationSummary[];
  setChatList: Setter<AgentConversationSummary[]>;
  acpStatus: AcpStatusInfo;
  reconnectAcp: (command?: string) => Promise<void>;
  agentTargetHeightMm: number;
  settingsOpen: boolean;
  openSettings: (pane?: SettingsPane) => void;
  /** Open scenes, in tab order, with the saved scene each one edits */
  tabs: Array<{ id: string; name: string; sceneId: string }>;
  canReopenTab: boolean;
  register: (id: string, handle: WorkspaceHandle | null) => void;
  reportMeta: (id: string, meta: WorkspaceMeta) => void;
  reportRightIsland: (width: number) => void;
  newScene: (seed?: WorkspaceSeed) => void;
  openScene: (record: SavedSceneRecord) => void;
  selectTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  closeTab: (id: string) => void;
  duplicateTab: (id: string) => void;
  reopenTab: () => void;
  cycleTab: (step: number) => void;
  /** Shows the tab that has this agent chat open; false when none does */
  focusChat: (chatId: string, from: string) => boolean;
  /** Something happened in a background scene; tells the scene in front */
  notify: (from: string, message: string) => void;
}

/** Right-clicks this soon after a wheel event are trackpad taps from scrolling, not menu requests */
const TRACKPAD_TAP_GRACE_MS = 400;

/** Parts + undo history in one state object so every update stays pure. */
/** One undo step: the parts, and the robots' pose (pose changes are undoable too) */
interface Snapshot {
  parts: ScenePart[];
  pose: RobotPoseState | undefined;
}

interface DocState {
  parts: ScenePart[];
  past: Snapshot[];
  future: Snapshot[];
  /** Snapshot taken when a live (scrub/drag/typing) edit begins */
  base: ScenePart[] | null;
}

const HISTORY_LIMIT = 50;

const EMPTY_DOC: DocState = { parts: [], past: [], future: [], base: null };

const newId = (prefix = 'part') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

/**
 * Copied parts, shared by every scene tab. The system clipboard holds only a marker
 * (PARTS_CLIPBOARD_TYPE), so ⌘V pastes parts only while nothing newer was copied.
 */
const PARTS_CLIPBOARD_TYPE = 'application/x-basecase-parts';
let partsClipboard: { parts: ScenePart[]; inPlace: Set<string>; pastes: Map<string, number> } | null = null;

const fileSafe = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'robotics-mechanism';

interface SceneWorkspaceProps {
  /** Tab id; routes this scene's agent session and CAD requests */
  workspaceId: string;
  /** In front: owns the keyboard, menu bar and paste */
  active: boolean;
  seed?: WorkspaceSeed;
  studio: StudioShared;
}

/**
 * One open scene with its own parts, history, selection, comments and agent session.
 * Every tab stays mounted so a background agent keeps building (and rendering its reviews)
 * while another scene is in front.
 */
function SceneWorkspaceImpl({ workspaceId, active, seed, studio }: SceneWorkspaceProps) {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // False once the tab closes, so a finished run never starts a queued message in a closed scene
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Scene
  const [sceneId, setSceneId] = useState<string>(() => seed?.sceneId ?? (workspaceId === 'main' ? 'my-robotics-design' : newSceneId()));
  const [sceneName, setSceneName] = useState<string>(seed?.sceneName ?? 'Untitled');
  const [globalGoal, setGlobalGoal] = useState<string>(seed?.globalGoal ?? '');
  const [project, setProject] = useState<ProjectSettings>(() => normalizeProject({ ...DEFAULT_PROJECT, ...seed?.project }));
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const [doc, setDoc] = useState<DocState>(() => (seed ? { ...EMPTY_DOC, parts: seed.parts } : EMPTY_DOC));
  const parts = doc.parts;
  // Latest parts for async agent work
  const partsRef = useRef(parts);
  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);

  // Dev-only hook for the benchmark harness (bench/run.mjs); always the scene in front
  useEffect(() => {
    if (!import.meta.env.DEV || !active) return;
    (window as unknown as { __studio?: unknown }).__studio = {
      parts: () => partsRef.current.map(({ id, name, kind, role, visible, group, componentId }) => ({ id, name, kind, role, visible, group: group?.name, componentId })),
      interference: () => viewportRef.current?.interference() ?? { interferences: [], coplanar: [] },
      // The whole scene as a library record (bench runs save it so a design can be opened in the app)
      sceneRecord: () => ({ parts: partsRef.current, project: projectRef.current, annotations: [] }),
      stlBase64: () => {
        const view = sceneToStl(partsRef.current);
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      },
      capture: (views: string[], ids?: string[]) => viewportRef.current?.captureViews(views, ids) ?? [],
      // Parts library pipeline (tools/parts/generate.mjs): the scene's solid triangles, world frame, by color
      meshByColor: () => {
        const groups: Record<string, number[]> = {};
        for (const part of partsRef.current) {
          if (!part.visible || part.role !== 'solid') continue;
          const group = buildPartGroup(part, false);
          group.updateMatrixWorld(true);
          group.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
            const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
            geo.applyMatrix4(mesh.matrixWorld);
            const pos = geo.getAttribute('position');
            const soup = (groups['#' + mat.color.getHexString(THREE.SRGBColorSpace)] ??= []);
            for (let i = 0; i < pos.count; i++) soup.push(pos.getX(i), pos.getY(i), pos.getZ(i));
          });
        }
        return groups;
      },
      cadSources: () =>
        partsRef.current
          .filter((p) => p.cad)
          .map(({ id, name, color, role, position, rotation, dimensions, cad }) => ({
            id, name, color, role, position, rotation, dimensions,
            cad: { language: cad!.language, code: cad!.code, originOffset: cad!.originOffset, baseSize: cad!.baseSize },
          })),
      clear: () => {
        partsRef.current = [];
        setDoc(EMPTY_DOC);
        setSelectedIds([]);
        projectRef.current = { ...DEFAULT_PROJECT };
        setProject(projectRef.current);
      },
      select: (ids: string[]) => setSelectedIds(ids),
      // Robots and posing (see devRef below)
      importRobot: (url: string, name?: string) => devRef.current.importRobot?.({ kind: 'url', url, name }),
      // tools/robots/previews.mjs: the import's preview of a robot, without adding it to the scene
      robotPreview: async (url: string, width = 480) => robotPreviewImage((await importRobot({ kind: 'url', url })).parts, url, width),
      setPose: (values: Record<string, number>, root?: { position?: [number, number, number]; rotation?: [number, number, number] }) => devRef.current.posing?.setPose({ values, root }),
      posing: () => devRef.current.posing,
      poseTool: (kind: string, payload: Record<string, unknown>) => devRef.current.poseTool?.(kind, payload),
    };
  }, [active]);

  // Latest handlers for the dev hook above
  const devRef = useRef<{ importRobot?: (src: { kind: 'url'; url: string; name?: string }) => Promise<unknown>; posing?: ReturnType<typeof usePosing>; poseTool?: (kind: string, payload: Record<string, unknown>) => Promise<PoseReply> }>({});

  // Selection & tools
  // Ordered selection — the first id is the primary (boolean base)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedPartId = selectedIds.length === 1 ? selectedIds[0] : null;
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  // Canvas settings are app-wide (Settings window); every scene uses the same
  const {
    snapStepMm,
    snapAngleDeg,
    trackpadMode,
    setTrackpadMode,
    showGrid,
    setShowGrid,
    sculptEnabled,
    showReferenceImages,
    setShowReferenceImages,
    isLeftOpen,
    setIsLeftOpen,
    isRightOpen,
    setIsRightOpen,
    panelWidths,
    setPanelWidths,
    resizingPanel,
    setResizingPanel,
    customModels,
    setCustomModels,
    savedScenes,
    setSavedScenes,
    uploadedImages,
    setUploadedImages,
    chatList,
    setChatList,
    agentTargetHeightMm,
    settingsOpen,
    openSettings,
  } = studio;
  const [activeBlueprintUrl] = useState<string | null>(null);
  const [sculptSettings, setSculptSettings] = useState<SculptSettings>({
    brush: 'inflate',
    radiusMm: 16,
    strength: 0.45,
    symmetryX: true,
    symmetryZ: false,
  });

  // Annotations (comment threads pinned in 3D)
  const [annotations, setAnnotations] = useState<SceneAnnotation[]>(seed?.annotations ?? []);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null);
  const [commentMode, setCommentMode] = useState(false);

  // Panels (open state and widths are app-wide; tabs are per scene)
  const [leftTab, setLeftTab] = useState<LeftTab>('parts');
  const [rightTab, setRightTab] = useState<RightTab>('inspector');
  // Sketch / Import SVG flow shown in place of the Inspector until it adds a part or Done
  const [creator, setCreator] = useState<'draw2d' | 'svg' | null>(null);

  // Agent: this scene's own conversation and ACP session (the connection is shared)
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const acpStatus = useMemo(() => ({ ...studio.acpStatus, sessionId: acpSessionId }), [studio.acpStatus, acpSessionId]);
  // A reopened conversation resumes its session on the next message
  const pendingResumeRef = useRef<string | null>(seed?.chat?.acpSessionId ?? null);
  const [acpMessages, setAcpMessages] = useState<AcpChatMessage[]>(seed?.chat?.messages ?? []);
  const [isAcpBusy, setIsAcpBusy] = useState(false);
  // Live agent presence on the canvas
  const [agentStatus, setAgentStatus] = useState('');
  const [agentAction, setAgentAction] = useState('');
  const [agentCursorTarget, setAgentCursorTarget] = useState<[number, number, number] | null>(null);
  // Scene before the last agent run, for “Revert Changes”
  const [agentRunBase, setAgentRunBase] = useState<ScenePart[] | null>(null);
  const agentRequestRef = useRef<(e: { requestId: string; kind: string; payload: Record<string, unknown> }) => void>(() => {});
  const [attachRequest, setAttachRequest] = useState(0);
  // Agent chat history (saved to library/conversations)
  const [chatId, setChatId] = useState<string | null>(seed?.chat?.chatId ?? null);

  // Overlays
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shapesMenuOpen, setShapesMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    partId: string | null;
    point: [number, number, number] | null;
  } | null>(null);
  // Secondary press in progress on the canvas. macOS fires `contextmenu` on press, so the menu
  // waits for the release and only opens if the pointer barely moved (a drag is a pan).
  // Windows and Linux fire it after release, so the release records whether the press moved.
  const menuPressRef = useRef<{ x: number; y: number; pending: boolean; moved: boolean; released: boolean } | null>(null);
  // Last wheel event on the canvas (trackpad scroll, pinch or momentum), for telling taps from secondary clicks
  const lastWheelRef = useRef(-Infinity);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imagePlaceRef = useRef<[number, number, number] | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // When ⌘Z / ⌘A last ran from the keyboard, so the native Edit menu never repeats it
  const lastKeyEditRef = useRef(0);

  const showToast = useCallback(
    (message: string, opts: Omit<ToastData, 'id' | 'message'> = {}) => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      const id = Date.now();
      setToast({ id, message, ...opts });
      if (opts.tone !== 'progress') {
        toastTimer.current = window.setTimeout(
          () => setToast((t) => (t?.id === id ? null : t)),
          opts.action ? 5000 : 2800
        );
      }
    },
    []
  );

  /* ---------------------------------------------------------------- */
  /* Bridge                                                           */
  /* ---------------------------------------------------------------- */

  /** Agent and bridge events for this scene (App routes them by workspace id) */
  const handleWorkspaceEvent = (event: Record<string, unknown>) => {
    if (event.type === 'agent-request' && typeof event.requestId === 'string') {
      agentRequestRef.current(event as unknown as { requestId: string; kind: string; payload: Record<string, unknown> });
      return;
    }
    if (event.type === 'agent-status') {
      setAgentStatus(String(event.status || ''));
      return;
    }
    if (event.type === 'agent-blocked') {
      showToast(`Blocked “${String(event.title)}”: the agent only edits the model`, { tone: 'neutral' });
      return;
    }
    if (event.type === 'acp-session' && typeof event.sessionId === 'string') {
      setAcpSessionId(event.sessionId);
      return;
    }
    if (event.type === 'acp-session-update' && event.update) {
      const u = event.update as Record<string, unknown>;
      // Only transcript content; session metadata (commands, modes, usage) isn't a reply
      const TRANSCRIPT_UPDATES = ['agent_thought_chunk', 'agent_message_chunk', 'tool_call', 'tool_call_update', 'plan'];
      if (!TRANSCRIPT_UPDATES.includes(String(u.sessionUpdate))) return;
      setAcpMessages((prev) => {
        const copy = [...prev];
        let lastAgentIdx = -1;
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'agent') {
            lastAgentIdx = i;
            break;
          }
        }
        if (u.sessionUpdate === 'tool_call_update' || u.sessionUpdate === 'tool_call') {
          const id = String(u.toolCallId);
          const owner = copy.findIndex((m) => m.role === 'agent' && m.toolCalls?.some((t) => t.toolCallId === id));
          if (owner !== -1) lastAgentIdx = owner;
        }
        if (lastAgentIdx === -1) {
          copy.push({
            id: `msg-agent-${Date.now()}`,
            role: 'agent',
            text: '',
            timestamp: new Date().toISOString(),
            toolCalls: [],
          });
          lastAgentIdx = copy.length - 1;
        }
        const target = { ...copy[lastAgentIdx] };
        const content = u.content as { text?: string } | undefined;

        const appendSegment = (type: 'thought' | 'text', chunk: string) => {
          const segs = [...(target.segments ?? [])];
          const last = segs[segs.length - 1];
          if (last && last.type === type) segs[segs.length - 1] = { type, text: last.text + chunk };
          else segs.push({ type, text: chunk });
          target.segments = segs;
        };

        if (u.sessionUpdate === 'agent_thought_chunk' && content?.text) {
          target.thought = (target.thought || '') + content.text;
          appendSegment('thought', content.text);
        } else if (u.sessionUpdate === 'agent_message_chunk' && content?.text) {
          target.text = (target.text || '') + content.text;
          appendSegment('text', content.text);
        } else if (u.sessionUpdate === 'tool_call') {
          const meta = u._meta as { claudeCode?: { toolName?: string } } | undefined;
          const id = String(u.toolCallId);
          const call = {
            toolCallId: id,
            title: String(u.title || 'Tool'),
            status: (u.status as AcpToolCallEvent['status']) || 'in_progress',
            kind: String(u.kind || ''),
            rawInput: u.rawInput,
            toolName: meta?.claudeCode?.toolName,
          };
          const list = target.toolCalls || [];
          const known = list.some((t) => t.toolCallId === id);
          target.toolCalls = known ? list.map((t) => (t.toolCallId === id ? { ...t, ...call } : t)) : [...list, call];
          if (!known) target.segments = [...(target.segments ?? []), { type: 'tool', toolCallId: id }];
        } else if (u.sessionUpdate === 'tool_call_update') {
          target.toolCalls = (target.toolCalls || []).map((tc) =>
            tc.toolCallId === String(u.toolCallId)
              ? {
                  ...tc,
                  ...(u.title ? { title: String(u.title) } : {}),
                  ...(u.rawInput !== undefined ? { rawInput: u.rawInput } : {}),
                  status: (u.status as AcpToolCallEvent['status']) || tc.status,
                }
              : tc
          );
        } else if (u.sessionUpdate === 'plan' && Array.isArray(u.entries)) {
          target.plan = (u.entries as AcpPlanEntry[]).map((e) => ({ content: e.content, status: e.status }));
        }

        copy[lastAgentIdx] = target;
        return copy;
      });
    }
  };

  /* ---------------------------------------------------------------- */
  /* History                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Apply an edit. `live` edits (scrubbing, dragging, typing) update the scene
   * without touching history; the next committed edit records one undo step
   * back to where the live edit started.
   */
  const commitParts = useCallback(
    (updater: (prev: ScenePart[]) => ScenePart[], live = false) => {
      const pose = projectRef.current.pose;
      setDoc((d) =>
        live
          ? { ...d, base: d.base ?? d.parts, parts: updater(d.parts) }
          : {
              parts: updater(d.parts),
              past: [...d.past.slice(-(HISTORY_LIMIT - 1)), { parts: d.base ?? d.parts, pose }],
              future: [],
              base: null,
            }
      );
      lastPoseEditRef.current = 0;
    },
    []
  );

  /**
   * A pose change is one undo step. Changes in quick succession (a slider or ring drag, typing)
   * fold into the step that started them.
   */
  const lastPoseEditRef = useRef(0);
  const recordPoseEdit = useCallback((before: RobotPoseState | undefined) => {
    const now = performance.now();
    const folds = now - lastPoseEditRef.current < 700;
    lastPoseEditRef.current = now;
    if (folds) return;
    setDoc((d) => ({ ...d, past: [...d.past.slice(-(HISTORY_LIMIT - 1)), { parts: d.base ?? d.parts, pose: before }], future: [], base: null }));
  }, []);
  // Set once posing exists (below): puts a pose back without recording it
  const restorePoseRef = useRef<(pose: RobotPoseState | undefined) => void>(() => {});
  const docRef = useRef(doc);
  docRef.current = doc;

  const resetDoc = useCallback((next: ScenePart[]) => {
    setDoc({ parts: next, past: [], future: [], base: null });
  }, []);

  const handleUndo = useCallback(() => {
    const d = docRef.current;
    if (d.past.length === 0) return;
    const to = d.past[d.past.length - 1];
    const here: Snapshot = { parts: d.parts, pose: projectRef.current.pose };
    const next: DocState = { parts: to.parts, past: d.past.slice(0, -1), future: [...d.future, here], base: null };
    docRef.current = next;
    setDoc(next);
    lastPoseEditRef.current = 0;
    if (to.pose !== here.pose) restorePoseRef.current(to.pose);
  }, []);

  const handleRedo = useCallback(() => {
    const d = docRef.current;
    if (d.future.length === 0) return;
    const to = d.future[d.future.length - 1];
    const here: Snapshot = { parts: d.parts, pose: projectRef.current.pose };
    const next: DocState = { parts: to.parts, past: [...d.past, here], future: d.future.slice(0, -1), base: null };
    docRef.current = next;
    setDoc(next);
    lastPoseEditRef.current = 0;
    if (to.pose !== here.pose) restorePoseRef.current(to.pose);
  }, []);

  const selectedPart = parts.find((p) => p.id === selectedPartId) || null;
  const studioMode: StudioSubTab | null = transformMode === 'sculpt' ? 'clay' : creator;
  const viewportPartsNoImages = useMemo(() => parts.filter((p) => p.kind !== 'image_plane'), [parts]);
  const selectedParts = useMemo(
    () => selectedIds.map((id) => parts.find((p) => p.id === id)).filter((p): p is ScenePart => !!p),
    [selectedIds, parts]
  );

  // Joints, the pose on the canvas, saved poses and animations
  const posing = usePosing({ parts, project, projectRef, setProject, viewportRef, selectedIds, transformMode, onPoseEdit: recordPoseEdit });
  restorePoseRef.current = posing.restorePose;

  /**
   * Canvas / Layers click. Plain click selects the part's whole group; double-click
   * (`drill`) selects just that part. Once inside a group, a plain click on another
   * member selects that member. Shift/⌘ toggles. The Pose tool selects just the part
   * (its link's joint gets the ring).
   */
  const handleSelect = useCallback(
    (id: string | null, additive = false, drill = false) => {
      if (!id) {
        if (!additive) setSelectedIds([]);
        return;
      }
      if (transformMode === 'pose' && !additive) {
        // Another robot: select all of it first; a click on the selected robot picks a joint
        const rig = posing.rig;
        const key = rig.robotOf.get(id);
        if (key && key !== robotOfParts(rig, selectedIds)?.key) {
          const robot = rig.robots.find((r) => r.key === key)!;
          setSelectedIds(parts.filter((p) => robot.parts.has(p.id)).map((p) => p.id));
          return;
        }
        setSelectedIds([id]);
        return;
      }
      const part = parts.find((p) => p.id === id);
      const unit = part?.group ? expandToGroups(parts, [id]) : [id];
      setSelectedIds((prev) => {
        if (additive) {
          const has = prev.includes(id);
          return has ? prev.filter((x) => !unit.includes(x)) : [...prev, ...unit.filter((x) => !prev.includes(x))];
        }
        if (drill) return [id];
        const insideGroup = unit.length > 1 && prev.length > 0 && prev.length < unit.length && prev.every((x) => unit.includes(x));
        return insideGroup ? [id] : unit;
      });
    },
    [parts, transformMode, posing.rig, selectedIds]
  );

  /* ---------------------------------------------------------------- */
  /* Parts                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * A catalog part its maker publishes with joints (a hand): the articulated model, so its fingers
   * pose. The palm carries the catalog id (Product section, one line in the BOM). If the model
   * can't be downloaded, the fixed catalog mesh goes in instead.
   */
  const handleAddArticulated = useCallback(
    async (item: CatalogItem, at: [number, number, number] | undefined, addFixed: () => void) => {
      const src = ARTICULATED_PARTS[item.componentId!];
      showToast(`Adding ${item.name}…`, { tone: 'progress' });
      let robot: Awaited<ReturnType<typeof importRobot>>;
      try {
        robot = await importRobot({ kind: 'url', url: src.url }, { name: item.name, rotate: src.rotate, color: src.color });
      } catch {
        addFixed();
        showToast(`Added ${item.name} without its joints. Its model couldn’t be downloaded.`);
        return;
      }
      // At the drop point, else beside what's in the scene
      const lo = [0, 1, 2].map((i) => Math.min(...robot.parts.map((p) => p.position[i] - [p.dimensions.width, p.dimensions.height, p.dimensions.depth][i] / 2)));
      const hi = [0, 1, 2].map((i) => Math.max(...robot.parts.map((p) => p.position[i] + [p.dimensions.width, p.dimensions.height, p.dimensions.depth][i] / 2)));
      let shift: [number, number, number] = [0, 0, 0];
      if (at) shift = [at[0] - (lo[0] + hi[0]) / 2, at[1] - lo[1], at[2] - (lo[2] + hi[2]) / 2];
      else {
        const others = partsRef.current.filter((p) => p.visible && p.kind !== 'image_plane');
        if (others.length) shift = [Math.ceil(Math.max(...others.map((p) => p.position[0] + halfExtents(p)[0])) - lo[0] + 40), 0, 0];
      }
      const owned = new Set(robot.joints.flatMap((j) => j.child));
      const palm = robot.parts.find((p) => !owned.has(p.id)) ?? robot.parts[0];
      const parts = robot.parts.map((p) => ({
        ...p,
        position: [p.position[0] + shift[0], p.position[1] + shift[1], p.position[2] + shift[2]] as [number, number, number],
        ...(p.id === palm.id ? { componentId: item.componentId } : {}),
      }));
      const unique = uniqueJointIds(robot.joints, (projectRef.current.joints ?? []).map((j) => j.id));
      const joints = unique.map((j) => anchorJoint({ ...j, origin: [j.origin[0] + shift[0], j.origin[1] + shift[1], j.origin[2] + shift[2]] }, parts));
      commitParts((prev) => [...prev, ...parts]);
      const next = { ...projectRef.current, joints: [...(projectRef.current.joints ?? []), ...joints] };
      projectRef.current = next;
      setProject(next);
      setSelectedIds(parts.map((p) => p.id));
      frameNextRef.current = true;
      showToast(`Added ${item.name} · ${joints.length} ${joints.length === 1 ? 'joint' : 'joints'}`, {
        action: joints.length ? { label: 'Pose', onClick: () => openPoseRef.current() } : undefined,
      });
    },
    [commitParts, showToast]
  );

  /** `at` is a drop point: x/z of where it lands and the surface height (y) under it */
  const handleAddCatalogItem = useCallback(
    (item: CatalogItem, at?: [number, number, number], fixed = false) => {
      if (!fixed && item.componentId && ARTICULATED_PARTS[item.componentId]) {
        void handleAddArticulated(item, at, () => handleAddCatalogItemRef.current(item, at, true));
        return;
      }
      const id = newId();
      commitParts((prev) => {
        const atOrigin = prev.filter(
          (p) => Math.abs(p.position[0]) < 8 && Math.abs(p.position[2]) < 8
        ).length;
        const offset = atOrigin * 12;
        const sameKind = prev.filter((p) => p.kind === item.kind && p.componentId === item.componentId).length;
        // Hardware is named by its spec ("M3 × 10 Socket Head Screw"); duplicates are normal
        const name = item.hardware
          ? hardwareName(item.hardware)
          : sameKind === 0
            ? item.name
            : `${item.name} ${sameKind + 1}`;
        return [
          ...prev,
          {
            id,
            name,
            kind: item.kind,
            category: item.category,
            role: item.defaultRole,
            position: at
              ? [at[0], Math.round((at[1] + item.defaultDimensions.height / 2) * 100) / 100, at[2]]
              : [offset, Math.round((item.defaultDimensions.height / 2) * 100) / 100, offset],
            rotation: [0, 0, 0],
            dimensions: { ...item.defaultDimensions },
            color: item.defaultColor,
            note: item.hardware ? hardwareNote(item.hardware) : catalogNote(item),
            mechanicalTag: item.defaultTag,
            visible: true,
            locked: false,
            hardware: item.hardware,
            componentId: item.componentId,
          },
        ];
      });
      setSelectedIds([id]);
      showToast(`Added ${item.hardware ? hardwareName(item.hardware) : item.name}`);
    },
    [commitParts, showToast, handleAddArticulated]
  );
  const handleAddCatalogItemRef = useRef(handleAddCatalogItem);
  handleAddCatalogItemRef.current = handleAddCatalogItem;

  const handlePlaceCustomModel = useCallback(
    (model: CustomModelDefinition, at?: [number, number, number]) => {
      const base: [number, number, number] = at
        ? [at[0], Math.round((at[1] + model.defaultDimensions.height / 2) * 10) / 10, at[2]]
        : [0, Math.round(model.defaultDimensions.height / 2), 0];

      // Models saved from a scene come back as their real parts, grouped under the model's name
      const { parts: inserted, missingShapes } = modelToParts(model, base, newId);
      commitParts((prev) => [...prev, ...inserted]);
      setSelectedIds(inserted.map((p) => p.id));
      showToast(
        missingShapes
          ? `Inserted ${model.name} as blocks. Save it to Library again from a scene to keep its CAD shapes.`
          : `Inserted ${model.name}`,
        missingShapes ? { tone: 'error' } : {}
      );
    },
    [commitParts, showToast]
  );

  /** Reference photo on an upright plane. `at` is a floor point (x, z used). */
  const handleAddImagePlane = useCallback(
    async (file: Blob, name = 'Reference', at?: [number, number, number] | null) => {
      try {
        const { dataUrl, width, height } = await readImageFile(file);
        const maxSide = 120;
        const w = width >= height ? maxSide : Math.round((maxSide * width) / height);
        const h = width >= height ? Math.round((maxSide * height) / width) : maxSide;
        const id = newId('image');
        commitParts((prev) => {
          const existing = prev.filter((p) => p.kind === 'image_plane').length;
          const x = at ? Math.round(at[0]) : existing * 16;
          const z = at ? Math.round(at[2]) : -40 - existing * 8;
          return [
            ...prev,
            {
              id,
              name: name.replace(/\.[a-z0-9]+$/i, '') || 'Reference',
              kind: 'image_plane',
              category: 'ai_markers',
              role: 'reference',
              position: [x, h / 2, z],
              rotation: [0, 0, 0],
              dimensions: { width: w, height: h, depth: 1 },
              color: '#ffffff',
              opacity: 1,
              note: '',
              mechanicalTag: 'Reference Axis',
              visible: true,
              locked: false,
              imageDataUrl: dataUrl,
            },
          ];
        });
        setSelectedIds([id]);
        setTransformMode('translate');
        showToast('Added reference image');
      } catch (err) {
        showToast(`Couldn’t add image. ${String((err as Error).message ?? err)}`, { tone: 'error' });
      }
    },
    [commitParts, showToast]
  );

  const pickReferenceImage = useCallback((at?: [number, number, number] | null) => {
    imagePlaceRef.current = at ?? null;
    imageInputRef.current?.click();
  }, []);

  const handleSaveAsModel = useCallback(
    async (mode: 'selected' | 'all') => {
      const sourceParts =
        mode === 'selected' && selectedParts.length > 0 ? selectedParts : parts.filter((p) => p.visible);

      if (sourceParts.length === 0) {
        showToast('Add or select a part first', { tone: 'error' });
        return;
      }

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of sourceParts) {
        minX = Math.min(minX, p.position[0] - p.dimensions.width / 2);
        minY = Math.min(minY, p.position[1] - p.dimensions.height / 2);
        minZ = Math.min(minZ, p.position[2] - p.dimensions.depth / 2);
        maxX = Math.max(maxX, p.position[0] + p.dimensions.width / 2);
        maxY = Math.max(maxY, p.position[1] + p.dimensions.height / 2);
        maxZ = Math.max(maxZ, p.position[2] + p.dimensions.depth / 2);
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const cz = (minZ + maxZ) / 2;
      const r = (v: number) => Math.round(v * 10) / 10;

      // Each part is kept whole, so CAD parts, meshes and hardware come back exactly on insert
      const nodes: CustomModelSubNode[] = sourceParts.map((p) => {
        const { id: _id, position: _position, group: _group, ...part } = p;
        return {
          id: `node-${p.id}`,
          name: p.name,
          nodeType: 'primitive',
          primitiveKind: p.kind === 'custom_model' || p.kind === 'sculpt_mesh' ? 'box' : p.kind,
          role: p.role,
          position: [r(p.position[0] - cx), r(p.position[1] - cy), r(p.position[2] - cz)],
          rotation: [...p.rotation],
          dimensions: { ...p.dimensions },
          color: p.color,
          deformers: p.deformers,
          part,
        };
      });

      const isSingle = mode === 'selected' && selectedParts.length === 1 && !!selectedPart;
      const modelDef: CustomModelDefinition = {
        id: `model-${Date.now().toString(36)}`,
        name: isSingle ? selectedPart!.name : sceneName,
        description: isSingle
          ? selectedPart!.note || `Saved from scene (${selectedPart!.kind})`
          : `Saved from ${sourceParts.length} parts`,
        createdAt: new Date().toISOString(),
        sourceType: 'scene-selection',
        sourceImageDataUrl: isSingle
          ? selectedPart!.sourceImageDataUrl
          : viewportRef.current?.captureScreenshot(),
        defaultDimensions: {
          width: Math.max(4, Math.round(maxX - minX)),
          height: Math.max(4, Math.round(maxY - minY)),
          depth: Math.max(4, Math.round(maxZ - minZ)),
          thickness: 4,
        },
        defaultColor: sourceParts[0].color,
        mechanicalTag: sourceParts[0].mechanicalTag || '3D Printed PLA/PETG',
        nodes,
      };

      const saved = await platformBridge.saveModel(modelDef);
      setCustomModels(await platformBridge.listModels());
      setIsLeftOpen(true);
      setLeftTab('library');
      showToast(`Saved ${saved.name} to Library`);
    },
    [parts, selectedPart, selectedParts, sceneName, showToast, setCustomModels, setIsLeftOpen]
  );

  const handleSaveScene = useCallback(async () => {
    const screenshot = viewportRef.current?.captureScreenshot() || '';
    const { spec, markdown } = buildAIHandoffPayload(sceneName, globalGoal, parts, annotations);
    const saved = await platformBridge.saveScene({
      id: sceneId,
      name: sceneName,
      globalGoal,
      parts,
      annotations,
      project,
      referenceImages: uploadedImages,
      thumbnailDataUrl: screenshot,
      spec,
      markdown,
    });
    setSceneId(saved.id);
    setSavedScenes(await platformBridge.listScenes());
    return saved;
  }, [sceneId, sceneName, globalGoal, parts, annotations, project, uploadedImages, setSavedScenes]);

  /* Library: rename, duplicate and delete saved scenes and models */

  // Rewrites go without the stored thumbnail: the backend copies it to ai-reference/preview.png,
  // which must keep showing the scene that was saved last. Library thumbnails render from parts.
  const resaveScene = useCallback(
    async (record: SavedSceneRecord) => {
      await platformBridge.saveScene({ ...record, thumbnailDataUrl: undefined });
      setSavedScenes(await platformBridge.listScenes());
    },
    [setSavedScenes]
  );
  const resaveModel = useCallback(
    async (model: CustomModelDefinition) => {
      await platformBridge.saveModel(model);
      setCustomModels(await platformBridge.listModels());
    },
    [setCustomModels]
  );

  const handleRenameLibraryScene = useCallback(
    async (record: SavedSceneRecord, name: string) => {
      // A scene open in a tab is renamed there too, so its next save keeps the new name
      const tab = studio.tabs.find((t) => t.sceneId === record.id);
      if (tab) studio.renameTab(tab.id, name);
      await resaveScene({ ...record, name });
      showToast(`Renamed to ${name}`);
    },
    [studio, resaveScene, showToast]
  );
  const handleDuplicateLibraryScene = useCallback(
    async (record: SavedSceneRecord) => {
      const name = copyName(record.name, savedScenes.map((s) => s.name));
      await resaveScene({ ...record, id: newSceneId(), name });
      showToast(`Duplicated ${record.name}`);
    },
    [savedScenes, resaveScene, showToast]
  );
  const handleDeleteLibraryScene = useCallback(
    async (record: SavedSceneRecord) => {
      setSavedScenes(await platformBridge.deleteScene(record.id));
      showToast(`Deleted ${record.name}`, { tone: 'neutral', action: { label: 'Undo', onClick: () => void resaveScene(record) } });
    },
    [setSavedScenes, resaveScene, showToast]
  );
  const handleRenameLibraryModel = useCallback(
    async (model: CustomModelDefinition, name: string) => {
      await resaveModel({ ...model, name });
      showToast(`Renamed to ${name}`);
    },
    [resaveModel, showToast]
  );
  const handleDuplicateLibraryModel = useCallback(
    async (model: CustomModelDefinition) => {
      const name = copyName(model.name, customModels.map((m) => m.name));
      await resaveModel({ ...model, id: `model-${Date.now().toString(36)}`, name, createdAt: new Date().toISOString() });
      showToast(`Duplicated ${model.name}`);
    },
    [customModels, resaveModel, showToast]
  );
  const handleDeleteLibraryModel = useCallback(
    async (model: CustomModelDefinition) => {
      setCustomModels(await platformBridge.deleteModel(model.id));
      showToast(`Deleted ${model.name}`, { tone: 'neutral', action: { label: 'Undo', onClick: () => void resaveModel(model) } });
    },
    [setCustomModels, resaveModel, showToast]
  );

  const handleChangeProject = useCallback((patch: Partial<ProjectSettings>) => setProject((p) => ({ ...p, ...patch })), []);
  const measureParts = useCallback(() => viewportRef.current?.measureParts() ?? {}, []);
  const partTriangles = useCallback((id: string) => viewportRef.current?.partTriangles(id) ?? null, []);
  /** Engineering checks on the scene as it is (the joint sweep is the slow part) */
  const runEngineeringNow = useCallback((withSweep: boolean) => {
    const vp = viewportRef.current;
    const ps = partsRef.current;
    const servoOutputs: Record<string, ServoOutput> = {};
    for (const p of ps) {
      if (p.kind !== 'component' || !p.componentId || COMPONENT_BY_ID[p.componentId]?.group !== 'Servos') continue;
      const out = vp?.servoOutput(p.id);
      if (out) servoOutputs[p.id] = out;
    }
    return runEngineering({
      parts: ps,
      // Joints anchored to a part follow it when the robot moves
      project: { ...projectRef.current, joints: resolveJoints(projectRef.current.joints ?? [], ps) },
      measures: vp?.measureParts() ?? {},
      servoOutputs,
      sweep: withSweep && vp ? (moving, origin, axis, angles) => vp.sweepClashes(moving, origin, axis, angles) : undefined,
    });
  }, []);

  const handleSync = useCallback(async () => {
    try {
      showToast('Saving…', { tone: 'progress' });
      await handleSaveScene();
      showToast(`Saved ${sceneName}`);
    } catch (err) {
      showToast(`Couldn’t save. ${String(err)}`, { tone: 'error' });
    }
  }, [handleSaveScene, showToast, sceneName]);

  /** Opens a scene in this tab (only an untouched tab is reused; see App.openScene) */
  const loadSeed = (next: WorkspaceSeed, toast?: string) => {
    setSceneId(next.sceneId);
    setSceneName(next.sceneName);
    setGlobalGoal(next.globalGoal || '');
    setProject(normalizeProject({ ...DEFAULT_PROJECT, ...next.project }));
    resetDoc(next.parts || []);
    setAnnotations(next.annotations || []);
    setActiveAnnotationId(null);
    setAnnotationDraft(null);
    setSelectedIds([]);
    if (toast) showToast(toast);
  };

  /* ---------------------------------------------------------------- */
  /* Agent                                                            */
  /* ---------------------------------------------------------------- */

  const handleUploadImage = async (file: File) => {
    // 1568px long edge is what Claude's vision uses; larger only costs time
    const { dataUrl, width, height } = await readImageFile(file, 1568);
    const features = await analyzeImageFor3D(dataUrl, 70, 12);
    const record = await platformBridge.uploadImage({ name: file.name, dataUrl, width, height });
    setUploadedImages(await platformBridge.listImages());
    return { record, features };
  };

  // Mirrors isAcpBusy synchronously, so a message sent mid-run steers instead of starting a run
  const agentBusyRef = useRef(false);
  // Messages sent mid-run that the agent couldn't take at once; they go out when the run ends
  const queuedPromptsRef = useRef<Array<{ messageId: string; payload: AcpPromptPayload }>>([]);

  /**
   * Run one prompt. With Claude Code the agent edits the scene live through the CAD tools;
   * the offline agent writes a model file we then place. Queued messages follow in order.
   */
  const runAgentPrompt = async (payload: AcpPromptPayload) => {
    agentBusyRef.current = true;
    setIsAcpBusy(true);
    setAgentStatus('');
    agentFollowRef.current = true;
    setAgentRunBase(partsRef.current);
    try {
      // A reopened conversation picks its session back up before the first new message
      const resume = pendingResumeRef.current;
      if (resume) {
        pendingResumeRef.current = null;
        const status = await platformBridge.resumeAcp(resume, workspaceId).catch(() => null);
        if (status?.sessionId) setAcpSessionId(status.sessionId);
      }
      const modelCountBefore = (await platformBridge.listModels().catch(() => [])).length;
      const res = await platformBridge.sendAcpPrompt({ ...payload, workspaceId });
      if (res.sessionId) setAcpSessionId(res.sessionId);
      if (Array.isArray(res.models)) {
        setCustomModels(res.models);
        // Offline agent: place the model it just wrote
        if (res.models.length > modelCountBefore) handlePlaceCustomModel(res.models[0]);
      }
      if (res.stopReason === 'cancelled') {
        setAcpMessages((prev) => {
          const lastAgent = prev.map((m) => m.role).lastIndexOf('agent');
          return prev.map((m, i) => (i === lastAgent ? { ...m, stopped: true } : m));
        });
      }
    } catch (err) {
      showToast(`Agent error. ${String((err as Error).message ?? err)}`, { tone: 'error' });
    }
    const next = aliveRef.current ? queuedPromptsRef.current.shift() : undefined;
    if (next) {
      const now = Date.now();
      setAcpMessages((prev) => [
        ...prev.map((m) => (m.id === next.messageId ? { ...m, queued: false } : m)),
        { id: `msg-agent-${now}`, role: 'agent', text: '', timestamp: new Date().toISOString(), toolCalls: [] },
      ]);
      await runAgentPrompt(next.payload);
      return;
    }
    agentBusyRef.current = false;
    setIsAcpBusy(false);
    setAgentStatus('');
  };

  /** Send a message. While the agent works, it steers the run in progress. */
  const handleSendToAgent = async (params: {
    text: string;
    images?: ReferenceImageRecord[];
    folders?: EvidenceFolder[];
    targetHeightMm?: number;
  }) => {
    const images = params.images ?? [];
    const folders = params.folders ?? [];
    const payload: AcpPromptPayload = {
      action: 'build',
      promptText: params.text,
      imageName: images[0]?.name,
      imageFilePath: images[0]?.filePath,
      imageDataUrls: images.map((i) => i.dataUrl),
      evidenceFolders: folders.map((f) => ({ id: f.id, name: f.name })),
      targetHeightMm: params.targetHeightMm || undefined,
    };
    const now = Date.now();
    const userMessage: AcpChatMessage = {
      id: `msg-user-${now}`,
      role: 'user',
      text: params.text,
      timestamp: new Date().toISOString(),
      imageAttachments: images.map((i) => i.dataUrl),
      folderAttachments: folders.length ? folders.map((f) => ({ id: f.id, name: f.name, fileCount: f.fileCount })) : undefined,
    };
    const agentMessage: AcpChatMessage = { id: `msg-agent-${now + 1}`, role: 'agent', text: '', timestamp: new Date().toISOString(), toolCalls: [] };

    if (agentBusyRef.current) {
      // Claude reads it between steps and answers below it; otherwise it waits for the run to end
      const outcome = await platformBridge.steerAcp({ ...payload, workspaceId });
      if (outcome === 'injected') {
        setAcpMessages((prev) => [...prev, userMessage, agentMessage]);
      } else {
        queuedPromptsRef.current.push({ messageId: userMessage.id, payload });
        setAcpMessages((prev) => [...prev, { ...userMessage, queued: true }]);
      }
      return;
    }

    if (!chatId) setChatId(newId('chat'));
    setAcpMessages((prev) => [...prev, userMessage, agentMessage]);
    await runAgentPrompt(payload);
  };

  const handleStopAgent = () => {
    // Stopping drops queued messages too
    const dropped = new Set(queuedPromptsRef.current.map((q) => q.messageId));
    queuedPromptsRef.current = [];
    if (dropped.size) setAcpMessages((prev) => prev.map((m) => (dropped.has(m.id) ? { ...m, queued: false, notSent: true } : m)));
    platformBridge.cancelAcp(workspaceId).catch(() => {});
  };

  const handleNewAgentChat = async () => {
    setAcpMessages([]);
    setChatId(null);
    setAgentRunBase(null);
    pendingResumeRef.current = null;
    try {
      setAcpSessionId((await platformBridge.newAcpConversation(workspaceId)).sessionId);
    } catch {
      /* status stays as is */
    }
  };

  const handleOpenAgentChat = async (id: string) => {
    // A conversation lives in one scene: show the tab that already has it open
    if (studio.focusChat(id, workspaceId)) return;
    const conv = await platformBridge.getChat(id);
    if (!conv) return;
    setChatId(conv.id);
    setAcpMessages(conv.messages);
    setAgentRunBase(null);
    pendingResumeRef.current = null;
    try {
      const status = conv.acpSessionId
        ? await platformBridge.resumeAcp(conv.acpSessionId, workspaceId)
        : await platformBridge.newAcpConversation(workspaceId);
      setAcpSessionId(status.sessionId);
    } catch {
      /* transcript stays readable */
    }
  };

  const handleDeleteAgentChat = async (id: string) => {
    setChatList(await platformBridge.deleteChat(id));
    if (id === chatId) handleNewAgentChat();
  };

  const saveChat = (id: string | null, messages: AcpChatMessage[], sessionId: string | null) => {
    if (!id || !messages.length) return;
    const firstUser = messages.find((m) => m.role === 'user');
    const title = (
      firstUser?.text ||
      firstUser?.folderAttachments?.[0]?.name ||
      (firstUser?.imageAttachments?.length ? 'Image build' : 'Chat')
    ).slice(0, 80);
    platformBridge
      .saveChat({
        id,
        title,
        acpSessionId: sessionId,
        createdAt: messages[0]?.timestamp ?? new Date().toISOString(),
        messages,
      })
      .then(setChatList)
      .catch(() => {});
  };

  // Save the conversation each time a run finishes; a scene in the background says it's done
  const wasBusyRef = useRef(false);
  useEffect(() => {
    if (wasBusyRef.current && !isAcpBusy) {
      saveChat(chatId, acpMessages, acpSessionId);
      if (!activeRef.current && aliveRef.current) studio.notify(workspaceId, `Agent finished in ${sceneName}`);
    }
    wasBusyRef.current = isAcpBusy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAcpBusy, chatId, acpMessages, acpSessionId]);

  /** Restore the scene to how it was before the last agent run (undoable) */
  const handleRevertAgentRun = () => {
    const base = agentRunBase;
    if (!base) return;
    commitParts(() => base);
    setAgentRunBase(null);
    showToast('Reverted agent changes', { action: { label: 'Undo', onClick: handleUndo } });
  };

  /* ---------------------------------------------------------------- */
  /* Agent → canvas (requests from the CAD MCP tools)                 */
  /* ---------------------------------------------------------------- */

  const agentQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Camera follows the agent's work until the user moves the view themselves
  const agentFollowRef = useRef(true);

  /** The agent's posing tools (get_rig, pose, animate, retarget, import_robot) */
  const runPoseTool = async (kind: string, payload: Record<string, unknown>): Promise<PoseReply> => {
    const live = devRef.current.posing!;
    const ctx: PoseContext = {
      parts: partsRef.current,
      project: projectRef.current,
      viewport: viewportRef.current,
      setPose: live.setPose,
      savePose: (name, state) => {
        const robot = (state as { robot?: string }).robot;
        // Same name on the same robot replaces
        const list = (projectRef.current.poses ?? []).filter((p) => !(p.name === name && p.robot === robot));
        const next = { ...projectRef.current, poses: [...list, { id: newId('pose'), name, values: { ...state.values }, root: state.root, robot }] };
        projectRef.current = next;
        setProject(next);
      },
      addAnimation: live.addAnimation,
      play: live.play,
      selectedIds,
    };
    let reply: PoseReply;
    if (kind === 'get_rig') reply = getRig(ctx, typeof payload.robot === 'string' ? payload.robot : undefined);
    else if (kind === 'pose') {
      setAgentAction('Posing');
      reply = setPoseRequest(ctx, payload as PosePayload);
    } else if (kind === 'animate') {
      setAgentAction(`Animating ${String(payload.name ?? '')}`);
      reply = animateRequest(ctx, payload as unknown as AnimatePayload);
    } else if (kind === 'retarget') {
      setAgentAction('Retargeting motion');
      reply = await retargetRequest(ctx, payload as RetargetPayload);
    } else {
      const pl = payload as { url?: string; preset?: string; name?: string };
      const preset = pl.preset ? ROBOT_PRESETS.find((r) => r.id === pl.preset) : undefined;
      const url = preset?.url ?? pl.url;
      if (!url) return { text: `Give a URL or one of the presets: ${ROBOT_PRESETS.map((r) => r.id).join(', ')}` };
      setAgentAction(`Importing ${preset?.title ?? 'robot'}`);
      const got = await handleImportRobot({ kind: 'url', url, name: pl.name ?? preset?.title });
      if (typeof got === 'string') reply = { text: got };
      else {
        const ys = got.parts.flatMap((p) => [p.position[1] - p.dimensions.height / 2, p.position[1] + p.dimensions.height / 2]);
        reply = {
          text:
            `Inserted ${got.name}: ${got.parts.length} parts (group "${got.name}"), ${got.joints.length} joints, ${Math.round(Math.max(...ys) - Math.min(...ys))} mm tall.` +
            (got.notes.length ? `\nMissing files: ${got.notes.slice(0, 8).join('; ')}` : '') +
            `\nCall get_rig for the joints.`,
        };
      }
    }
    return reply;
  };

  const runPoseToolRef = useRef(runPoseTool);
  runPoseToolRef.current = runPoseTool;
  const handleAgentRequest = async (event: { requestId: string; kind: string; payload: Record<string, unknown> }) => {
    const respond = (result?: unknown, error?: string) =>
      platformBridge.respondToAgent({ requestId: event.requestId, result, error });

    try {
      if (event.kind === 'snapshot') {
        await respond(snapshotScene(partsRef.current));
        return;
      }

      if (event.kind === 'focus') {
        const id = String(event.payload.id ?? '');
        const existing = partsRef.current.find((p) => p.id === id);
        if (existing) {
          setAgentCursorTarget([existing.position[0], existing.position[1] + existing.dimensions.height / 2, existing.position[2]]);
        } else if (Array.isArray(event.payload.position)) {
          setAgentCursorTarget(toScene(event.payload.position as [number, number, number]));
        }
        setAgentAction(String(event.payload.label ?? ''));
        await respond({ ok: true });
        return;
      }

      if (event.kind === 'part_code') {
        await respond(partCode(partsRef.current, String(event.payload.id)));
        return;
      }

      // Posing: joints, poses, animations, motion capture, published robots
      if (['get_rig', 'pose', 'animate', 'retarget', 'import_robot'].includes(event.kind)) {
        const reply = await runPoseTool(event.kind, event.payload);
        const images = reply.images
          ? await Promise.all(reply.images.map(async (s) => ({ view: s.view, dataUrl: await downscaleDataUrl(s.dataUrl, 768) })))
          : undefined;
        await respond({ text: reply.text, images });
        return;
      }

      if (event.kind === 'screenshot') {
        const views = (event.payload.views as string[] | undefined) ?? ['iso'];
        const ids = (event.payload.ids as string[] | undefined) ?? undefined;
        setAgentAction(ids?.length ? `Inspecting ${ids.length === 1 ? partsRef.current.find((p) => p.id === ids[0])?.name ?? ids[0] : `${ids.length} parts`}` : 'Looking');
        const shots = viewportRef.current?.captureViews(views, ids) ?? [];
        const images = await Promise.all(
          shots.map(async (s) => ({ view: s.view, dataUrl: await downscaleDataUrl(s.dataUrl, 1024) }))
        );
        await respond({ images });
        return;
      }

      if (event.kind === 'interference') {
        const ids = (event.payload.ids as string[] | undefined) ?? undefined;
        const found = viewportRef.current?.interference(ids) ?? { interferences: [], coplanar: [] };
        await respond({ items: found.interferences, coplanar: found.coplanar });
        return;
      }

      if (event.kind === 'silhouette_compare') {
        // Proportions of a straight-on reference photo vs the model from the same view
        const view = String(event.payload.view ?? 'front');
        const ids = (event.payload.ids as string[] | undefined) ?? undefined;
        const ref = await photoProfile(String(event.payload.reference));
        const [shot] = viewportRef.current?.captureViews([view], ids, { silhouette: true }) ?? [];
        const model = shot ? await maskProfile(shot.dataUrl) : null;
        await respond({ reference: ref.profile, plain: ref.plain, reason: ref.reason, model });
        return;
      }

      if (event.kind === 'bom') {
        const print = buildPrintReport(partsRef.current, projectRef.current, (id) => viewportRef.current?.partTriangles(id) ?? null);
        const supportG: Partial<Record<ProjectSettings['material'], number>> = {};
        for (const r of print.parts) supportG[r.material] = (supportG[r.material] ?? 0) + r.supportG;
        const bom = buildBom(partsRef.current, projectRef.current, await platformBridge.listPurchases(), viewportRef.current?.measureParts() ?? {}, new Date(), supportG);
        await respond({ text: bomText(bom, Object.fromEntries(partsRef.current.map((p) => [p.id, p.name]))) });
        return;
      }

      if (event.kind === 'printability') {
        const ids = event.payload.ids as string[] | undefined;
        const parts = ids?.length ? partsRef.current.filter((p) => ids.includes(p.id)) : partsRef.current;
        await respond({ text: printReportText(buildPrintReport(parts, projectRef.current, (id) => viewportRef.current?.partTriangles(id) ?? null)) });
        return;
      }

      if (event.kind === 'define_joints') {
        const pl = event.payload as {
          joints: Array<{
            id: string;
            name?: string;
            type?: RobotJoint['type'];
            parent: string[];
            child: string[];
            parent_joint?: string;
            actuators?: string[];
            origin?: [number, number, number];
            axis?: [number, number, number];
            range?: [number, number];
            limb?: RobotJoint['limb'];
          }>;
          replace?: boolean;
        };
        const ids = new Set(partsRef.current.map((p) => p.id));
        const problems: string[] = [];
        const made: RobotJoint[] = [];
        for (const j of pl.joints ?? []) {
          const missing = [...j.parent, ...j.child, ...(j.actuators ?? [])].filter((id) => !ids.has(id));
          if (missing.length) {
            problems.push(`${j.id}: no parts named ${missing.join(', ')}`);
            continue;
          }
          const both = j.parent.filter((id) => j.child.includes(id));
          if (both.length) {
            problems.push(`${j.id}: ${both.join(', ')} can't be on both sides`);
            continue;
          }
          // Pivot and axis from the servo's real output unless given
          const out = j.actuators?.length ? viewportRef.current?.servoOutput(j.actuators[0]) : null;
          const origin = j.origin ? toScene(j.origin) : out?.point;
          const axis = j.axis ? toScene(j.axis) : out?.axis;
          if (!origin || !axis) {
            problems.push(`${j.id}: give origin and axis, or an actuator to take them from`);
            continue;
          }
          made.push(
            anchorJoint(
              { id: j.id, name: j.name ?? j.id, type: j.type ?? 'revolute', parent: j.parent, child: j.child, parentJoint: j.parent_joint, origin, axis, range: j.range, actuators: j.actuators, limb: j.limb },
              partsRef.current
            )
          );
        }
        const keep = pl.replace ? [] : (projectRef.current.joints ?? []).filter((j) => !made.some((m) => m.id === j.id));
        const next = { ...projectRef.current, joints: [...keep, ...made] };
        projectRef.current = next;
        setProject(next);
        await respond({
          text:
            `${next.joints.length} joints declared.` +
            (made.length ? `\n${made.map((j) => `- ${j.id}: axis [${toCad(j.axis).map((v) => v.toFixed(2)).join(', ')}] through [${toCad(j.origin).map((v) => Math.round(v)).join(', ')}]${j.origin && !pl.joints.find((x) => x.id === j.id)?.origin ? ' (from the servo output)' : ''}`).join('\n')}` : '') +
            (problems.length ? `\nNot declared:\n- ${problems.join('\n- ')}` : ''),
        });
        return;
      }

      if (event.kind === 'verify') {
        setAgentAction('Checking the design');
        const report = runEngineeringNow(true);
        await respond({ text: engineeringText(report, toCad) });
        return;
      }

      if (event.kind === 'set_build') {
        // Purchase-only extras (merged by key; qty 0 removes), the budget and the default filament
        const pl = event.payload as { extras?: Array<{ key: string; qty: number; note?: string }>; budgetUsd?: number; material?: ProjectSettings['material'] };
        const bad = (pl.extras ?? []).filter((x) => !describeKey(x.key)).map((x) => x.key);
        const next = { ...projectRef.current };
        if (pl.extras) {
          const map = new Map((next.extras ?? []).map((x) => [x.key, x]));
          for (const x of pl.extras) {
            if (bad.includes(x.key)) continue;
            if (x.qty > 0) map.set(x.key, { key: x.key, qty: Math.round(x.qty), note: x.note });
            else map.delete(x.key);
          }
          next.extras = [...map.values()];
        }
        if (pl.budgetUsd !== undefined) next.budgetUsd = pl.budgetUsd > 0 ? pl.budgetUsd : undefined;
        if (pl.material) next.material = pl.material;
        projectRef.current = next;
        setProject(next);
        await respond({ ok: true, unknown: bad, extras: next.extras ?? [] });
        return;
      }

      if (event.kind === 'catalog') {
        await respond({ text: agentCatalog(String(event.payload.query ?? '')) });
        return;
      }

            if (event.kind === 'downscale_image') {
        const maxSide = Number(event.payload.maxSide) || 1568;
        await respond({ dataUrl: await downscaleDataUrl(String(event.payload.dataUrl), maxSide, 0.88) });
        return;
      }

      if (event.kind === 'apply') {
        const ops = (event.payload.ops as AgentOp[]) ?? [];
        // Serialize runs so parts appear in order, one by one, with the cursor leading
        const run = agentQueueRef.current.then(() => applyAgentOps(ops));
        agentQueueRef.current = run.then(
          () => undefined,
          () => undefined
        );
        const summary = await run;
        await respond({ summary });
        return;
      }

      await respond(undefined, `Unknown request "${event.kind}"`);
    } catch (err) {
      await respond(undefined, String((err as Error).message ?? err));
    }
  };

  useEffect(() => {
    agentRequestRef.current = handleAgentRequest;
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const applyAgentOps = async (ops: AgentOp[]): Promise<string> => {
    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    const problems: string[] = [];
    const total = ops.length;

    for (let i = 0; i < total; i++) {
      const op = ops[i];
      const current = partsRef.current;
      const target = opTarget(op, current);
      if (target) setAgentCursorTarget(target);
      setAgentAction(
        `${op.op === 'add' ? 'Adding' : op.op === 'update' ? 'Adjusting' : op.op === 'delete' ? 'Removing' : 'Mirroring'} ${describeOp(op, current)}`
      );
      // Let the cursor arrive before the change lands
      await sleep(op.op === 'add' ? 260 : 160);

      // One undo step per tool call: live edits until the last op commits
      const live = i < total - 1;
      if (op.op === 'add') {
        let part: ScenePart;
        try {
          part = specToPart(op.part);
        } catch (err) {
          problems.push(String((err as Error).message ?? err));
          continue;
        }
        const exists = current.some((p) => p.id === part.id);
        commitParts((prev) => (exists ? prev.map((p) => (p.id === part.id ? part : p)) : [...prev, part]), live);
        viewportRef.current?.animateSpawn([part.id]);
        added.push(part.id);
      } else if (op.op === 'update') {
        if (!current.some((p) => p.id === op.part.id)) {
          problems.push(`${op.part.id} not found`);
        } else {
          commitParts((prev) => prev.map((p) => (p.id === op.part.id ? applySpec(p, op.part) : p)), live);
          updated.push(op.part.id);
        }
      } else if (op.op === 'delete') {
        if (!current.some((p) => p.id === op.id)) problems.push(`${op.id} not found`);
        commitParts((prev) => prev.filter((p) => p.id !== op.id), live);
        removed.push(op.id);
      } else if (op.op === 'mirror') {
        const copies = mirrorParts(current, op.ids, op.axis, op.rename);
        for (let j = 0; j < copies.length; j++) {
          const c = copies[j];
          setAgentCursorTarget([c.position[0], c.position[1] + c.dimensions.height / 2, c.position[2]]);
          await sleep(140);
          commitParts((prev) => [...prev.filter((p) => p.id !== c.id), c], live || j < copies.length - 1);
          viewportRef.current?.animateSpawn([c.id]);
          added.push(c.id);
        }
        const missing = op.ids.filter((id) => !current.some((p) => p.id === id));
        if (missing.length) problems.push(`not found: ${missing.join(', ')}`);
      }
      // Wait for React to commit so the next op reads fresh parts
      await sleep(30);
    }
    setAgentAction('');
    if (agentFollowRef.current && (added.length || removed.length)) viewportRef.current?.frameAll();

    const parts = [
      added.length ? `added ${added.join(', ')}` : '',
      updated.length ? `updated ${updated.join(', ')}` : '',
      removed.length ? `deleted ${removed.join(', ')}` : '',
    ].filter(Boolean);
    return `${parts.join('; ') || 'No changes'}.${problems.length ? ` Problems: ${problems.join('; ')}.` : ''}`;
  };

  /* ---------------------------------------------------------------- */
  /* Edits                                                            */
  /* ---------------------------------------------------------------- */

  const handleUpdateSelectedPart = useCallback(
    (patch: Partial<ScenePart>, live?: boolean) => {
      if (!selectedPartId) return;
      commitParts(
        (prev) => prev.map((p) => (p.id === selectedPartId ? { ...p, ...patch } : p)),
        !!live
      );
    },
    [selectedPartId, commitParts]
  );

  const handleUpdatePartTransform = useCallback(
    (
      id: string,
      position: [number, number, number],
      rotation: [number, number, number],
      dimensions?: ScenePart['dimensions']
    ) => {
      commitParts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, position, rotation, dimensions: dimensions || p.dimensions } : p
        )
      );
    },
    [commitParts]
  );

  const handleCommitSculptMesh = useCallback(
    (partId: string, sculptMesh: SculptMeshData) => {
      commitParts((prev) =>
        prev.map((p) => (p.id === partId ? { ...p, sculptMesh, kind: 'sculpt_mesh' as const } : p))
      );
    },
    [commitParts]
  );

  /** Opens Sketch or Import SVG in the right panel */
  const openCreator = useCallback((mode: 'draw2d' | 'svg') => {
    setIsRightOpen(true);
    setRightTab('inspector');
    setCreator(mode);
  }, [setIsRightOpen]);

  const handleSetTransformMode = useCallback(
    (mode: TransformMode) => {
      setTransformMode(mode);
      setCommentMode(false);
      setAnnotationDraft(null);
      // Posing lives in the Pose tab; any other tool leaves it
      if (mode === 'pose') {
        setIsRightOpen(true);
        setRightTab('pose');
      } else setRightTab((t) => (t === 'pose' ? 'inspector' : t));
      // Sculpt settings replace the Inspector while the tool is on
      if (mode === 'sculpt') {
        setIsRightOpen(true);
        setRightTab('inspector');
        setCreator(null);
      }
    },
    [setIsRightOpen]
  );

  // The Pose tab turns the joint ring on; leaving it (or closing the panel) goes back to Move
  const posingActive = rightTab === 'pose' && isRightOpen;
  useEffect(() => {
    setTransformMode((m) => (posingActive ? 'pose' : m === 'pose' ? 'translate' : m));
    if (posingActive) setCommentMode(false);
  }, [posingActive]);

  // Turning the Sculpt setting off leaves the tool
  useEffect(() => {
    if (!sculptEnabled && transformMode === 'sculpt') handleSetTransformMode('translate');
  }, [sculptEnabled, transformMode, handleSetTransformMode]);

  // The Pose tab shows while the selection is on a robot: a part a joint moves or is mounted on
  const onRobot = posing.hasRig && !!posing.robot;
  useEffect(() => {
    if (!onRobot && rightTab === 'pose') setRightTab('inspector');
  }, [onRobot, rightTab]);
  /** Opens the Pose tab, selecting a robot first (the first one) when the selection isn't on one */
  const openPose = useCallback(() => {
    if (!posing.hasRig) return;
    const first = posing.rig.robots[0];
    if (!posing.robot && first) setSelectedIds(parts.filter((p) => first.parts.has(p.id)).map((p) => p.id));
    handleSetTransformMode('pose');
  }, [posing.hasRig, posing.robot, posing.rig, parts, handleSetTransformMode]);
  const openPoseRef = useRef(openPose);
  openPoseRef.current = openPose;

  const robotRigNow = posing.robot?.rig ?? null;
  const canWalk = useMemo(() => !!robotRigNow && robotRigNow.joints.some((j) => j.limb === 'leg' || /hip|knee|ankle|leg|haa|kfe/i.test(j.name)), [robotRigNow]);

  /** A walk cycle for the selected robot's legs (two feet: a biped walk; four: a trot) */
  const handleWalkCycle = useCallback(() => {
    const robot = posing.robot;
    if (!robot) return;
    const found = detectFeet(robot.rig, posing.pointOf);
    if (!found) {
      showToast('Add leg joints to make a walk cycle');
      return;
    }
    const n = posing.animations.filter((a) => a.name.startsWith('Walk')).length;
    const built = buildGait(robot.rig, { feet: found.feet, phases: found.phases }, { values: {} }, posing.pointOf, n ? `Walk ${n + 1}` : 'Walk');
    if (typeof built === 'string') {
      showToast(built);
      return;
    }
    const made = posing.addAnimation({ ...built.animation, robot: robot.group.key });
    posing.play(made.id, 0);
    showToast(`Added ${made.name}`);
  }, [posing, showToast]);

  // Frames the model once the parts just added are on the canvas
  const frameNextRef = useRef(false);
  useEffect(() => {
    if (!frameNextRef.current) return;
    frameNextRef.current = false;
    viewportRef.current?.frameAll();
  }, [parts]);

  /** Inserts a published robot (URDF / MJCF): its links as parts, its joints ready to pose */
  const [importRobotOpen, setImportRobotOpen] = useState(false);
  const handleImportRobot = useCallback(
    /** `at`: a drop point (x/z of where it stands and the surface height under it) */
    async (source: { kind: 'url'; url: string; name?: string } | { kind: 'files'; files: File[] }, at?: [number, number, number]) => {
      try {
        showToast(`Importing ${source.kind === 'url' && source.name ? source.name : 'robot'}…`, { tone: 'progress' });
        const robot = await importRobot(source, {
          name: source.kind === 'url' ? source.name : undefined,
          onProgress: (m) => showToast(m, { tone: 'progress' }),
        });
        // Every import from a link makes a preview and is remembered: other robots are listed under
        // Robots → Imported, presets use it when their shipped preview (public/robots) is missing.
        // It renders after the robot is in, so a window in the background never holds the import up.
        if (source.kind === 'url') {
          const { url } = source;
          void robotPreviewImage(robot.parts, url, 320)
            .then((thumbnail) => thumbnail && rememberImportedRobot({ url, name: robot.name, joints: robot.joints.length, thumbnail, importedAt: new Date().toISOString() }))
            .catch(() => {});
        }
        // Dropped: standing where it landed. Otherwise beside anything already in the scene.
        // (The import stands the robot on the floor, centered on the origin.)
        const offset: [number, number, number] = [0, 0, 0];
        if (at) {
          const xs = robot.parts.flatMap((p) => [p.position[0] - p.dimensions.width / 2, p.position[0] + p.dimensions.width / 2]);
          const zs = robot.parts.flatMap((p) => [p.position[2] - p.dimensions.depth / 2, p.position[2] + p.dimensions.depth / 2]);
          offset[0] = at[0] - (Math.min(...xs) + Math.max(...xs)) / 2;
          offset[1] = at[1];
          offset[2] = at[2] - (Math.min(...zs) + Math.max(...zs)) / 2;
        } else {
          const others = partsRef.current.filter((p) => p.visible && p.kind !== 'image_plane');
          if (others.length) {
            const maxX = Math.max(...others.map((p) => p.position[0] + halfExtents(p)[0]));
            const minX = Math.min(...robot.parts.map((p) => p.position[0] - p.dimensions.width / 2));
            offset[0] = Math.ceil(maxX - minX + 100);
          }
        }
        const move = (v: [number, number, number]): [number, number, number] => [v[0] + offset[0], v[1] + offset[1], v[2] + offset[2]];
        const parts = robot.parts.map((p) => ({ ...p, position: move(p.position) }));
        // Another robot from the same maker already uses these joint names: number this one's
        const unique = uniqueJointIds(robot.joints, (projectRef.current.joints ?? []).map((j) => j.id));
        const joints = unique.map((j) => anchorJoint({ ...j, origin: move(j.origin) }, parts));
        commitParts((prev) => [...prev, ...parts]);
        const next = { ...projectRef.current, joints: [...(projectRef.current.joints ?? []), ...joints] };
        projectRef.current = next;
        setProject(next);
        setSelectedIds(parts.map((p) => p.id));
        // A drop already put it where the user is looking
        if (!at) frameNextRef.current = true;
        showToast(
          `Inserted ${robot.name} · ${joints.length} ${joints.length === 1 ? 'joint' : 'joints'}${robot.notes.length ? ` · ${robot.notes.length} ${robot.notes.length === 1 ? 'file' : 'files'} missing` : ''}`,
          { action: joints.length ? { label: 'Pose', onClick: () => openPoseRef.current() } : undefined }
        );
        return { ...robot, parts, joints };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(message, { tone: 'error' });
        return message;
      }
    },
    [commitParts, showToast]
  );
  devRef.current.importRobot = handleImportRobot;
  devRef.current.posing = posing;
  devRef.current.poseTool = (kind, payload) => runPoseToolRef.current(kind, payload);
  const handlePickRobot = useCallback(
    (preset: RobotPreset | null) => (preset ? handleImportRobot({ kind: 'url', url: preset.url, name: preset.title }) : setImportRobotOpen(true)),
    [handleImportRobot]
  );

  // Motion capture: a BVH file opens the retarget sheet
  const motionInputRef = useRef<HTMLInputElement | null>(null);
  const [motionSource, setMotionSource] = useState<{ name: string; text: string } | null>(null);
  const handleImportMotion = useCallback(() => motionInputRef.current?.click(), []);

  const handleAddClayPreset = useCallback(
    (preset: 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule') => {
      const id = newId('clay');
      const sculptMesh = createSculptClayPreset(preset);
      const dims =
        preset === 'clay_capsule'
          ? { width: 32, height: 56, depth: 32, thickness: 4 }
          : preset === 'clay_cylinder'
            ? { width: 36, height: 44, depth: 36, thickness: 4 }
            : { width: 42, height: 42, depth: 42, thickness: 4 };
      const labelMap = {
        clay_sphere: 'Clay Sphere',
        clay_box: 'Clay Block',
        clay_cylinder: 'Clay Cylinder',
        clay_capsule: 'Clay Capsule',
      };
      commitParts((prev) => [
        ...prev,
        {
          id,
          name: labelMap[preset],
          kind: 'sculpt_mesh',
          category: 'primitives',
          role: 'solid',
          position: [0, dims.height / 2, 0],
          rotation: [0, 0, 0],
          dimensions: dims,
          color: '#f4f4f5',
          note: 'Hand-sculpted clay geometry',
          mechanicalTag: '3D Printed PLA/PETG',
          visible: true,
          locked: false,
          sculptMesh,
        },
      ]);
      setSelectedIds([id]);
      setTransformMode('sculpt');
      showToast(`Added ${labelMap[preset]}. Drag on it to sculpt.`);
    },
    [commitParts, showToast]
  );

  const handleSubdivideSelectedClay = useCallback(() => {
    if (!selectedPart) return;
    const { width, height, depth } = selectedPart.dimensions;
    const geom = buildBufferGeometryFromSculptData(
      selectedPart.sculptMesh || createSculptClayPreset('clay_sphere'),
      width,
      height,
      depth
    );
    const subdivided = extractSculptDataFromGeometry(
      tessellateGeometryForSculpting(geom),
      width,
      height,
      depth
    );
    handleUpdateSelectedPart({ kind: 'sculpt_mesh', sculptMesh: subdivided });
    showToast(`Subdivided to ${Math.round(subdivided.positions.length / 3).toLocaleString()} vertices`);
  }, [selectedPart, handleUpdateSelectedPart, showToast]);

  /**
   * Boolean on the selection. With several parts selected, the first one is the
   * base. With one part, Subtract uses every visible Cutout that overlaps it.
   */
  const handleRunBooleanCSG = useCallback(
    (op: 'subtract' | 'union' | 'intersect') => {
      const solids = selectedParts.filter((p) => p.kind !== 'image_plane');
      const base = solids[0];
      if (!base) {
        showToast('Select a part first', { tone: 'error' });
        return;
      }
      let operands = solids.slice(1);
      if (operands.length === 0) {
        if (op !== 'subtract') {
          showToast('Shift-click another part to combine', { tone: 'error' });
          return;
        }
        operands = parts.filter(
          (p) => p.id !== base.id && p.visible && p.role === 'cutout' && boundsOverlap(base, p)
        );
        if (operands.length === 0) {
          showToast('Nothing to subtract. Overlap a Cutout or Shift-click a part.', { tone: 'error' });
          return;
        }
      }
      const res = runSceneBooleanCSG(base, operands, op, (p) => buildPartGroup(p, false));
      if (!res) {
        showToast('Those parts don’t overlap', { tone: 'error' });
        return;
      }
      const sameGroup = operands.every((o) => o.group?.id === base.group?.id) ? base.group : undefined;
      const result: ScenePart = {
        ...res,
        name: op === 'subtract' ? base.name : `${base.name} ${op === 'union' ? 'Union' : 'Intersect'}`,
        group: sameGroup,
      };
      const operandIds = new Set(operands.map((o) => o.id));
      commitParts((prev) =>
        prev.filter((p) => !operandIds.has(p.id)).map((p) => (p.id === base.id ? result : p))
      );
      setSelectedIds([result.id]);
      showToast(
        { subtract: 'Subtracted', union: 'Merged', intersect: 'Intersected' }[op],
        { action: { label: 'Undo', onClick: handleUndo } }
      );
    },
    [selectedParts, parts, commitParts, showToast, handleUndo]
  );

  /* Hardware */

  /** Cutouts (clearance, counterbore, nut trap, insert hole…) for each selected hardware part */
  const handleAddClearanceHole = useCallback(() => {
    const sources = selectedParts.filter((p) => p.hardware);
    if (sources.length === 0) return;
    const created: ScenePart[] = [];
    for (const p of sources) {
      const cutouts = hardwareCutoutParts(p, () => newId('cut'));
      if (cutouts.length > 1) {
        const group = { id: newId('group'), name: `${p.name} Holes` };
        cutouts.forEach((c) => (c.group = group));
      }
      created.push(...cutouts);
    }
    if (created.length === 0) {
      showToast('No hole needed for this part', { tone: 'neutral' });
      return;
    }
    commitParts((prev) => [...prev, ...created]);
    setSelectedIds(created.map((c) => c.id));
    showToast(created.length === 1 ? `Added ${created[0].name}` : `Added ${created.length} cutouts`, {
      action: { label: 'Undo', onClick: handleUndo },
    });
  }, [selectedParts, commitParts, showToast, handleUndo]);

  /** Change size/length; keeps the part's bottom in place and refreshes auto name and notes */
  const handleChangeHardware = useCallback(
    (spec: HardwareSpec, live?: boolean) => {
      if (!selectedPartId) return;
      commitParts((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPartId || !p.hardware) return p;
          const dims = hardwareDimensions(spec);
          const bottom = p.position[1] - p.dimensions.height / 2;
          return {
            ...p,
            hardware: spec,
            dimensions: dims,
            position: [p.position[0], Math.round((bottom + dims.height / 2) * 100) / 100, p.position[2]],
            name: p.name === hardwareName(p.hardware) ? hardwareName(spec) : p.name,
            note: !p.note || p.note === hardwareNote(p.hardware) ? hardwareNote(spec) : p.note,
            // Follow the finish unless the color was set by hand
            color: p.color.toLowerCase() === hardwareColor(p.hardware).toLowerCase() ? hardwareColor(spec) : p.color,
          };
        }),
        live
      );
    },
    [selectedPartId, commitParts]
  );

  /* Grouping */

  const handleGroup = useCallback(() => {
    if (selectedParts.length < 2) return;
    const existing = new Set(parts.map((p) => p.group?.id).filter(Boolean));
    const group = { id: newId('group'), name: `Group ${existing.size + 1}` };
    const ids = new Set(selectedIds);
    commitParts((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, group } : p)));
    showToast(`Grouped ${ids.size} parts`);
  }, [selectedParts, selectedIds, parts, commitParts, showToast]);

  const handleUngroup = useCallback(() => {
    const groupIds = new Set(selectedParts.map((p) => p.group?.id).filter(Boolean));
    if (groupIds.size === 0) return;
    commitParts((prev) =>
      prev.map((p) => (p.group && groupIds.has(p.group.id) ? { ...p, group: undefined } : p))
    );
    showToast('Ungrouped');
  }, [selectedParts, commitParts, showToast]);

  const handleRenameGroup = useCallback(
    (groupId: string, name: string) =>
      commitParts((prev) =>
        prev.map((p) => (p.group?.id === groupId ? { ...p, group: { id: groupId, name } } : p))
      ),
    [commitParts]
  );

  /* Align & distribute */

  const handleAlign = useCallback(
    (axis: Axis, mode: AlignMode) => {
      if (selectedIds.length === 0) return;
      commitParts((prev) => alignParts(prev, selectedIds, axis, mode));
    },
    [selectedIds, commitParts]
  );

  const handleDistribute = useCallback(
    (axis: Axis) => commitParts((prev) => distributeParts(prev, selectedIds, axis)),
    [selectedIds, commitParts]
  );

  const handleUpdateSelectedParts = useCallback(
    (patch: Partial<ScenePart>) => {
      const ids = new Set(selectedIds);
      commitParts((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, ...patch } : p)));
    },
    [selectedIds, commitParts]
  );

  const handleUpdatePartsTransform = useCallback(
    (
      updates: Array<{
        id: string;
        position: [number, number, number];
        rotation: [number, number, number];
        dimensions?: ScenePart['dimensions'];
      }>
    ) => {
      const map = new Map(updates.map((u) => [u.id, u]));
      commitParts((prev) =>
        prev.map((p) => {
          const u = map.get(p.id);
          return u ? { ...p, position: u.position, rotation: u.rotation, dimensions: u.dimensions || p.dimensions } : p;
        })
      );
    },
    [commitParts]
  );

  const handleCreateFrom2DDrawing = useCallback(
    async (params: {
      name: string;
      mode: 'extrude' | 'revolve' | 'svg';
      widthMm: number;
      heightMm: number;
      depthMm: number;
      color: string;
      bevel: boolean;
      nodes: CustomModelSubNode[];
      svgDataUrl?: string;
      saveToLibrary: boolean;
    }) => {
      const id = newId();
      const modeDesc =
        params.mode === 'svg'
          ? `Imported SVG (${params.nodes.length} path${params.nodes.length === 1 ? '' : 's'})`
          : params.mode === 'extrude'
            ? 'Sketch extrusion'
            : 'Sketch revolve';
      const dimensions = {
        width: params.widthMm,
        height: params.heightMm,
        depth: params.depthMm,
        thickness: 4,
      };

      commitParts((prev) => [
        ...prev,
        {
          id,
          name: params.name,
          kind: 'custom_model',
          category: 'custom_models',
          role: 'solid',
          position: [0, Math.round((params.heightMm / 2) * 10) / 10, 0],
          rotation: [0, 0, 0],
          dimensions,
          color: params.color,
          note: modeDesc,
          mechanicalTag: '3D Printed PLA/PETG',
          visible: true,
          locked: false,
          customNodes: params.nodes,
          sourceImageDataUrl: params.svgDataUrl,
        },
      ]);
      setSelectedIds([id]);

      if (params.saveToLibrary) {
        await platformBridge.saveModel({
          id: `model-${Date.now().toString(36)}`,
          name: params.name,
          description: modeDesc,
          createdAt: new Date().toISOString(),
          sourceType: 'scene-selection',
          sourceImageDataUrl: params.svgDataUrl || viewportRef.current?.captureScreenshot(),
          defaultDimensions: dimensions,
          defaultColor: params.color,
          mechanicalTag: '3D Printed PLA/PETG',
          nodes: params.nodes,
        });
        setCustomModels(await platformBridge.listModels());
        showToast(`Added ${params.name} and saved to Library`);
      } else {
        showToast(`Added ${params.name}`);
      }
    },
    [commitParts, showToast, setCustomModels]
  );

  const handleDropToGround = useCallback(() => {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    commitParts((prev) => {
      const sel = prev.filter((p) => ids.has(p.id) && !p.locked);
      // Grouped parts are an assembly: it lands as one piece instead of each part falling flat
      if (sel.length > 1 && sel.every((p) => p.group)) {
        const lift = -selectionBounds(sel).min[1];
        return prev.map((p) =>
          ids.has(p.id) && !p.locked
            ? { ...p, position: [p.position[0], Math.round((p.position[1] + lift) * 100) / 100, p.position[2]] }
            : p
        );
      }
      return prev.map((p) =>
        ids.has(p.id) && !p.locked
          ? { ...p, position: [p.position[0], Math.round(halfExtents(p)[1] * 100) / 100, p.position[2]] }
          : p
      );
    });
  }, [selectedIds, commitParts]);

  /** Turns the selection 90° about its bounds center, as one piece (the group inspector's Rotate) */
  const handleRotateSelection = useCallback(
    (axis: Axis) => {
      const ids = new Set(selectedIds);
      commitParts((prev) => {
        const sel = prev.filter((p) => ids.has(p.id));
        if (sel.length === 0) return prev;
        const { min, max } = selectionBounds(sel);
        const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
        const turn = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0),
          Math.PI / 2
        );
        const round = (v: number) => Math.round(v * 100) / 100;
        const deg = (rad: number) => Math.round(THREE.MathUtils.radToDeg(rad) * 10) / 10 || 0;
        return prev.map((p) => {
          if (!ids.has(p.id) || p.locked) return p;
          const pos = new THREE.Vector3(...p.position).sub(center).applyQuaternion(turn).add(center);
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(...(p.rotation.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number]), 'XYZ')
          );
          const e = new THREE.Euler().setFromQuaternion(turn.clone().multiply(q), 'XYZ');
          return { ...p, position: [round(pos.x), round(pos.y), round(pos.z)], rotation: [deg(e.x), deg(e.y), deg(e.z)] };
        });
      });
    },
    [selectedIds, commitParts]
  );

  /**
   * Moves the selection so its bounds center lands on `target` (only the axes given). Computed
   * from the latest parts, so a repeated commit (Enter, then blur) can't move it twice.
   */
  const handleMoveSelection = useCallback(
    (target: Partial<Record<Axis, number>>, live?: boolean) => {
      const ids = new Set(selectedIds);
      const round = (v: number) => Math.round(v * 100) / 100;
      commitParts((prev) => {
        const sel = prev.filter((p) => ids.has(p.id));
        if (sel.length === 0) return prev;
        const { min, max } = selectionBounds(sel);
        const delta = ([0, 1, 2] as Axis[]).map((a) => (target[a] === undefined ? 0 : target[a]! - (min[a] + max[a]) / 2));
        if (delta.every((d) => Math.abs(d) < 1e-6) && live) return prev;
        return prev.map((p) =>
          ids.has(p.id) && !p.locked
            ? { ...p, position: [round(p.position[0] + delta[0]), round(p.position[1] + delta[1]), round(p.position[2] + delta[2])] }
            : p
        );
      }, live);
    },
    [selectedIds, commitParts]
  );

  const handleStackOnBelow = useCallback(() => {
    if (!selectedPart) return;
    let highestSurfaceY = 0;
    const [sx, , sz] = selectedPart.position;
    const sw = selectedPart.dimensions.width / 2;
    const sd = selectedPart.dimensions.depth / 2;
    for (const other of parts) {
      if (other.id === selectedPart.id || !other.visible || other.role !== 'solid') continue;
      const overlapsXZ =
        Math.abs(sx - other.position[0]) <= sw + other.dimensions.width / 2 &&
        Math.abs(sz - other.position[2]) <= sd + other.dimensions.depth / 2;
      if (overlapsXZ) {
        highestSurfaceY = Math.max(highestSurfaceY, other.position[1] + other.dimensions.height / 2);
      }
    }
    const newY = Math.round((highestSurfaceY + selectedPart.dimensions.height / 2) * 10) / 10;
    handleUpdateSelectedPart({ position: [sx, newY, sz] });
  }, [selectedPart, parts, handleUpdateSelectedPart]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedParts.length === 0) return;
    const groupMap = new Map<string, { id: string; name: string }>();
    const copies = selectedParts.map((p) => {
      let group = p.group;
      if (group) {
        if (!groupMap.has(group.id)) groupMap.set(group.id, { id: newId('group'), name: `${group.name} Copy` });
        group = groupMap.get(group.id);
      }
      return {
        ...p,
        id: newId(),
        name: selectedParts.length === 1 ? `${p.name} Copy` : p.name,
        group,
        position: [p.position[0] + 15, p.position[1], p.position[2] + 15] as [number, number, number],
      };
    });
    commitParts((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }, [selectedParts, commitParts]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedParts.length === 0) return;
    const ids = selectedParts.map((p) => p.id);
    const label = selectedParts.length === 1 ? selectedParts[0].name : `${selectedParts.length} parts`;
    commitParts((prev) => prev.filter((p) => !ids.includes(p.id)));
    setSelectedIds([]);
    showToast(`Deleted ${label}`, {
      tone: 'neutral',
      action: {
        label: 'Undo',
        onClick: () => {
          handleUndo();
          setSelectedIds(ids);
        },
      },
    });
  }, [selectedParts, commitParts, showToast, handleUndo]);

  /* Clipboard: ⌘C / ⌘X / ⌘V copy parts between scenes; a pasted image becomes a reference plane */

  const handleCopySelected = useCallback(
    (cut = false) => {
      if (selectedParts.length === 0) return false;
      // A cut, or a paste into another scene, lands in place first; repeats step off by 15 mm
      partsClipboard = { parts: selectedParts, inPlace: new Set(cut ? [] : [workspaceId]), pastes: new Map() };
      if (!cut) return true;
      const ids = selectedParts.map((p) => p.id);
      const label = selectedParts.length === 1 ? selectedParts[0].name : `${selectedParts.length} parts`;
      commitParts((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelectedIds([]);
      showToast(`Cut ${label}`, { tone: 'neutral', action: { label: 'Undo', onClick: () => { handleUndo(); setSelectedIds(ids); } } });
      return true;
    },
    [selectedParts, workspaceId, commitParts, showToast, handleUndo]
  );

  const forceCopyRef = useRef(false);
  /** For ⌘K: a real copy event, so the system clipboard gets the marker */
  const copyViaCommand = useCallback((cut: boolean) => {
    forceCopyRef.current = true;
    try {
      if (!document.execCommand(cut ? 'cut' : 'copy')) handleCopySelected(cut);
    } finally {
      forceCopyRef.current = false;
    }
  }, [handleCopySelected]);

  const handlePasteParts = useCallback(() => {
    const clip = partsClipboard;
    if (!clip) return;
    const n = clip.pastes.get(workspaceId) ?? 0;
    clip.pastes.set(workspaceId, n + 1);
    const step = 15 * (n + (clip.inPlace.has(workspaceId) ? 1 : 0));
    const groupMap = new Map<string, { id: string; name: string }>();
    const copies = clip.parts.map(({ jointId: _joint, ...p }) => {
      let group = p.group;
      if (group) {
        if (!groupMap.has(group.id)) groupMap.set(group.id, { id: newId('group'), name: group.name });
        group = groupMap.get(group.id);
      }
      return {
        ...p,
        id: newId(),
        group,
        position: [p.position[0] + step, p.position[1], p.position[2] + step] as [number, number, number],
      };
    });
    commitParts((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }, [workspaceId, commitParts]);

  useEffect(() => {
    if (!active) return;
    // Text fields keep native editing; so do open sheets
    const skip = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable) ||
        paletteOpen ||
        settingsOpen
      );
    };
    const onCopy = (e: ClipboardEvent) => {
      // ⌘K's Copy and Cut run execCommand while the palette still has focus
      const forced = forceCopyRef.current;
      if (!forced && (skip() || (window.getSelection()?.toString() ?? '') !== '')) return;
      if (!handleCopySelected(e.type === 'cut')) return;
      e.preventDefault();
      e.clipboardData?.setData(PARTS_CLIPBOARD_TYPE, '1');
    };
    const onPaste = (e: ClipboardEvent) => {
      if (skip()) return;
      const data = e.clipboardData;
      if (data?.types.includes(PARTS_CLIPBOARD_TYPE)) {
        e.preventDefault();
        handlePasteParts();
        return;
      }
      const file = Array.from(data?.items ?? []).find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      handleAddImagePlane(file, 'Pasted Image');
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  }, [active, paletteOpen, settingsOpen, handleCopySelected, handlePasteParts, handleAddImagePlane]);

  const handleTogglePartFlag = useCallback(
    (id: string, flag: 'visible' | 'locked') =>
      commitParts((prev) => prev.map((p) => (p.id === id ? { ...p, [flag]: !p[flag] } : p))),
    [commitParts]
  );

  const handleRenamePart = useCallback(
    (id: string, name: string) =>
      commitParts((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p))),
    [commitParts]
  );

  const handleExportSTL = useCallback(() => {
    if (parts.length === 0) return;
    exportSceneToSTL(parts, `${fileSafe(sceneName)}.stl`);
    showToast('Exported STL');
  }, [parts, sceneName, showToast]);

  const handleExportImage = useCallback(() => {
    const dataUrl = viewportRef.current?.captureScreenshot();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${fileSafe(sceneName)}.png`;
    a.click();
    showToast('Exported image');
  }, [sceneName, showToast]);

  const handleCopyBrief = useCallback(async () => {
    const { markdown } = buildAIHandoffPayload(sceneName, globalGoal, parts, annotations);
    try {
      await navigator.clipboard.writeText(markdown);
      showToast('Copied as Markdown');
    } catch (err) {
      showToast(`Couldn’t copy. ${String(err)}`, { tone: 'error' });
    }
  }, [sceneName, globalGoal, parts, annotations, showToast]);

  const setCameraView = useCallback((preset: CameraPreset) => {
    viewportRef.current?.setCameraPreset(preset);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Annotations                                                      */
  /* ---------------------------------------------------------------- */

  const toggleCommentMode = useCallback((on?: boolean) => {
    setCommentMode((v) => {
      const next = on ?? !v;
      if (next) setSelectedIds([]);
      else setAnnotationDraft(null);
      return next;
    });
  }, []);

  const handlePlaceAnnotation = useCallback(
    (position: [number, number, number], partId: string | null) => {
      setActiveAnnotationId(null);
      setAnnotationDraft({ position, partId });
    },
    []
  );

  const stamp = () => new Date().toISOString();

  const handleCreateAnnotation = useCallback(
    (text: string) => {
      if (!annotationDraft) return;
      const part = parts.find((p) => p.id === annotationDraft.partId);
      const [x, y, z] = annotationDraft.position;
      const id = newId('note');
      setAnnotations((prev) => [
        ...prev,
        {
          id,
          position: annotationDraft.position,
          partId: part?.id ?? null,
          offset: part ? [x - part.position[0], y - part.position[1], z - part.position[2]] : undefined,
          comments: [{ id: newId('c'), text, createdAt: stamp() }],
          createdAt: stamp(),
        },
      ]);
      setAnnotationDraft(null);
      setActiveAnnotationId(id);
    },
    [annotationDraft, parts]
  );

  const updateAnnotation = useCallback(
    (id: string, fn: (a: SceneAnnotation) => SceneAnnotation | null) =>
      setAnnotations((prev) =>
        prev.flatMap((a) => {
          if (a.id !== id) return [a];
          const next = fn(a);
          return next ? [next] : [];
        })
      ),
    []
  );

  const handleReplyAnnotation = useCallback(
    (id: string, text: string) =>
      updateAnnotation(id, (a) => ({
        ...a,
        comments: [...a.comments, { id: newId('c'), text, createdAt: stamp() }],
      })),
    [updateAnnotation]
  );

  const handleEditComment = useCallback(
    (id: string, commentId: string, text: string) =>
      updateAnnotation(id, (a) => ({
        ...a,
        comments: a.comments.map((c) => (c.id === commentId ? { ...c, text, editedAt: stamp() } : c)),
      })),
    [updateAnnotation]
  );

  const handleDeleteComment = useCallback(
    (id: string, commentId: string) => {
      updateAnnotation(id, (a) => {
        const comments = a.comments.filter((c) => c.id !== commentId);
        return comments.length ? { ...a, comments } : null;
      });
    },
    [updateAnnotation]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      const removed = annotations.find((a) => a.id === id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      setActiveAnnotationId(null);
      if (removed) {
        showToast('Deleted comment', {
          tone: 'neutral',
          action: { label: 'Undo', onClick: () => setAnnotations((prev) => [...prev, removed]) },
        });
      }
    },
    [annotations, showToast]
  );

  const handleToggleResolved = useCallback(
    (id: string) => {
      const wasResolved = annotations.find((a) => a.id === id)?.resolved;
      updateAnnotation(id, (a) => ({ ...a, resolved: !a.resolved }));
      if (!wasResolved) {
        setActiveAnnotationId(null);
        showToast('Resolved', {
          tone: 'success',
          action: { label: 'Undo', onClick: () => updateAnnotation(id, (a) => ({ ...a, resolved: false })) },
        });
      }
    },
    [annotations, updateAnnotation, showToast]
  );

  /** Opens the sidebar on Parts and focuses its search (⌘F) */
  const partsSearchRef = useRef<HTMLInputElement | null>(null);
  const handleFindParts = useCallback(() => {
    setIsLeftOpen(true);
    setLeftTab('parts');
    // The field mounts with the Parts view; wait a few frames for it
    let tries = 0;
    const focus = () => {
      const input = partsSearchRef.current;
      if (input) {
        input.focus();
        input.select();
      } else if (++tries < 10) requestAnimationFrame(focus);
    };
    requestAnimationFrame(focus);
  }, [setIsLeftOpen]);

  /* ---------------------------------------------------------------- */
  /* Keyboard                                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // Only the scene in front listens; tab shortcuts (⌘T, ⌘W, ⌃Tab…) live in App
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Global shortcuts that work even while typing
      if (mod && key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        handleSync();
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        openSettings();
        return;
      }
      if (mod && !e.shiftKey && key === 'f' && !paletteOpen && !settingsOpen) {
        e.preventDefault();
        handleFindParts();
        return;
      }

      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      if (paletteOpen || settingsOpen) return;

      if (mod) {
        if (key === 'z') {
          e.preventDefault();
          lastKeyEditRef.current = performance.now();
          if (e.shiftKey) handleRedo();
          else handleUndo();
        } else if (key === 'g') {
          e.preventDefault();
          if (e.shiftKey) handleUngroup();
          else handleGroup();
        } else if (key === 'a') {
          e.preventDefault();
          lastKeyEditRef.current = performance.now();
          setSelectedIds(parts.filter((p) => p.visible && (showReferenceImages || p.kind !== 'image_plane')).map((p) => p.id));
        } else if (key === 'd') {
          e.preventDefault();
          handleDuplicateSelected();
        } else if (key === 'b') {
          e.preventDefault();
          setIsLeftOpen((v) => !v);
        } else if (key === 'i') {
          e.preventDefault();
          setIsRightOpen((v) => !v);
        }
        return;
      }
      if (e.altKey) return;

      if (e.shiftKey && key === 'i') {
        e.preventDefault();
        setShowReferenceImages((v) => !v);
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        openSettings('shortcuts');
        return;
      }

      switch (key) {
        case 'v':
        case 'w':
          handleSetTransformMode('translate');
          break;
        case 'e':
          handleSetTransformMode('rotate');
          break;
        case 'r':
          handleSetTransformMode('scale');
          break;
        case 'c':
          if (sculptEnabled) handleSetTransformMode('sculpt');
          break;
        case 'p':
          openPose();
          break;
        case 'f':
          handleDropToGround();
          break;
        case 's':
          handleStackOnBelow();
          break;
        case 'z':
          viewportRef.current?.focusSelected();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          setCameraView(CAMERA_VIEWS[Number(key) - 1].id);
          break;
        case 'm':
          toggleCommentMode();
          break;
        case 'a':
          setShapesMenuOpen((v) => !v);
          break;
        case 'escape':
          if (annotationDraft) setAnnotationDraft(null);
          else if (activeAnnotationId) setActiveAnnotationId(null);
          else if (commentMode) toggleCommentMode(false);
          else setSelectedIds([]);
          break;
        case 'backspace':
        case 'delete':
          handleDeleteSelected();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    active,
    handleUndo,
    handleRedo,
    handleDuplicateSelected,
    handleSync,
    handleDropToGround,
    handleStackOnBelow,
    handleDeleteSelected,
    handleSetTransformMode,
    setCameraView,
    toggleCommentMode,
    handleGroup,
    handleUngroup,
    parts,
    showReferenceImages,
    annotationDraft,
    activeAnnotationId,
    commentMode,
    paletteOpen,
    settingsOpen,
    openSettings,
    handleFindParts,
    sculptEnabled,
    setIsLeftOpen,
    setIsRightOpen,
    setShowReferenceImages,
    posing.hasRig,
    openPose,
  ]);

  /* ---------------------------------------------------------------- */
  /* Command palette                                                  */
  /* ---------------------------------------------------------------- */

  const commands = useMemo<Command[]>(() => {
    const ic = 'w-4 h-4';
    const list: Command[] = [
      { id: 'sync', group: 'Scene', label: 'Save Scene', shortcut: '⌘S', icon: <Save className={ic} />, keywords: 'sync save library ai-reference brief', run: handleSync },
      { id: 'copy-brief', group: 'Scene', label: 'Copy as Markdown', icon: <ClipboardCopy className={ic} />, keywords: 'markdown clipboard export brief spec', run: handleCopyBrief },
      { id: 'export', group: 'Scene', label: 'Export STL', icon: <Download className={ic} />, keywords: 'print download', run: handleExportSTL },
      { id: 'export-image', group: 'Scene', label: 'Export Image', icon: <ImageDown className={ic} />, keywords: 'png screenshot render download', run: handleExportImage },
      { id: 'new', group: 'Scene', label: 'New Scene', shortcut: '⌘T', icon: <SquarePen className={ic} />, keywords: 'tab open', run: () => studio.newScene() },
      { id: 'duplicate-scene', group: 'Scene', label: 'Duplicate Scene', icon: <CopyPlus className={ic} />, keywords: 'tab copy', run: () => studio.duplicateTab(workspaceId) },
      { id: 'close-scene', group: 'Scene', label: 'Close Scene', shortcut: '⌘W', icon: <X className={ic} />, keywords: 'tab', run: () => studio.closeTab(workspaceId) },
      ...(studio.canReopenTab
        ? [{ id: 'reopen-scene', group: 'Scene', label: 'Reopen Closed Scene', shortcut: '⇧⌘T', icon: <History className={ic} />, keywords: 'tab undo restore', run: studio.reopenTab }]
        : []),
      // Every other open scene, so ⌘K doubles as a tab switcher
      ...studio.tabs
        .filter((t) => t.id !== workspaceId)
        .map((t) => ({
          id: `tab-${t.id}`,
          group: 'Open Scenes',
          label: t.name || 'Untitled',
          shortcut: studio.tabs.indexOf(t) < 9 ? `⌘${studio.tabs.indexOf(t) + 1}` : undefined,
          icon: <ArrowRightLeft className={ic} />,
          keywords: 'tab switch go to',
          run: () => studio.selectTab(t.id),
        })),
      { id: 'toggle-ref-images', group: 'View', label: showReferenceImages ? 'Hide Reference Images' : 'Show Reference Images', shortcut: '⇧I', icon: <ImageIcon className={ic} />, keywords: 'photo picture', run: () => setShowReferenceImages((v) => !v) },
      { id: 'ref-image', group: 'Scene', label: 'Add Reference Image…', icon: <ImageIcon className={ic} />, keywords: 'photo picture paste plane', run: () => pickReferenceImage() },
      { id: 'import-svg', group: 'Scene', label: 'Import SVG…', icon: <FileUp className={ic} />, run: () => openCreator('svg') },
      { id: 'sketch', group: 'Scene', label: 'Sketch…', icon: <PenTool className={ic} />, keywords: 'draw extrude revolve outline', run: () => openCreator('draw2d') },
      {
        id: 'image',
        group: 'Scene',
        label: 'Model from Image…',
        icon: <ImagePlus className={ic} />,
        keywords: 'photo sketch agent ai',
        run: () => {
          setIsRightOpen(true);
          setRightTab('acp');
          setAttachRequest((n) => n + 1);
        },
      },
      { id: 'tool-move', group: 'Tools', label: 'Move', shortcut: 'V', icon: <Move3d className={ic} />, run: () => handleSetTransformMode('translate') },
      { id: 'tool-rotate', group: 'Tools', label: 'Rotate', shortcut: 'E', icon: <Rotate3d className={ic} />, run: () => handleSetTransformMode('rotate') },
      { id: 'tool-scale', group: 'Tools', label: 'Scale', shortcut: 'R', icon: <Scale3d className={ic} />, run: () => handleSetTransformMode('scale') },
      ...(sculptEnabled
        ? [{ id: 'tool-sculpt', group: 'Tools', label: 'Sculpt', shortcut: 'C', icon: <Brush className={ic} />, run: () => handleSetTransformMode('sculpt') }]
        : []),
      ...(posing.hasRig
        ? [
            { id: 'tool-pose', group: 'Panels', label: 'Show Pose', shortcut: 'P', icon: <PersonStanding className={ic} />, keywords: 'joints posing animate dof tab', run: openPose },
            { id: 'rest-pose', group: 'Pose', label: 'Rest Pose', icon: <RotateCcw className={ic} />, keywords: 'reset zero home', run: () => posing.setRobotPose({ values: {} }) },
            ...(canWalk ? [{ id: 'walk-cycle', group: 'Pose', label: 'New Walk Cycle', icon: <Footprints className={ic} />, keywords: 'gait animation legs', run: handleWalkCycle }] : []),
            { id: 'import-bvh', group: 'Pose', label: 'Import BVH…', icon: <FileUp className={ic} />, keywords: 'mocap motion capture retarget animation', run: handleImportMotion },
            ...posing.animations.map((a) => ({ id: `play-${a.id}`, group: 'Pose', label: `Play ${a.name}`, icon: <Play className={ic} />, keywords: 'animation', run: () => { openPose(); posing.play(a.id); } })),
            ...posing.poses.map((p) => ({ id: `pose-${p.id}`, group: 'Pose', label: `Apply ${p.name}`, icon: <PersonStanding className={ic} />, keywords: 'pose', run: () => posing.applySavedPose(p.id) })),
          ]
        : []),
      { id: 'import-robot', group: 'Scene', label: 'Import Robot…', icon: <Bot className={ic} />, keywords: 'urdf mjcf mujoco ros unitree g1 humanoid description', run: () => setImportRobotOpen(true) },
      ...ROBOT_PRESETS.map((r) => ({ id: `robot-${r.id}`, group: 'Robots', label: `Insert ${r.title}`, icon: <Bot className={ic} />, keywords: `${r.maker} urdf robot ${r.description}`, run: () => handlePickRobot(r) })),
      { id: 'tool-comment', group: 'Tools', label: 'Comment', shortcut: 'M', icon: <MessageCircle className={ic} />, keywords: 'annotation note pin', run: () => toggleCommentMode(true) },
      { id: 'select-all', group: 'Selection', label: 'Select All', shortcut: '⌘A', icon: <Layers className={ic} />, run: () => setSelectedIds(parts.filter((p) => p.visible && (showReferenceImages || p.kind !== 'image_plane')).map((p) => p.id)) },
      { id: 'copy', group: 'Selection', label: 'Copy', shortcut: '⌘C', icon: <Copy className={ic} />, run: () => copyViaCommand(false) },
      { id: 'cut', group: 'Selection', label: 'Cut', shortcut: '⌘X', icon: <Scissors className={ic} />, run: () => copyViaCommand(true) },
      { id: 'paste', group: 'Selection', label: 'Paste', shortcut: '⌘V', icon: <ClipboardPaste className={ic} />, run: handlePasteParts },
      { id: 'group', group: 'Selection', label: 'Group', shortcut: '⌘G', icon: <Group className={ic} />, run: handleGroup },
      { id: 'ungroup', group: 'Selection', label: 'Ungroup', shortcut: '⇧⌘G', icon: <Ungroup className={ic} />, run: handleUngroup },
      { id: 'union', group: 'Selection', label: 'Union', icon: <SquaresUnite className={ic} />, keywords: 'boolean merge combine', run: () => handleRunBooleanCSG('union') },
      { id: 'subtract', group: 'Selection', label: 'Subtract', icon: <SquaresSubtract className={ic} />, keywords: 'boolean cut hole difference', run: () => handleRunBooleanCSG('subtract') },
      { id: 'intersect', group: 'Selection', label: 'Intersect', icon: <SquaresIntersect className={ic} />, keywords: 'boolean common', run: () => handleRunBooleanCSG('intersect') },
      { id: 'align-left', group: 'Selection', label: 'Align Left', icon: <AlignCenterVertical className={ic} />, keywords: 'align x', run: () => handleAlign(0, 'min') },
      { id: 'align-center-x', group: 'Selection', label: 'Align Center (X)', icon: <AlignCenterVertical className={ic} />, keywords: 'align', run: () => handleAlign(0, 'center') },
      { id: 'align-right', group: 'Selection', label: 'Align Right', icon: <AlignCenterVertical className={ic} />, keywords: 'align x', run: () => handleAlign(0, 'max') },
      { id: 'align-bottom', group: 'Selection', label: 'Align Bottom', icon: <AlignCenterVertical className={ic} />, keywords: 'align y floor', run: () => handleAlign(1, 'min') },
      { id: 'align-top', group: 'Selection', label: 'Align Top', icon: <AlignCenterVertical className={ic} />, keywords: 'align y', run: () => handleAlign(1, 'max') },
      { id: 'align-front', group: 'Selection', label: 'Align Front', icon: <AlignCenterVertical className={ic} />, keywords: 'align z', run: () => handleAlign(2, 'max') },
      { id: 'align-back', group: 'Selection', label: 'Align Back', icon: <AlignCenterVertical className={ic} />, keywords: 'align z', run: () => handleAlign(2, 'min') },
      { id: 'distribute-x', group: 'Selection', label: 'Distribute Along X', icon: <AlignCenterVertical className={ic} />, keywords: 'spread space', run: () => handleDistribute(0) },
      { id: 'distribute-z', group: 'Selection', label: 'Distribute Along Z', icon: <AlignCenterVertical className={ic} />, keywords: 'spread space', run: () => handleDistribute(2) },
      { id: 'floor', group: 'Tools', label: 'Drop to Floor', shortcut: 'F', icon: <ArrowDownToLine className={ic} />, run: handleDropToGround },
      { id: 'stack', group: 'Tools', label: 'Stack on Part Below', shortcut: 'S', icon: <Layers className={ic} />, run: handleStackOnBelow },
      ...CAMERA_VIEWS.map((v) => ({
        id: `view-${v.id}`,
        group: 'View',
        label: `${v.label} View`,
        shortcut: v.shortcut,
        icon: <Box className={ic} />,
        keywords: 'camera',
        run: () => setCameraView(v.id),
      })),
      { id: 'find-parts', group: 'View', label: 'Find Parts…', shortcut: '⌘F', icon: <Search className={ic} />, keywords: 'search catalog servo screw component hardware', run: handleFindParts },
      { id: 'toggle-left', group: 'View', label: isLeftOpen ? 'Hide Sidebar' : 'Show Sidebar', shortcut: '⌘B', icon: <PanelLeft className={ic} />, run: () => setIsLeftOpen((v) => !v) },
      { id: 'toggle-right', group: 'View', label: isRightOpen ? 'Hide Inspector' : 'Show Inspector', shortcut: '⌘I', icon: <PanelRight className={ic} />, run: () => setIsRightOpen((v) => !v) },
      { id: 'build', group: 'View', label: 'Open Build', icon: <Package className={ic} />, keywords: 'bom bill of materials budget buy price amazon print filament', run: () => { setIsRightOpen(true); setRightTab('build'); } },
      { id: 'agent', group: 'View', label: 'Open Agent', icon: <Sparkles className={ic} />, keywords: 'ai chat', run: () => { setIsRightOpen(true); setRightTab('acp'); } },
      { id: 'toggle-grid', group: 'View', label: showGrid ? 'Hide Grid' : 'Show Grid', icon: <Grid3x3 className={ic} />, run: () => setShowGrid((v) => !v) },
      { id: 'zoom-selection', group: 'View', label: 'Zoom to Selection', shortcut: 'Z', icon: <Crosshair className={ic} />, run: () => viewportRef.current?.focusSelected() },
      { id: 'toggle-trackpad', group: 'View', label: trackpadMode === 'orbit-scroll' ? 'Scroll to Pan' : 'Scroll to Orbit', icon: trackpadMode === 'orbit-scroll' ? <Hand className={ic} /> : <Rotate3d className={ic} />, keywords: 'trackpad two-finger gesture', run: () => setTrackpadMode((m) => (m === 'orbit-scroll' ? 'pan-scroll' : 'orbit-scroll')) },
      { id: 'settings', group: 'App', label: 'Settings…', shortcut: '⌘,', icon: <Settings className={ic} />, keywords: 'preferences grid snap trackpad', run: () => openSettings() },
      { id: 'agent-settings', group: 'App', label: 'Agent Settings…', icon: <Settings className={ic} />, keywords: 'claude offline command target height', run: () => openSettings('agent') },
      { id: 'shortcuts', group: 'App', label: 'Keyboard Shortcuts', shortcut: '?', icon: <Keyboard className={ic} />, run: () => openSettings('shortcuts') },
      ...PART_CATALOG.filter((item) => !item.hardware).map((item) => ({
        id: `add-${catalogKey(item)}`,
        group: 'Add Part',
        label: item.name,
        icon: <Plus className={ic} />,
        keywords: `${CATEGORY_LABELS[item.category].label} ${item.description} ${item.keywords ?? ''}`,
        run: () => handleAddCatalogItem(item),
      })),
      // Every hardware type at every size (default stocked length)
      ...PART_CATALOG.filter((item) => item.hardware).flatMap((item) =>
        HARDWARE_BY_TYPE[item.hardware!.type].sizes.map((size) => {
          const v = hardwareVariant(item, size);
          return {
            id: `add-${catalogKey(item)}-${size}`,
            group: 'Add Hardware',
            label: hardwareName(v.hardware!),
            icon: <Plus className={ic} />,
            keywords: `hardware ${size.toLowerCase()} ${item.description}`,
            run: () => handleAddCatalogItem(v),
          };
        })
      ),
      ...customModels.map((m) => ({
        id: `model-${m.id}`,
        group: 'Insert Model',
        label: m.name,
        icon: <Box className={ic} />,
        run: () => handlePlaceCustomModel(m),
      })),
    ];
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posing, openPose, canWalk, handleWalkCycle, handleImportMotion, handlePickRobot, customModels, studio.tabs, studio.canReopenTab, workspaceId, isLeftOpen, isRightOpen, handleSync, handleExportSTL, handleExportImage, handleCopyBrief, handleDropToGround, handleStackOnBelow, handleAddCatalogItem, handlePlaceCustomModel, handleSetTransformMode, setCameraView, openCreator, toggleCommentMode, pickReferenceImage, showReferenceImages, showGrid, trackpadMode, sculptEnabled, openSettings, parts, handleGroup, handleUngroup, handleRunBooleanCSG, handleAlign, handleDistribute, copyViaCommand, handlePasteParts]);

  /* ---------------------------------------------------------------- */
  /* Context menu                                                     */
  /* ---------------------------------------------------------------- */

  const openContextMenu = (
    x: number,
    y: number,
    partId: string | null,
    point: [number, number, number] | null
  ) => {
    if (partId && !selectedIds.includes(partId)) handleSelect(partId);
    setContextMenu({ x, y, partId, point });
  };

  /** Opens the canvas menu at a point unless it came from a trackpad scroll */
  const openCanvasMenuAt = (x: number, y: number, timeStamp: number) => {
    // A two-finger tap at the start or end of a trackpad scroll (or one that stops momentum)
    // registers as a secondary click; only a deliberate one opens the menu
    if (timeStamp - lastWheelRef.current < TRACKPAD_TAP_GRACE_MS) return;
    const hit = viewportRef.current?.pickAt(x, y) ?? null;
    openContextMenu(x, y, hit?.partId ?? null, hit?.point ?? null);
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if ((e.target as HTMLElement).closest('button, [role=menu], textarea, input')) return;
    const press = menuPressRef.current;
    if (press && !press.released) {
      // Still pressed (macOS): decide on release
      press.pending = true;
      return;
    }
    // Released already (Windows / Linux), or from the keyboard
    menuPressRef.current = null;
    if (press?.moved) return;
    openCanvasMenuAt(e.clientX, e.clientY, e.timeStamp);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    const press = menuPressRef.current;
    if (!press) return;
    // Dragging with a secondary press pans the camera; only a still press is a click
    press.released = true;
    press.moved ||= Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5;
    if (!press.pending) return;
    menuPressRef.current = null;
    if (!press.moved) openCanvasMenuAt(press.x, press.y, e.timeStamp);
  };

  /** Every visible, selectable part (hidden reference photos excluded) */
  const handleSelectAll = () =>
    setSelectedIds(
      parts
        .filter((p) => p.visible && (showReferenceImages || p.kind !== 'image_plane'))
        .map((p) => p.id)
    );

  /* ---------------------------------------------------------------- */
  /* Native menu bar (electron/app-menu.mjs)                          */
  /* ---------------------------------------------------------------- */

  const runMenuCommand = (id: string) => {
    const el = document.activeElement;
    const typing =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable);
    // Edit menu: text fields keep native editing; the scene ignores a repeat of a key just handled
    if (id === 'undo' || id === 'redo' || id === 'select-all') {
      if (typing) {
        document.execCommand(id === 'select-all' ? 'selectAll' : id);
        return;
      }
      if (paletteOpen || settingsOpen) return;
      if (performance.now() - lastKeyEditRef.current < 250) return;
    }
    if (id.startsWith('view:')) return setCameraView(id.slice(5) as CameraPreset);
    if (id.startsWith('trackpad:')) return setTrackpadMode(id.slice(9) as TrackpadGestureMode);
    switch (id) {
      case 'settings': return openSettings();
      case 'shortcuts': return openSettings('shortcuts');
      case 'find-parts': return handleFindParts();
      case 'sync': return handleSync();
      case 'export-stl': return handleExportSTL();
      case 'add-reference-image': return pickReferenceImage();
      case 'import-svg': return openCreator('svg');
      case 'import-robot': return setImportRobotOpen(true);
      case 'import-bvh': return posing.hasRig ? handleImportMotion() : showToast('Add joints to retarget motion onto');
      case 'undo': return handleUndo();
      case 'redo': return handleRedo();
      case 'select-all': return handleSelectAll();
      case 'duplicate': return handleDuplicateSelected();
      case 'delete': return handleDeleteSelected();
      case 'palette': return setPaletteOpen((v) => !v);
      case 'zoom-selection': return viewportRef.current?.focusSelected();
      case 'reset-view':
        setSelectedIds([]);
        return viewportRef.current?.focusSelected();
      case 'toggle-grid': return setShowGrid((v) => !v);
      case 'toggle-reference-images': return setShowReferenceImages((v) => !v);
      case 'toggle-sidebar': return setIsLeftOpen((v) => !v);
      case 'toggle-inspector': return setIsRightOpen((v) => !v);
    }
  };
  const runMenuCommandRef = useRef(runMenuCommand);
  runMenuCommandRef.current = runMenuCommand;

  useEffect(() => (active ? platformBridge.onMenuCommand((id) => runMenuCommandRef.current(id)) : undefined), [active]);

  useEffect(() => {
    if (!active) return;
    platformBridge.setMenuState({
      sidebar: isLeftOpen,
      inspector: isRightOpen,
      grid: showGrid,
      referenceImages: showReferenceImages,
      trackpadMode,
      hasSelection: selectedIds.length > 0,
      hasParts: parts.length > 0,
    } satisfies Partial<AppMenuState>);
  }, [active, isLeftOpen, isRightOpen, showGrid, showReferenceImages, trackpadMode, selectedIds.length, parts.length]);

  /* ---------------------------------------------------------------- */
  /* Tab host (App)                                                   */
  /* ---------------------------------------------------------------- */

  // Latest closures for the host; the handle object itself stays stable
  const hostRef = useRef({
    event: handleWorkspaceEvent,
    snapshot: (): WorkspaceSeed => ({ sceneId, sceneName, globalGoal, parts, annotations, project }),
    load: loadSeed,
    persist: () => {},
    stop: handleStopAgent,
  });
  hostRef.current = {
    event: handleWorkspaceEvent,
    snapshot: () => ({
      sceneId,
      sceneName,
      globalGoal,
      parts: partsRef.current,
      annotations,
      project: projectRef.current,
      chat: acpMessages.length ? { chatId, messages: acpMessages, acpSessionId: acpSessionId ?? pendingResumeRef.current } : undefined,
    }),
    load: loadSeed,
    persist: () => saveChat(chatId, acpMessages, acpSessionId),
    stop: handleStopAgent,
  };
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    const handle: WorkspaceHandle = {
      onEvent: (e) => hostRef.current.event(e),
      snapshot: () => hostRef.current.snapshot(),
      thumbnail: async () => {
        const shot = viewportRef.current?.captureScreenshot();
        return shot ? downscaleDataUrl(shot, 560, 0.86) : '';
      },
      load: (next, toast) => hostRef.current.load(next, toast),
      rename: (name) => setSceneName(name),
      toast: (message, opts) => showToastRef.current(message, opts),
      persistChat: () => hostRef.current.persist(),
      stopAgent: () => hostRef.current.stop(),
    };
    studio.register(workspaceId, handle);
    return () => studio.register(workspaceId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // What the tab strip shows: name, size, and the agent's live activity
  const agentActivity = isAcpBusy ? agentAction || agentStatus || 'Working' : '';
  const [initial] = useState({ sceneId, sceneName });
  const pristine =
    (!seed || !!seed.blank) &&
    sceneId === initial.sceneId &&
    sceneName === initial.sceneName &&
    parts.length === 0 &&
    annotations.length === 0 &&
    acpMessages.length === 0 &&
    !globalGoal;
  useEffect(() => {
    studio.reportMeta(workspaceId, {
      sceneId,
      name: sceneName,
      partCount: parts.length,
      busy: isAcpBusy,
      activity: agentActivity,
      chatId,
      pristine,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, sceneId, sceneName, parts.length, isAcpBusy, agentActivity, chatId, pristine]);

  // The collapsed inspector's island sits beside the tab strip, which needs its width
  const rightIslandRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = rightIslandRef.current;
    if (!active || !el) return;
    const report = () => studio.reportRightIsland(el.offsetWidth);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isRightOpen]);

  const contextItems = (): ContextMenuEntry[] => {
    if (!contextMenu) return [];
    const ic = 'w-3.5 h-3.5';
    const commentHere: ContextMenuEntry[] = contextMenu.point
      ? [
          {
            label: 'Comment Here',
            shortcut: 'M',
            icon: <MessageCircle className={ic} />,
            onSelect: () => handlePlaceAnnotation(contextMenu.point!, contextMenu.partId),
          },
        ]
      : [];
    const part = parts.find((p) => p.id === contextMenu.partId);
    const multi = part && selectedIds.length > 1 && selectedIds.includes(part.id);
    const anyGrouped = selectedParts.some((p) => p.group);
    const alignEntry: ContextMenuEntry = {
      label: 'Align',
      icon: <AlignCenterVertical className={ic} />,
      submenu: (close) => (
        <AlignControls count={Math.max(1, selectedIds.length)} onAlign={handleAlign} onDistribute={handleDistribute} onDone={close} />
      ),
    };

    if (multi) {
      // Solid · Cutout · Guide for the whole selection (reference photos keep their role)
      const roles = new Set(selectedParts.map((p) => p.role));
      const setRole = (role: PartRole) =>
        commitParts((prev) =>
          prev.map((p) => (selectedIds.includes(p.id) && p.kind !== 'image_plane' ? { ...p, role } : p))
        );
      return [
        { heading: `${selectedIds.length} parts` },
        { label: 'Union', icon: <SquaresUnite className={ic} />, onSelect: () => handleRunBooleanCSG('union') },
        { label: `Subtract from ${selectedParts[0]?.name ?? 'First'}`, icon: <SquaresSubtract className={ic} />, onSelect: () => handleRunBooleanCSG('subtract') },
        { label: 'Intersect', icon: <SquaresIntersect className={ic} />, onSelect: () => handleRunBooleanCSG('intersect') },
        { divider: true },
        alignEntry,
        { label: 'Drop to Floor', shortcut: 'F', icon: <ArrowDownToLine className={ic} />, onSelect: handleDropToGround },
        { divider: true },
        { label: 'Solid', checked: roles.size === 1 && roles.has('solid'), onSelect: () => setRole('solid') },
        { label: 'Cutout', checked: roles.size === 1 && roles.has('cutout'), onSelect: () => setRole('cutout') },
        { label: 'Guide', checked: roles.size === 1 && roles.has('reference'), onSelect: () => setRole('reference') },
        { divider: true },
        ...(selectedParts.some((p) => p.hardware)
          ? [{ label: 'Add Clearance Holes', icon: <SquaresSubtract className={ic} />, onSelect: handleAddClearanceHole }]
          : []),
        { label: 'Group', shortcut: '⌘G', icon: <Group className={ic} />, onSelect: handleGroup },
        ...(anyGrouped ? [{ label: 'Ungroup', shortcut: '⇧⌘G', icon: <Ungroup className={ic} />, onSelect: handleUngroup }] : []),
        { label: 'Duplicate', shortcut: '⌘D', icon: <Copy className={ic} />, onSelect: handleDuplicateSelected },
        { label: 'Select All', shortcut: '⌘A', icon: <SquareDashedMousePointer className={ic} />, disabled: parts.length === 0, onSelect: handleSelectAll },
        { label: 'Save to Library', icon: <BookmarkPlus className={ic} />, onSelect: () => handleSaveAsModel('selected') },
        { divider: true },
        { label: 'Delete', shortcut: '⌫', icon: <Trash2 className={ic} />, tone: 'danger', onSelect: handleDeleteSelected },
      ];
    }

    if (part) {
      const setFlag = (patch: Partial<ScenePart>) =>
        commitParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, ...patch } : p)));
      return [
        { heading: part.name },
        ...(part.hardware
          ? [{ label: 'Add Clearance Hole', icon: <SquaresSubtract className={ic} />, onSelect: handleAddClearanceHole }]
          : []),
        { label: 'Duplicate', shortcut: '⌘D', icon: <Copy className={ic} />, onSelect: handleDuplicateSelected },
        { label: 'Select All', shortcut: '⌘A', icon: <SquareDashedMousePointer className={ic} />, disabled: parts.length === 0, onSelect: handleSelectAll },
        { label: 'Save to Library', icon: <BookmarkPlus className={ic} />, onSelect: () => handleSaveAsModel('selected') },
        ...commentHere,
        { divider: true },
        alignEntry,
        { label: 'Drop to Floor', shortcut: 'F', icon: <ArrowDownToLine className={ic} />, onSelect: handleDropToGround },
        { label: 'Stack on Part Below', shortcut: 'S', icon: <Layers className={ic} />, onSelect: handleStackOnBelow },
        { label: 'Reset Rotation', icon: <RotateCcw className={ic} />, disabled: part.rotation.every((r) => r === 0), onSelect: () => setFlag({ rotation: [0, 0, 0] }) },
        { label: 'Zoom to Part', shortcut: 'Z', icon: <Crosshair className={ic} />, onSelect: () => viewportRef.current?.focusSelected() },
        { divider: true },
        { label: 'Solid', checked: part.role === 'solid', onSelect: () => setFlag({ role: 'solid' }) },
        { label: 'Cutout', checked: part.role === 'cutout', onSelect: () => setFlag({ role: 'cutout' }) },
        { label: 'Guide', checked: part.role === 'reference', onSelect: () => setFlag({ role: 'reference' }) },
        { divider: true },
        { label: 'Subtract Overlapping Cutouts', icon: <SquaresSubtract className={ic} />, onSelect: () => handleRunBooleanCSG('subtract') },
        ...(part.group
          ? [{ label: `Ungroup ${part.group.name}`, shortcut: '⇧⌘G', icon: <Ungroup className={ic} />, onSelect: handleUngroup }]
          : []),
        { divider: true },
        { label: part.locked ? 'Unlock' : 'Lock', icon: part.locked ? <Unlock className={ic} /> : <Lock className={ic} />, onSelect: () => setFlag({ locked: !part.locked }) },
        { label: part.visible ? 'Hide' : 'Show', icon: part.visible ? <EyeOff className={ic} /> : <Eye className={ic} />, onSelect: () => setFlag({ visible: !part.visible }) },
        { label: 'Delete', shortcut: '⌫', icon: <Trash2 className={ic} />, tone: 'danger', onSelect: handleDeleteSelected },
      ];
    }

    return [
      { label: 'Add Part…', shortcut: '⌘K', icon: <Plus className={ic} />, onSelect: () => setPaletteOpen(true) },
      ...commentHere,
      { label: 'Add Reference Image…', icon: <ImageIcon className={ic} />, onSelect: () => pickReferenceImage(contextMenu.point) },
      { label: 'Sketch…', icon: <PenTool className={ic} />, onSelect: () => openCreator('draw2d') },
      { label: 'Import SVG…', icon: <FileUp className={ic} />, onSelect: () => openCreator('svg') },
      { divider: true },
      { label: 'Select All', shortcut: '⌘A', icon: <SquareDashedMousePointer className={ic} />, disabled: parts.length === 0, onSelect: handleSelectAll },
      { divider: true },
      ...CAMERA_VIEWS.map((v) => ({
        label: `${v.label} View`,
        shortcut: v.shortcut,
        icon: <Box className={ic} />,
        onSelect: () => setCameraView(v.id),
      })),
      { label: 'Reset View', icon: <Crosshair className={ic} />, onSelect: () => { setSelectedIds([]); viewportRef.current?.focusSelected(); } },
      { divider: true },
      { label: 'Show Grid', checked: showGrid, onSelect: () => setShowGrid((v) => !v) },
      { divider: true },
      { label: 'Save Scene', shortcut: '⌘S', icon: <Save className={ic} />, onSelect: handleSync },
      { label: 'Export STL', icon: <Download className={ic} />, disabled: parts.length === 0, onSelect: handleExportSTL },
    ];
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  const canUndo = doc.past.length > 0 || doc.base !== null;
  const canRedo = doc.future.length > 0;

  const docActions = (
    <>
      <IconButton icon={<Undo2 className="w-4 h-4" />} title="Undo" shortcut="⌘Z" onClick={handleUndo} disabled={!canUndo} />
      <IconButton icon={<Redo2 className="w-4 h-4" />} title="Redo" shortcut="⇧⌘Z" onClick={handleRedo} disabled={!canRedo} />
    </>
  );

  const exportActions = (
    <ExportMenu
      canExportStl={parts.length > 0}
      onExportImage={handleExportImage}
      onExportStl={handleExportSTL}
      onCopyMarkdown={handleCopyBrief}
    />
  );

  return (
    <div className="absolute inset-0 overflow-hidden text-white/90 select-none">
      {/* Title bar (window chrome): App lays the sidebar toggle and scene tabs over it; this scene adds its actions */}
      <div className="absolute top-0 inset-x-0 h-[44px]" style={DRAG_REGION}>
        {/* Centered on y = 23; right edge in line with the inspector card's content (8 + 12px) */}
        <div
          ref={rightIslandRef}
          className="absolute right-[20px] top-[8px] h-[28px] flex items-center gap-2"
          style={NO_DRAG_REGION}
        >
          <div className="flex items-center gap-1">{docActions}</div>
          {/* Export lives in the inspector's header; it comes up here only while the inspector is hidden */}
          {!isRightOpen && exportActions}
          <IconButton
            icon={<PanelRight className="w-4 h-4" />}
            title={isRightOpen ? 'Hide inspector' : 'Show inspector'}
            shortcut="⌘I"
            onClick={() => setIsRightOpen((v) => !v)}
          />
        </div>
      </div>

      {/* View rail (like ChatGPT's): the sidebar's views as icons on the chrome, under the close button.
          The first icon centers on the card header row; Settings sits at the bottom. */}
      <nav aria-label="Sidebar views" className="absolute left-[8px] top-[48px] bottom-[12px] w-[36px] flex flex-col items-center gap-[4px]" style={NO_DRAG_REGION}>
        {LEFT_VIEWS.map((v) => (
          <IconButton
            key={v.value}
            icon={<v.Icon filled={isLeftOpen && leftTab === v.value} />}
            title={v.label}
            tooltipSide="right"
            size="md"
            variant="ghost"
            isToggled={isLeftOpen && leftTab === v.value}
            className="w-[36px]! h-[36px]! rounded-[10px]!"
            onClick={() => {
              // The open view collapses the sidebar (like an activity bar); any other view opens it
              if (isLeftOpen && leftTab === v.value) setIsLeftOpen(false);
              else {
                setLeftTab(v.value);
                setIsLeftOpen(true);
              }
            }}
          />
        ))}
        <div className="flex-1" />
        <IconButton
          icon={<Settings className="w-[18px] h-[18px]" />}
          title="Settings"
          shortcut="⌘,"
          tooltipSide="right"
          size="md"
          variant="ghost"
          className="w-[36px]! h-[36px]! rounded-[10px]!"
          onClick={() => openSettings()}
        />
      </nav>

      {/* Sidebar, canvas and inspector: three rounded cards on the chrome, 8px apart and from the edges */}
      <div className="absolute top-[44px] left-[52px] right-[8px] bottom-[8px] flex">
      <LeftSidebar
        open={isLeftOpen}
        sceneGoal={globalGoal}
        partsSearchRef={partsSearchRef}
        onImportRobot={handlePickRobot}
        width={panelWidths.left}
        resizing={resizingPanel === 'left'}
        edge={
          <PanelResizer
            edge="right"
            width={panelWidths.left}
            min={LAYOUT.leftPanelMin}
            max={LAYOUT.leftPanelMax}
            defaultWidth={LAYOUT.leftPanelWidth}
            onResize={(left) => setPanelWidths((w) => ({ ...w, left }))}
            onCollapse={() => {
              setIsLeftOpen(false);
              setPanelWidths((w) => ({ ...w, left: LAYOUT.leftPanelWidth }));
            }}
            onResizingChange={(r) => setResizingPanel(r ? 'left' : null)}
          />
        }
        tab={leftTab}
        onTabChange={setLeftTab}
        parts={parts}
        selectedIds={selectedIds}
        onSelectPart={handleSelect}
        onSelectIds={(ids, additive) =>
          setSelectedIds((prev) =>
            additive ? [...prev, ...ids.filter((id) => !prev.includes(id))] : ids
          )
        }
        onRenameGroup={handleRenameGroup}
        showReferenceImages={showReferenceImages}
        onToggleReferenceImages={() => setShowReferenceImages((v) => !v)}
        onTogglePartFlag={handleTogglePartFlag}
        onRenamePart={handleRenamePart}
        onPartContextMenu={(id, x, y) => openContextMenu(x, y, id, null)}
        onAddCatalogItem={handleAddCatalogItem}
        library={{
          currentSceneId: sceneId,
          openTabs: studio.tabs,
          savedScenes,
          customModels,
          onOpenScene: studio.openScene,
          onSaveScene: handleSync,
          onRenameScene: handleRenameLibraryScene,
          onDuplicateScene: handleDuplicateLibraryScene,
          onDeleteScene: handleDeleteLibraryScene,
          onInsertModel: handlePlaceCustomModel,
          onRenameModel: handleRenameLibraryModel,
          onDuplicateModel: handleDuplicateLibraryModel,
          onDeleteModel: handleDeleteLibraryModel,
          onSaveModel: handleSaveAsModel,
          onImportSvg: () => openCreator('svg'),
          onImageToModel: () => {
            setIsRightOpen(true);
            setRightTab('acp');
            setAttachRequest((n) => n + 1);
          },
        }}
      />

      {/* Canvas (the active scene tab opens into its top edge) */}
      <main
        className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#1b1b1b] rounded-[12px]"
        onPointerDownCapture={(e) => {
          menuPressRef.current =
            e.button === 2 || (e.button === 0 && e.ctrlKey)
              ? { x: e.clientX, y: e.clientY, pending: false, moved: false, released: false }
              : null;
          agentFollowRef.current = false;
        }}
        onWheelCapture={(e) => {
          agentFollowRef.current = false;
          lastWheelRef.current = e.timeStamp;
        }}
        onContextMenu={handleCanvasContextMenu}
        onPointerUpCapture={handleCanvasPointerUp}
        onPointerMoveCapture={(e) => {
          const press = menuPressRef.current;
          if (press && !press.released && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) press.moved = true;
        }}
        onPointerCancelCapture={() => {
          menuPressRef.current = null;
        }}
        onDragOver={(e) => {
          if (isSceneDrag(e.dataTransfer.types)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            return;
          }
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setIsDraggingFile(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFile(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFile(false);
          const partKind = e.dataTransfer.getData(PART_DRAG_TYPE);
          const modelId = e.dataTransfer.getData(MODEL_DRAG_TYPE);
          const robot = e.dataTransfer.getData(ROBOT_DRAG_TYPE);
          if (partKind || modelId || robot) {
            const hit = viewportRef.current?.pickAt(e.clientX, e.clientY);
            const snap = (v: number) => (snapStepMm > 0 ? Math.round(v / snapStepMm) * snapStepMm : Math.round(v));
            // Dropping on a part stacks on its surface; otherwise it sits on the floor
            const at: [number, number, number] | undefined = hit
              ? [snap(hit.point[0]), hit.partId ? Math.max(0, hit.point[1]) : 0, snap(hit.point[2])]
              : undefined;
            // Hardware payloads are "hardware:type|size|length"
            const item = partKind ? catalogItemFromKey(partKind) : undefined;
            const model = customModels.find((m) => m.id === modelId);
            if (item) handleAddCatalogItem(item, at);
            else if (model) handlePlaceCustomModel(model, at);
            else if (robot) {
              try {
                const { url, name } = JSON.parse(robot) as { url: string; name?: string };
                void handleImportRobot({ kind: 'url', url, name }, at ?? [0, 0, 0]);
              } catch {
                /* not ours */
              }
            }
            return;
          }
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
          const hit = viewportRef.current?.pickAt(e.clientX, e.clientY);
          files.forEach((f, i) => {
            const at = hit ? ([hit.point[0] + i * 16, 0, hit.point[2]] as [number, number, number]) : null;
            handleAddImagePlane(f, f.name, at);
          });
        }}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            files.forEach((f, i) => {
              const at = imagePlaceRef.current;
              handleAddImagePlane(f, f.name, at ? [at[0] + i * 16, 0, at[2]] : null);
            });
            e.target.value = '';
          }}
        />
        {isDraggingFile && (
          <div className="absolute inset-3 z-40 rounded-3xl border-2 border-dashed border-[#0d99ff]/70 bg-[#0d99ff]/[0.06] flex items-center justify-center pointer-events-none animate-fade-in">
            <div className="glass rounded-2xl px-5 py-3 flex items-center gap-2.5 text-[14px] text-white/90">
              <ImageIcon className="w-5 h-5 text-[#5cb8ff]" />
              Drop to add a reference image
            </div>
          </div>
        )}
        <Viewport3D
          ref={viewportRef}
          parts={showReferenceImages ? parts : viewportPartsNoImages}
          selectedPartIds={selectedIds}
          transformMode={transformMode}
          sculptSettings={sculptSettings}
          snapStepMm={snapStepMm}
          snapAngleDeg={snapAngleDeg}
          trackpadMode={trackpadMode}
          showGrid={showGrid}
          blueprintDataUrl={activeBlueprintUrl}
          onSelectPart={handleSelect}
          onUpdatePartTransform={handleUpdatePartTransform}
          onUpdatePartsTransform={handleUpdatePartsTransform}
          onMarqueeSelect={(ids) => {
            if (ids.length === 0) return;
            const withGroups = expandToGroups(parts, ids);
            setSelectedIds((prev) => [...prev, ...withGroups.filter((id) => !prev.includes(id))]);
          }}
          onCommitSculptMesh={handleCommitSculptMesh}
          annotateMode={commentMode}
          onPlaceAnnotation={handlePlaceAnnotation}
          paused={!active}
          pose={posing.deltas}
          poseJoint={transformMode === 'pose' ? posing.poseJoint : null}
          onPoseJoint={posing.onPoseJoint}
        />
        <AnnotationLayer
          annotations={annotations}
          parts={parts}
          viewportRef={viewportRef}
          activeId={activeAnnotationId}
          draft={annotationDraft}
          onOpen={setActiveAnnotationId}
          onCancelDraft={() => setAnnotationDraft(null)}
          onCreate={handleCreateAnnotation}
          onReply={handleReplyAnnotation}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
          onToggleResolved={handleToggleResolved}
          onDeleteThread={handleDeleteThread}
        />
        <AgentCursor
          viewportRef={viewportRef}
          target={agentCursorTarget}
          visible={isAcpBusy && !!agentCursorTarget}
          action={agentAction || agentStatus}
        />
        <div className="canvas-vignette absolute inset-0 pointer-events-none" />
        {/* Edge of the canvas card: a near-transparent white ring drawn over the 3D view, for separation from the chrome */}
        <div aria-hidden className="absolute inset-0 z-10 rounded-[12px] pointer-events-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" />


        <div className="absolute bottom-5 inset-x-0 z-20 flex flex-col items-center gap-2 pointer-events-none">
          {selectedParts.length > 1 && transformMode !== 'pose' && (
            <FloatingIsland key="selection-bar" className="pointer-events-auto h-10 pl-3.5 pr-1 gap-1 rounded-full animate-pop-up">
              <span className="text-[13px] font-medium text-white/85 tabular pr-1.5 whitespace-nowrap">{selectedParts.length} selected</span>
              <IslandDivider />
              <Button size="sm" variant="ghost" icon={<SquaresUnite className="w-4 h-4" />} onClick={() => handleRunBooleanCSG('union')} title="Merge into one solid" tooltipSide="top">
                Union
              </Button>
              <Button size="sm" variant="ghost" icon={<SquaresSubtract className="w-4 h-4" />} onClick={() => handleRunBooleanCSG('subtract')} title={`Cut the others out of ${selectedParts[0].name}`} tooltipSide="top">
                Subtract
              </Button>
              <Button size="sm" variant="ghost" icon={<SquaresIntersect className="w-4 h-4" />} onClick={() => handleRunBooleanCSG('intersect')} title="Keep only the shared volume" tooltipSide="top">
                Intersect
              </Button>
              <IslandDivider />
              {selectedParts.some((p) => p.group) ? (
                <IconButton icon={<Ungroup className="w-4 h-4" />} title="Ungroup" shortcut="⇧⌘G" tooltipSide="top" className="rounded-full" onClick={handleUngroup} />
              ) : (
                <IconButton icon={<Group className="w-4 h-4" />} title="Group" shortcut="⌘G" tooltipSide="top" className="rounded-full" onClick={handleGroup} />
              )}
            </FloatingIsland>
          )}
          <div className="pointer-events-auto">
            <ViewportToolbar
              transformMode={transformMode}
              onTransformMode={handleSetTransformMode}
              showSculpt={sculptEnabled}
              commentMode={commentMode}
              onToggleComment={() => toggleCommentMode()}
              shapesOpen={shapesMenuOpen}
              onShapesOpenChange={setShapesMenuOpen}
              onAddShape={handleAddCatalogItem}
              onSketch={() => openCreator('draw2d')}
              onImportSvg={() => openCreator('svg')}
            />
          </div>
        </div>

        {toast && (
          <div className={`absolute ${selectedParts.length > 1 && transformMode !== 'pose' ? 'bottom-[144px]' : 'bottom-[92px]'} inset-x-0 z-30 flex justify-center pointer-events-none transition-[bottom] duration-200`}>
            <div className="pointer-events-auto" key={toast.id}>
              <Toast toast={toast} onDismiss={() => setToast(null)} />
            </div>
          </div>
        )}
      </main>

      {/* Right panel */}
      {/* The aside's width includes the gap before the card, so collapsing closes the gap too; the resizer sits in it */}
      <aside
        aria-hidden={!isRightOpen}
        className={`relative h-full shrink-0 overflow-hidden ${
          resizingPanel === 'right' ? '' : 'transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]'
        }`}
        style={{ width: isRightOpen ? panelWidths.right + LAYOUT.panelGap : 0 }}
      >
        {isRightOpen && (
          <PanelResizer
            edge="left"
            width={panelWidths.right}
            min={LAYOUT.rightPanelMin}
            max={LAYOUT.rightPanelMax}
            defaultWidth={LAYOUT.rightPanelWidth}
            onResize={(right) => setPanelWidths((w) => ({ ...w, right }))}
            onCollapse={() => {
              setIsRightOpen(false);
              setPanelWidths((w) => ({ ...w, right: LAYOUT.rightPanelWidth }));
            }}
            onResizingChange={(r) => setResizingPanel(r ? 'right' : null)}
          />
        )}
        <div
          className="h-full flex flex-col overflow-hidden bg-[#1f1f1f] rounded-[12px]"
          style={{ width: panelWidths.right, marginLeft: LAYOUT.panelGap }}
        >
          {/* Card header: its views as tabs (Agent shows Claude's spinner while it works), Export on the right.
              28px controls in a 44px row with 8px padding: an even 8px on every side; content centers on y = 66 */}
          <div className="h-[44px] shrink-0 flex items-center justify-between gap-2 px-[8px]">
            <PanelTabs<RightTab>
              label="Inspector"
              value={rightTab}
              onChange={setRightTab}
              tabs={[
                { value: 'inspector', label: 'Inspect' },
                ...(onRobot ? [{ value: 'pose' as const, label: 'Pose' }] : []),
                { value: 'build', label: 'Build' },
                { value: 'acp', label: 'Agent', indicator: isAcpBusy ? <AgentSpinner /> : undefined },
              ]}
            />
            {isRightOpen && exportActions}
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            {rightTab === 'pose' && (
              <PosePanel
                posing={posing}
                onSelectParts={setSelectedIds}
                onImportMotion={handleImportMotion}
                onWalkCycle={handleWalkCycle}
                canWalk={canWalk}
              />
            )}
            {rightTab === 'inspector' && studioMode && (
              <SculptAndDrawStudio
                selectedPart={selectedParts[0] ?? null}
                sculptSettings={sculptSettings}
                mode={studioMode}
                onChangeMode={(m) => m !== 'clay' && setCreator(m)}
                onDone={() => (studioMode === 'clay' ? handleSetTransformMode('translate') : setCreator(null))}
                onUpdateSculptSettings={(patch) => setSculptSettings((s) => ({ ...s, ...patch }))}
                onAddClayPreset={handleAddClayPreset}
                onSubdivideSelectedClay={handleSubdivideSelectedClay}
                onCreateFrom2DDrawing={async (params) => {
                  await handleCreateFrom2DDrawing(params);
                  setCreator(null);
                }}
              />
            )}
            {rightTab === 'inspector' && !studioMode && (
              <Inspector
                part={selectedPart}
                parts={parts}
                globalGoal={globalGoal}
                onChangeGoal={setGlobalGoal}
                snapStepMm={snapStepMm}
                onUpdate={handleUpdateSelectedPart}
                onDuplicate={handleDuplicateSelected}
                onSaveAsModel={() => handleSaveAsModel('selected')}
                onDelete={handleDeleteSelected}
                onDropToFloor={handleDropToGround}
                onStack={handleStackOnBelow}
                annotations={annotations}
                activeAnnotationId={activeAnnotationId}
                onOpenAnnotation={setActiveAnnotationId}
                onAddComment={() => toggleCommentMode(true)}
                selectedParts={selectedParts}
                onUpdateMany={handleUpdateSelectedParts}
                onBoolean={handleRunBooleanCSG}
                onGroup={handleGroup}
                onUngroup={handleUngroup}
                onAlign={handleAlign}
                onDistribute={handleDistribute}
                onMoveSelection={handleMoveSelection}
                onRotateSelection={handleRotateSelection}
                onRenameGroup={handleRenameGroup}
                onChangeHardware={handleChangeHardware}
                onAddClearanceHole={handleAddClearanceHole}
              />
            )}
            {rightTab === 'build' && (
              <BuildPanel
                parts={parts}
                sceneName={sceneName}
                project={project}
                onChangeProject={handleChangeProject}
                measure={measureParts}
                getTriangles={partTriangles}
                onRunChecks={() => runEngineeringNow(true)}
                onSelectParts={(ids) => setSelectedIds(ids)}
                onToast={(m) => showToast(m)}
              />
            )}
            {rightTab === 'acp' && (
              <AcpStudioPanel
                acpStatus={acpStatus}
                messages={acpMessages}
                isBusy={isAcpBusy}
                status={agentStatus}
                canRevert={!!agentRunBase && agentRunBase !== parts}
                attachRequest={attachRequest}
                targetHeightMm={agentTargetHeightMm}
                onReconnectAcp={studio.reconnectAcp}
                onUploadImage={handleUploadImage}
                onSend={handleSendToAgent}
                onStop={handleStopAgent}
                onNewChat={handleNewAgentChat}
                chats={chatList}
                currentChatId={chatId}
                onOpenChat={handleOpenAgentChat}
                onDeleteChat={handleDeleteAgentChat}
                onRevert={handleRevertAgentRun}
              />
            )}
          </div>
        </div>
      </aside>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems()}
          onClose={() => setContextMenu(null)}
        />
      )}

      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ImportRobotSheet open={importRobotOpen} onClose={() => setImportRobotOpen(false)} onImport={(src) => void handleImportRobot(src)} />
      <RetargetSheet
        key={motionSource?.name}
        source={motionSource}
        rig={posing.robot?.rig ?? posing.rig}
        pointOf={posing.pointOf}
        onClose={() => setMotionSource(null)}
        onCreate={(anim, summary) => {
          setMotionSource(null);
          const made = posing.addAnimation({ ...anim, robot: posing.robot?.group.key });
          openPose();
          posing.play(made.id, 0);
          showToast(`Added ${made.name}${summary}`);
        }}
      />
      <input
        ref={motionInputRef}
        type="file"
        accept=".bvh"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) setMotionSource({ name: file.name, text: await file.text() });
        }}
      />
    </div>
  );
}

/**
 * Background scenes skip re-rendering for app-wide changes (panel drags, other tabs' names);
 * their own state (an agent building) still renders, and they catch up when brought to front.
 */
export const SceneWorkspace = memo(
  SceneWorkspaceImpl,
  (prev, next) => !prev.active && !next.active && prev.workspaceId === next.workspaceId && prev.seed === next.seed
);
