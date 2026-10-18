import type {
  AcpStatusInfo,
  AgentConversation,
  AgentConversationSummary,
  CustomModelDefinition,
  PurchaseRecord,
  ReferenceImageRecord,
  SavedSceneRecord,
  SavedSceneSummary,
} from '../types/robotics';
import { electron, get, post, postOrThrow, query, quietly } from './platform/transport';
import type {
  AcpPromptPayload,
  AppMenuState,
  EvidenceFilePayload,
  ScenePreviewPayload,
  SteerOutcome,
  TrainerStatus,
  TrainStartPayload,
} from './platform/types';

export type * from './platform/types';

interface PromptResult {
  stopReason: string;
  sessionId?: string;
  models: CustomModelDefinition[];
  scenes: SavedSceneSummary[];
}

interface ImageUpload {
  name: string;
  dataUrl: string;
  width?: number;
  height?: number;
}

const acpBridge = {
  isElectron: (): boolean => Boolean(electron()?.isElectron),

  getAcpStatus: (workspaceId?: string): Promise<AcpStatusInfo> =>
    electron()?.getAcpStatus(workspaceId) ?? get(`/acp-status${workspaceId ? query('workspace', workspaceId) : ''}`),

  connectAcp: (agentCommand?: string): Promise<AcpStatusInfo> =>
    electron()?.connectAcp(agentCommand) ?? post('/acp-connect', { agentCommand }),

  sendAcpPrompt: (payload: AcpPromptPayload): Promise<PromptResult> =>
    electron()?.sendAcpPrompt(payload) ??
    postOrThrow('/acp-prompt', payload, (body, res) =>
      !res.ok || body.error ? String(body.error || `Agent error ${res.status}`) : null,
    ),

  steerAcp: (payload: AcpPromptPayload): Promise<SteerOutcome> =>
    quietly(async () => {
      const api = electron();

      if (api) return (await api.steerAcp(payload)).outcome;

      return (await post<{ outcome?: SteerOutcome }>('/acp-steer', payload)).outcome ?? 'unsupported';
    }, 'unsupported'),

  async cancelAcp(workspaceId: string): Promise<void> {
    await (electron()?.cancelAcp(workspaceId) ?? post('/acp-cancel', { workspaceId }, { json: false }));
  },

  resumeAcp: (sessionId: string, workspaceId: string): Promise<AcpStatusInfo> =>
    electron()?.resumeAcp(sessionId, workspaceId) ?? post('/acp-resume', { sessionId, workspaceId }),

  closeAcpWorkspace: (workspaceId: string): Promise<void> =>
    quietly(async () => {
      await (electron()?.closeAcpWorkspace(workspaceId) ??
        post('/acp-close-workspace', { workspaceId }, { json: false }));
    }, undefined),

  newAcpConversation: (workspaceId: string): Promise<AcpStatusInfo> =>
    electron()?.newAcpConversation(workspaceId) ?? post('/acp-new-conversation', { workspaceId }, { json: false }),

  async respondToAgent(payload: { requestId: string; result?: unknown; error?: string }): Promise<void> {
    await (electron()?.respondToAgent(payload) ?? post('/agent-respond', payload));
  },
};

const libraryBridge = {
  async saveEvidenceFile(payload: EvidenceFilePayload): Promise<void> {
    const api = electron();

    if (api) {
      await api.saveEvidenceFile(payload);

      return;
    }

    await postOrThrow('/save-evidence-file', payload, (body, res) =>
      res.ok ? null : String(body.error || `Couldn’t save ${payload.relPath}`),
    );
  },

  listChats: (): Promise<AgentConversationSummary[]> => electron()?.listChats() ?? get('/chats'),
  getChat: (id: string): Promise<AgentConversation | null> => electron()?.getChat(id) ?? get(`/chat${query('id', id)}`),
  saveChat: (conv: AgentConversation): Promise<AgentConversationSummary[]> =>
    electron()?.saveChat(conv) ?? post('/chat-save', conv),
  deleteChat: (id: string): Promise<AgentConversationSummary[]> =>
    electron()?.deleteChat(id) ?? post('/chat-delete', { id }),

  listPurchases: (): Promise<Record<string, PurchaseRecord>> =>
    quietly(async () => (await electron()?.listPurchases()) ?? get('/purchases'), {}),
  savePurchase: (key: string, record: PurchaseRecord | null): Promise<Record<string, PurchaseRecord>> =>
    electron()?.savePurchase({ key, record }) ?? post('/purchase-save', { key, record }),

  uploadImage: (payload: ImageUpload): Promise<ReferenceImageRecord> =>
    electron()?.uploadImage(payload) ?? post('/upload-image', payload),
  listImages: (): Promise<ReferenceImageRecord[]> => electron()?.listImages() ?? get('/images'),

  listModels: (): Promise<CustomModelDefinition[]> => electron()?.listModels() ?? get('/models'),
  saveModel: (model: CustomModelDefinition): Promise<CustomModelDefinition> =>
    electron()?.saveModel(model) ?? post('/save-model', model),
  deleteModel: (modelId: string): Promise<CustomModelDefinition[]> =>
    electron()?.deleteModel(modelId) ?? post('/delete-model', { modelId }),

  listScenes: (): Promise<SavedSceneSummary[]> => electron()?.listScenes() ?? get('/scenes'),
  getScene: (sceneId: string): Promise<SavedSceneRecord | null> =>
    electron()?.getScene(sceneId) ?? get(`/scene${query('id', sceneId)}`),
  saveScenePreview: (payload: ScenePreviewPayload): Promise<SavedSceneSummary | null> =>
    electron()?.saveScenePreview(payload) ?? post('/save-scene-preview', payload),
  saveScene: (scenePayload: Record<string, unknown>): Promise<SavedSceneSummary> =>
    electron()?.saveScene(scenePayload) ?? post('/save-scene', scenePayload),
  deleteScene: (sceneId: string): Promise<SavedSceneSummary[]> =>
    electron()?.deleteScene(sceneId) ?? post('/delete-scene', { sceneId }),
};

const trainingBridge = {
  trainStatus: (): Promise<TrainerStatus> => electron()?.trainStatus() ?? get('/train-status'),
  trainStart: (payload: TrainStartPayload): Promise<{ jobId: string }> =>
    electron()?.trainStart(payload) ??
    postOrThrow('/train-start', payload, (body, res) =>
      res.ok ? null : String(body.error ?? 'Training didn’t start.').replace(/^Error:\s*/, ''),
    ),
  trainStop: (workspaceId: string): Promise<{ stopping: boolean }> =>
    electron()?.trainStop(workspaceId) ?? post('/train-stop', { workspaceId }),
  getPolicy: (id: string): Promise<unknown> => electron()?.getPolicy(id) ?? get(`/policy${query('id', id)}`),
  deletePolicy: (id: string): Promise<boolean> => electron()?.deletePolicy(id) ?? post('/policy-delete', { id }),
};

const shellBridge = {
  setMenuState(state: Partial<AppMenuState>): void {
    electron()?.setMenuState(state);
  },

  onMenuCommand: (callback: (id: string) => void): (() => void) => electron()?.onMenuCommand(callback) ?? (() => {}),

  subscribeEvents(callback: (event: Record<string, unknown>) => void): () => void {
    const api = electron();

    if (api) {
      return api.onBackendEvent(callback);
    }

    const events = new EventSource('/api/events');

    events.onmessage = (e) => quietly(async () => callback(JSON.parse(e.data)), undefined);

    return () => events.close();
  },
};

export const platformBridge = { ...acpBridge, ...libraryBridge, ...trainingBridge, ...shellBridge };
