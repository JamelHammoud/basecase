import type { SourcedItem } from '../../data/sourcedItems';
import type { PairReply, PhoneEvent, PhoneState } from '../../phone/phoneTypes';
import type { ConnectReply, ConnectSpec, RobotEvent, RobotLinkState } from '../../robot/robotState';
import type { CadAudit, CadPort } from '../../types/cadAudit';
import {
  AcpChatMessage,
  AcpStatusInfo,
  AgentConversation,
  AgentConversationSummary,
  CustomModelDefinition,
  PurchaseRecord,
  ReferenceImageRecord,
  SavedSceneRecord,
  SavedSceneSummary,
} from '../../types/robotics';
import type { ExportedStep, StepJob } from '../../types/step';
import type { ConvertedFiles, ConvertedModel } from '../robotImport/simready';

export interface CadBody {
  name: string;
  color: string;
  center: [number, number, number];
  size: [number, number, number];
  vertices: number;
  triangles: number;
}

export interface OpenedCad {
  bodies: CadBody[];
  data: Uint8Array;
}

export interface CadTuneRequest {
  workspaceId: string;
  id: string;
  values: Record<string, number>;
}

export interface CadTuneAnswer {
  code: string;
  result: Uint8Array | Record<string, unknown>;
}

export type CadLanguage = 'openscad' | 'replicad';

export interface RenderedCad {
  ok: boolean;
  positions?: number[];
  indices?: number[];
  edges?: number[] | null;
  stats?: { volume?: number };
  audit?: CadAudit;
  ports?: CadPort[];
  error?: string;
}

export interface AcpPromptPayload {
  action: 'image-to-3d' | 'generate-part' | 'build';
  workspaceId?: string;
  targetHeightMm?: number;
  model?: string;
  effort?: string;
  imageDataUrls?: string[];
  modelName?: string;
  promptText?: string;
  imageName?: string;
  imageFilePath?: string;
  imageDataUrl?: string;
  analyzedFeatures?: unknown;
  evidenceFolders?: Array<{ id: string; name: string }>;
  run?: AcpRunStart;
}

export interface AcpRunStart {
  chatId: string;
  messages: AcpChatMessage[];
}

export type LiveRunEntry = { at: string } & ({ messages: AcpChatMessage[] } | { update: unknown });

export interface LiveRun {
  key: string;
  sessionId: string;
  chatId: string;
  busy: boolean;
  stopReason?: string;
  error?: string;
  entries: LiveRunEntry[];
}

export interface TrainerStatus {
  uv: boolean;
  uvInstall?: string;
  ready: boolean;
  running: string[];
  desktopOnly?: boolean;
}

export interface SimReadyStatus {
  uv: boolean;
  ready: boolean;
}

export interface SimReadyFetched {
  key: string;
  model: ConvertedModel;
  files: ConvertedFiles;
}

export interface TrainStartPayload {
  workspaceId: string;
  xml: string;
  job: Record<string, unknown>;
  priority?: number;
}

export interface EvidenceFilePayload {
  folderId: string;
  folderName: string;
  relPath: string;
  dataUrl?: string;
  text?: string;
}

export interface AppMenuState {
  sidebar: boolean;
  inspector: boolean;
  grid: boolean;
  referenceImages: boolean;
  trackpadMode: string;
  hasSelection: boolean;
  hasParts: boolean;
  tabs: Array<{ id: string; name: string }>;
  activeTab: string;
  canReopenTab: boolean;
}

export type SteerOutcome = 'injected' | 'promptRequired' | 'unsupported';

export interface ScenePreviewPayload {
  id: string;
  previewDataUrl?: string;
  sizeMm?: [number, number, number];
  current?: boolean;
}

export interface AppUpdateState {
  stage: 'none' | 'getting' | 'ready' | 'installing';
  version: string;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      popupAppMenu?: (at: { x: number; y: number }) => Promise<void>;
      isFullScreen: () => Promise<boolean>;
      onFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void;
      updateState: () => Promise<AppUpdateState>;
      installUpdate: () => Promise<void>;
      onUpdateState: (callback: (state: AppUpdateState) => void) => () => void;
      getAcpStatus: (workspaceId?: string) => Promise<AcpStatusInfo>;
      connectAcp: (agentCommand?: string) => Promise<AcpStatusInfo>;
      authenticateAcp: (methodId: string) => Promise<AcpStatusInfo>;
      setAgentApiKey: (key: string) => Promise<AcpStatusInfo>;
      cancelAcp: (workspaceId?: string) => Promise<{ ok: boolean }>;
      closeAcpWorkspace: (workspaceId: string) => Promise<{ ok: boolean }>;
      liveAcpRuns: (workspaceId: string) => Promise<LiveRun[]>;
      forgetAcpRun: (workspaceId: string) => Promise<{ ok: boolean }>;
      steerAcp: (payload: AcpPromptPayload) => Promise<{ outcome: SteerOutcome }>;
      saveEvidenceFile: (payload: EvidenceFilePayload) => Promise<{ ok: boolean; path: string }>;
      resumeAcp: (sessionId: string, workspaceId?: string) => Promise<AcpStatusInfo>;
      listChats: () => Promise<AgentConversationSummary[]>;
      listPurchases: () => Promise<Record<string, PurchaseRecord>>;
      trainStatus: () => Promise<TrainerStatus>;
      simreadyStatus: () => Promise<SimReadyStatus>;
      simreadyFetch: (payload: { url: string; requestId: string }) => Promise<SimReadyFetched>;
      simreadyFile: (payload: { key: string; file: string }) => Promise<Uint8Array | null>;
      trainStart: (payload: TrainStartPayload) => Promise<{ jobId: string }>;
      trainStop: (workspaceId: string) => Promise<{ stopping: boolean }>;
      kitRequest: (payload: TrainStartPayload) => Promise<{ jobId: string | null }>;
      kitCancel: (workspaceId: string) => Promise<{ ok: boolean }>;
      saveSkill: (payload: { hash: string; text: string }) => Promise<{ ok: boolean }>;
      getSkill: (hash: string) => Promise<unknown>;
      getPolicy: (id: string) => Promise<unknown>;
      deletePolicy: (id: string) => Promise<boolean>;
      listSourced: () => Promise<SourcedItem[]>;
      saveSourced: (payload: unknown) => Promise<SourcedItem>;
      removeSourced: (id: string) => Promise<SourcedItem[]>;
      sourcedMesh: (id: string) => Promise<Uint8Array | null>;
      importMakerCad: (payload: unknown) => Promise<{ item: SourcedItem; members: string[]; mismatch: string | null }>;
      openCadFile: (payload: { name: string; bytes: Uint8Array }) => Promise<OpenedCad>;
      exportStep: (job: StepJob) => Promise<ExportedStep>;
      tuneCadPart: (payload: CadTuneRequest) => Promise<CadTuneAnswer>;
      renderCad: (payload: { language: CadLanguage; code: string }) => Promise<Uint8Array>;
      savePurchase: (payload: {
        key: string;
        record: PurchaseRecord | null;
      }) => Promise<Record<string, PurchaseRecord>>;
      getChat: (id: string) => Promise<AgentConversation | null>;
      saveChat: (conv: AgentConversation) => Promise<AgentConversationSummary[]>;
      deleteChat: (id: string) => Promise<AgentConversationSummary[]>;
      newAcpConversation: (workspaceId?: string) => Promise<AcpStatusInfo>;
      respondToAgent: (payload: { requestId: string; result?: unknown; error?: string }) => Promise<{ ok: boolean }>;
      sendAcpPrompt: (payload: AcpPromptPayload) => Promise<{
        stopReason: string;
        sessionId?: string;
        models: CustomModelDefinition[];
        scenes: SavedSceneSummary[];
      }>;
      uploadImage: (payload: {
        name: string;
        dataUrl: string;
        width?: number;
        height?: number;
      }) => Promise<ReferenceImageRecord>;
      listImages: () => Promise<ReferenceImageRecord[]>;
      listModels: () => Promise<CustomModelDefinition[]>;
      saveModel: (modelDef: CustomModelDefinition) => Promise<CustomModelDefinition>;
      deleteModel: (modelId: string) => Promise<CustomModelDefinition[]>;
      listScenes: () => Promise<SavedSceneSummary[]>;
      getScene: (sceneId: string) => Promise<SavedSceneRecord | null>;
      saveScenePreview: (payload: ScenePreviewPayload) => Promise<SavedSceneSummary | null>;
      saveScene: (scenePayload: Record<string, unknown>) => Promise<SavedSceneSummary>;
      saveSceneJson: (json: string) => Promise<SavedSceneSummary>;
      deleteScene: (sceneId: string) => Promise<SavedSceneSummary[]>;
      saveGuide: (payload: { id: string; html: string }) => Promise<{ ok: boolean; path: string; bytes: number }>;
      openGuide: (id: string) => Promise<boolean>;
      revealGuide: (id: string) => Promise<boolean>;
      guideExists: (id: string) => Promise<boolean>;
      guideHtml: (id: string) => Promise<string | null>;
      shareFile?: (payload: { name: string; bytes: Uint8Array }) => Promise<'airdrop' | 'shared' | 'shown'>;
      askCameraAccess?: () => Promise<boolean>;
      onBackendEvent: (callback: (event: Record<string, unknown>) => void) => () => void;
      printCall?: (channel: string, payload?: unknown) => Promise<unknown>;
      hubCall?: (channel: string, payload?: unknown) => Promise<unknown>;
      onshapeCall?: (channel: string, payload?: unknown) => Promise<unknown>;
      robotConnect?: (spec: ConnectSpec) => Promise<ConnectReply>;
      robotCommand?: (command: Record<string, unknown>) => Promise<ConnectReply>;
      robotDisconnect?: () => Promise<ConnectReply>;
      robotState?: () => Promise<RobotLinkState>;
      onRobotEvent?: (callback: (event: RobotEvent) => void) => () => void;
      phonePair?: () => Promise<PairReply>;
      phoneUnpair?: () => Promise<{ ok: boolean }>;
      phoneState?: () => Promise<PhoneState>;
      onPhoneEvent?: (callback: (event: PhoneEvent) => void) => () => void;
      setMenuState: (state: Partial<AppMenuState>) => void;
      onMenuCommand: (callback: (id: string) => void) => () => void;
    };
  }
}

export type ElectronApi = NonNullable<Window['electronAPI']>;
