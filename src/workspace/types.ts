import type { SettingsPane } from '../components/SettingsWindow';
import type { ToastData } from '../design-system';
import type { LaneChat } from './agentLanes';
import type {
  AcpStatusInfo,
  AgentChoice,
  AgentConversationSummary,
  CustomModelDefinition,
  ProjectSettings,
  ReferenceImageRecord,
  RobotJoint,
  RobotPoseState,
  SceneAnnotation,
  SceneMark,
  ScenePart,
  MeasureUnit,
  TrackpadGestureMode,
} from '../types/robotics';

export type { Vec3 } from '../three/viewport/types';

export interface WorkspaceSeed {
  sceneId: string;
  sceneName: string;
  globalGoal: string;
  parts: ScenePart[];
  annotations: SceneAnnotation[];
  project?: ProjectSettings;
  chat?: LaneChat;
  blank?: boolean;
  unsaved?: boolean;
}

export interface WorkspaceMeta {
  sceneId: string;
  name: string;
  partCount: number;
  busy: boolean;
  activity: string;
  chatId: string | null;
  chatIds: string[];
  pristine: boolean;
}

export type ToastOptions = Omit<ToastData, 'id' | 'message'>;

export type ShowToast = (message: string, opts?: ToastOptions) => void;

export interface WorkspaceHandle {
  onEvent: (event: Record<string, unknown>) => void;
  snapshot: () => WorkspaceSeed;
  thumbnail: () => Promise<string>;
  load: (seed: WorkspaceSeed, toast?: string) => void;
  rename: (name: string) => void;
  toast: ShowToast;
  persistChat: () => void;
  flush: () => Promise<void>;
  discard: () => void;
  stopAgent: () => void;
}

export interface Preferences {
  snapStepMm: number;
  snapAngleDeg: number;
  trackpadMode: TrackpadGestureMode;
  showGrid: boolean;
  sculptEnabled: boolean;
  measureUnit: MeasureUnit;
}

export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export interface StudioShared {
  snapStepMm: number;
  setSnapStepMm: Setter<number>;
  snapAngleDeg: number;
  measureUnit: MeasureUnit;
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
  uploadedImages: ReferenceImageRecord[];
  setUploadedImages: Setter<ReferenceImageRecord[]>;
  chatList: AgentConversationSummary[];
  setChatList: Setter<AgentConversationSummary[]>;
  acpStatus: AcpStatusInfo;
  reconnectAcp: (command?: string) => Promise<void>;
  signInAcp: (methodId: string) => Promise<void>;
  saveAgentApiKey: (key: string) => Promise<void>;
  agentTargetHeightMm: number;
  agentChoice: AgentChoice;
  setAgentChoice: (choice: AgentChoice) => void;
  settingsOpen: boolean;
  openSettings: (pane?: SettingsPane) => void;
  tabs: Array<{ id: string; name: string; sceneId: string }>;
  canReopenTab: boolean;
  register: (id: string, handle: WorkspaceHandle | null) => void;
  reportMeta: (id: string, meta: WorkspaceMeta) => void;
  reportRightIsland: (width: number) => void;
  newScene: (seed?: WorkspaceSeed) => void;
  openSceneList: () => void;
  selectTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  closeTab: (id: string) => void;
  duplicateTab: (id: string) => void;
  reopenTab: () => void;
  cycleTab: (step: number) => void;
  focusChat: (chatId: string, from: string) => boolean;
  notify: (from: string, message: string) => void;
}

export interface SceneWorkspaceProps {
  workspaceId: string;
  active: boolean;
  seed?: WorkspaceSeed;
  studio: StudioShared;
}

export type RightTab = 'inspector' | 'pose' | 'sim' | 'build' | 'acp';

export type CreatorMode = 'draw2d' | 'svg';

export interface Snapshot {
  parts: ScenePart[];
  pose: RobotPoseState | undefined;
  joints: RobotJoint[] | undefined;
  marks: SceneMark[] | undefined;
}

export interface DocState {
  parts: ScenePart[];
  past: Snapshot[];
  future: Snapshot[];
  base: ScenePart[] | null;
}

export type CommitParts = (updater: (prev: ScenePart[]) => ScenePart[], live?: boolean) => void;

export interface AgentRequestEvent {
  requestId: string;
  kind: string;
  payload: Record<string, unknown>;
  workspaceId?: string;
  toolUseId?: string;
}
