import {
  AcpStatusInfo,
  AgentConversation,
  AgentConversationSummary,
  CustomModelDefinition,
  PurchaseRecord,
  ReferenceImageRecord,
  SavedSceneRecord,
} from '../types/robotics';

export interface AcpPromptPayload {
  action: 'image-to-3d' | 'generate-part' | 'build';
  /** Scene tab the message belongs to; each tab has its own agent session */
  workspaceId?: string;
  targetHeightMm?: number;
  /** Several reference images (front, side, detail…) */
  imageDataUrls?: string[];
  modelName?: string;
  promptText?: string;
  imageName?: string;
  imageFilePath?: string;
  imageDataUrl?: string;
  analyzedFeatures?: unknown;
  /** Attached folders, stored under library/evidence and read by the agent on demand */
  evidenceFolders?: Array<{ id: string; name: string }>;
}

export interface EvidenceFilePayload {
  folderId: string;
  folderName: string;
  /** Path inside the folder, e.g. "photos/front.jpg" */
  relPath: string;
  dataUrl?: string;
  text?: string;
}

/** Checkmarks and enabled state for the native menu bar (electron/app-menu.mjs) */
export interface AppMenuState {
  sidebar: boolean;
  inspector: boolean;
  grid: boolean;
  referenceImages: boolean;
  trackpadMode: string;
  hasSelection: boolean;
  hasParts: boolean;
  /** Open scene tabs, for the Window menu */
  tabs: Array<{ id: string; name: string }>;
  activeTab: string;
  canReopenTab: boolean;
}

export type SteerOutcome = 'injected' | 'promptRequired' | 'unsupported';

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
      savePurchase: (payload: { key: string; record: PurchaseRecord | null }) => Promise<Record<string, PurchaseRecord>>;
      getChat: (id: string) => Promise<AgentConversation | null>;
      saveChat: (conv: AgentConversation) => Promise<AgentConversationSummary[]>;
      deleteChat: (id: string) => Promise<AgentConversationSummary[]>;
      newAcpConversation: (workspaceId?: string) => Promise<AcpStatusInfo>;
      respondToAgent: (payload: { requestId: string; result?: unknown; error?: string }) => Promise<{ ok: boolean }>;
      sendAcpPrompt: (payload: AcpPromptPayload) => Promise<{
        stopReason: string;
        sessionId?: string;
        models: CustomModelDefinition[];
        scenes: SavedSceneRecord[];
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
      listScenes: () => Promise<SavedSceneRecord[]>;
      saveScene: (scenePayload: Record<string, unknown>) => Promise<SavedSceneRecord>;
      deleteScene: (sceneId: string) => Promise<SavedSceneRecord[]>;
      onBackendEvent: (callback: (event: Record<string, unknown>) => void) => () => void;
      setMenuState: (state: Partial<AppMenuState>) => void;
      onMenuCommand: (callback: (id: string) => void) => () => void;
    };
  }
}

export const platformBridge = {
  isElectron(): boolean {
    return Boolean(window.electronAPI?.isElectron);
  },

  async getAcpStatus(workspaceId?: string): Promise<AcpStatusInfo> {
    if (window.electronAPI) return window.electronAPI.getAcpStatus(workspaceId);
    const res = await fetch(`/api/bridge/acp-status${workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : ''}`);
    return res.json();
  },

  async connectAcp(agentCommand?: string): Promise<AcpStatusInfo> {
    if (window.electronAPI) return window.electronAPI.connectAcp(agentCommand);
    const res = await fetch('/api/bridge/acp-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentCommand }),
    });
    return res.json();
  },

  async sendAcpPrompt(payload: AcpPromptPayload): Promise<{
    stopReason: string;
    sessionId?: string;
    models: CustomModelDefinition[];
    scenes: SavedSceneRecord[];
  }> {
    if (window.electronAPI) return window.electronAPI.sendAcpPrompt(payload);
    const res = await fetch('/api/bridge/acp-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(body.error || `Agent error ${res.status}`);
    return body;
  },

  /** Add a message to the run in progress (Claude reads it between steps) */
  async steerAcp(payload: AcpPromptPayload): Promise<SteerOutcome> {
    try {
      if (window.electronAPI) return (await window.electronAPI.steerAcp(payload)).outcome;
      const res = await fetch('/api/bridge/acp-steer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return (await res.json()).outcome ?? 'unsupported';
    } catch {
      return 'unsupported';
    }
  },

  async saveEvidenceFile(payload: EvidenceFilePayload): Promise<void> {
    if (window.electronAPI) {
      await window.electronAPI.saveEvidenceFile(payload);
      return;
    }
    const res = await fetch('/api/bridge/save-evidence-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || `Couldn’t save ${payload.relPath}`);
  },

  async cancelAcp(workspaceId: string): Promise<void> {
    if (window.electronAPI) {
      await window.electronAPI.cancelAcp(workspaceId);
      return;
    }
    await fetch('/api/bridge/acp-cancel', { method: 'POST', body: JSON.stringify({ workspaceId }) });
  },

  async resumeAcp(sessionId: string, workspaceId: string): Promise<AcpStatusInfo> {
    if (window.electronAPI) return window.electronAPI.resumeAcp(sessionId, workspaceId);
    const res = await fetch('/api/bridge/acp-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, workspaceId }),
    });
    return res.json();
  },

  /** A scene tab closed: stop its agent run and end its session */
  async closeAcpWorkspace(workspaceId: string): Promise<void> {
    try {
      if (window.electronAPI) {
        await window.electronAPI.closeAcpWorkspace(workspaceId);
        return;
      }
      await fetch('/api/bridge/acp-close-workspace', { method: 'POST', body: JSON.stringify({ workspaceId }) });
    } catch {
      // the session ends with the agent process anyway
    }
  },

  async listChats(): Promise<AgentConversationSummary[]> {
    if (window.electronAPI) return window.electronAPI.listChats();
    return (await fetch('/api/bridge/chats')).json();
  },

  /** Dated price checks for purchasable parts, keyed by catalog key (library/purchases.json) */
  async listPurchases(): Promise<Record<string, PurchaseRecord>> {
    try {
      if (window.electronAPI) return await window.electronAPI.listPurchases();
      return await (await fetch('/api/bridge/purchases')).json();
    } catch {
      return {};
    }
  },

  /** Records what the user saw on a listing; null removes the check */
  async savePurchase(key: string, record: PurchaseRecord | null): Promise<Record<string, PurchaseRecord>> {
    if (window.electronAPI) return window.electronAPI.savePurchase({ key, record });
    const res = await fetch('/api/bridge/purchase-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, record }),
    });
    return res.json();
  },

  async getChat(id: string): Promise<AgentConversation | null> {
    if (window.electronAPI) return window.electronAPI.getChat(id);
    return (await fetch(`/api/bridge/chat?id=${encodeURIComponent(id)}`)).json();
  },

  async saveChat(conv: AgentConversation): Promise<AgentConversationSummary[]> {
    if (window.electronAPI) return window.electronAPI.saveChat(conv);
    const res = await fetch('/api/bridge/chat-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conv),
    });
    return res.json();
  },

  async deleteChat(id: string): Promise<AgentConversationSummary[]> {
    if (window.electronAPI) return window.electronAPI.deleteChat(id);
    const res = await fetch('/api/bridge/chat-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    return res.json();
  },

  async newAcpConversation(workspaceId: string): Promise<AcpStatusInfo> {
    if (window.electronAPI) return window.electronAPI.newAcpConversation(workspaceId);
    const res = await fetch('/api/bridge/acp-new-conversation', { method: 'POST', body: JSON.stringify({ workspaceId }) });
    return res.json();
  },

  /** Answer a request the agent's CAD tools made (scene ops, snapshot, screenshots) */
  async respondToAgent(payload: { requestId: string; result?: unknown; error?: string }): Promise<void> {
    if (window.electronAPI) {
      await window.electronAPI.respondToAgent(payload);
      return;
    }
    await fetch('/api/bridge/agent-respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async uploadImage(payload: {
    name: string;
    dataUrl: string;
    width?: number;
    height?: number;
  }): Promise<ReferenceImageRecord> {
    if (window.electronAPI) return window.electronAPI.uploadImage(payload);
    const res = await fetch('/api/bridge/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async listImages(): Promise<ReferenceImageRecord[]> {
    if (window.electronAPI) return window.electronAPI.listImages();
    const res = await fetch('/api/bridge/images');
    return res.json();
  },

  async listModels(): Promise<CustomModelDefinition[]> {
    if (window.electronAPI) return window.electronAPI.listModels();
    const res = await fetch('/api/bridge/models');
    return res.json();
  },

  async saveModel(modelDef: CustomModelDefinition): Promise<CustomModelDefinition> {
    if (window.electronAPI) return window.electronAPI.saveModel(modelDef);
    const res = await fetch('/api/bridge/save-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelDef),
    });
    return res.json();
  },

  async deleteModel(modelId: string): Promise<CustomModelDefinition[]> {
    if (window.electronAPI) return window.electronAPI.deleteModel(modelId);
    const res = await fetch('/api/bridge/delete-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    });
    return res.json();
  },

  async listScenes(): Promise<SavedSceneRecord[]> {
    if (window.electronAPI) return window.electronAPI.listScenes();
    const res = await fetch('/api/bridge/scenes');
    return res.json();
  },

  async saveScene(scenePayload: Record<string, unknown>): Promise<SavedSceneRecord> {
    if (window.electronAPI) return window.electronAPI.saveScene(scenePayload);
    const res = await fetch('/api/bridge/save-scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenePayload),
    });
    return res.json();
  },

  async deleteScene(sceneId: string): Promise<SavedSceneRecord[]> {
    if (window.electronAPI) return window.electronAPI.deleteScene(sceneId);
    const res = await fetch('/api/bridge/delete-scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId }),
    });
    return res.json();
  },

  /** Native menu bar (Electron only); the scene in front and the tab host each send their part */
  setMenuState(state: Partial<AppMenuState>): void {
    window.electronAPI?.setMenuState(state);
  },

  onMenuCommand(callback: (id: string) => void): () => void {
    return window.electronAPI?.onMenuCommand(callback) ?? (() => {});
  },

  subscribeEvents(callback: (event: Record<string, unknown>) => void): () => void {
    if (window.electronAPI) {
      return window.electronAPI.onBackendEvent(callback);
    }
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        callback(JSON.parse(e.data));
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  },
};
