import {
  AcpStatusInfo,
  AgentConversation,
  AgentConversationSummary,
  CustomModelDefinition,
  PurchaseRecord,
  ReferenceImageRecord,
  SavedSceneRecord,
  SavedSceneSummary,
} from '../../types/robotics';

export interface AcpPromptPayload {
  action: 'image-to-3d' | 'generate-part' | 'build';
  workspaceId?: string;
  targetHeightMm?: number;
  imageDataUrls?: string[];
  modelName?: string;
  promptText?: string;
  imageName?: string;
  imageFilePath?: string;
  imageDataUrl?: string;
  analyzedFeatures?: unknown;
  evidenceFolders?: Array<{ id: string; name: string }>;
}

export interface TrainerStatus {
  uv: boolean;
  ready: boolean;
  running: string[];
}

export interface TrainStartPayload {
  workspaceId: string;
  xml: string;
  job: Record<string, unknown>;
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
  previewDataUrl: string;
  sizeMm?: [number, number, number];
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      isFullScreen: () => Promise<boolean>;
      onFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void;
      getAcpStatus: (workspaceId?: string) => Promise<AcpStatusInfo>;
      connectAcp: (agentCommand?: string) => Promise<AcpStatusInfo>;
      cancelAcp: (workspaceId?: string) => Promise<{ ok: boolean }>;
      closeAcpWorkspace: (workspaceId: string) => Promise<{ ok: boolean }>;
      steerAcp: (payload: AcpPromptPayload) => Promise<{ outcome: SteerOutcome }>;
      saveEvidenceFile: (payload: EvidenceFilePayload) => Promise<{ ok: boolean; path: string }>;
      resumeAcp: (sessionId: string, workspaceId?: string) => Promise<AcpStatusInfo>;
      listChats: () => Promise<AgentConversationSummary[]>;
      listPurchases: () => Promise<Record<string, PurchaseRecord>>;
      trainStatus: () => Promise<TrainerStatus>;
      trainStart: (payload: TrainStartPayload) => Promise<{ jobId: string }>;
      trainStop: (workspaceId: string) => Promise<{ stopping: boolean }>;
      getPolicy: (id: string) => Promise<unknown>;
      deletePolicy: (id: string) => Promise<boolean>;
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
      deleteScene: (sceneId: string) => Promise<SavedSceneSummary[]>;
      onBackendEvent: (callback: (event: Record<string, unknown>) => void) => () => void;
      setMenuState: (state: Partial<AppMenuState>) => void;
      onMenuCommand: (callback: (id: string) => void) => () => void;
    };
  }
}

export type ElectronApi = NonNullable<Window['electronAPI']>;
