import path from 'node:path';
import { SceneLibrary } from './library/sceneLibrary.mjs';
import { Trainer } from './trainer.mjs';
import { isAiAgent } from './backend/agentProfiles.mjs';
import { AcpAgent } from './backend/acpAgent.mjs';
import { AgentBridge } from './backend/agentBridge.mjs';
import { writeAiReference } from './backend/aiReference.mjs';
import * as conversations from './backend/conversations.mjs';
import { DEFAULT_WORKSPACE } from './backend/constants.mjs';
import { EventHub } from './backend/eventHub.mjs';
import * as evidence from './backend/evidence.mjs';
import { watchLibrary } from './backend/fileWatchers.mjs';
import { ensureDirectories, libraryPaths } from './backend/libraryPaths.mjs';
import * as models from './backend/models.mjs';
import { buildPromptBlocks } from './backend/promptBlocks.mjs';
import * as purchases from './backend/purchases.mjs';
import { ReferenceImages } from './backend/referenceImages.mjs';
import * as uploads from './backend/uploads.mjs';

export { CLAUDE_AGENT_COMMAND, DEFAULT_WORKSPACE, LEGACY_AGENT_COMMAND } from './backend/constants.mjs';

export class BasecaseBackendService {
  constructor(workspaceRoot, { secrets } = {}) {
    this.workspaceRoot = workspaceRoot;
    this.paths = libraryPaths(workspaceRoot);
    Object.assign(this, this.paths);
    this.offline = process.env.STUDIO_AGENT_OFFLINE === '1';

    this.ensureDirectories();

    this.events = new EventHub();
    this.references = new ReferenceImages(this.referencesDir);
    this.bridge = new AgentBridge({
      events: this.events,
      onError: (message) => {
        this.agent.error = message;
      },
    });
    this.agent = new AcpAgent({
      paths: this.paths,
      workspaceRoot,
      offline: this.offline,
      bridge: this.bridge,
      emit: (event) => this.emitEvent(event),
      libraryState: () => ({ models: this.listModels(), scenes: this.listScenes() }),
      promptBlocks: (payload) => this.buildPromptBlocks(payload),
      secrets,
    });
    this.bridgeReady = this.startAgentBridge();

    this.setupFileWatchers();

    this.trainer = new Trainer(this.libraryDir, (event) => this.emitEvent(event));
  }

  trainStatus() {
    return this.trainer.status();
  }

  trainStart(payload) {
    return this.trainer.start(payload);
  }

  trainStop(workspaceId) {
    return this.trainer.stop(workspaceId);
  }

  getPolicy(id) {
    return this.trainer.getPolicy(id);
  }

  deletePolicy(id) {
    return this.trainer.deletePolicy(id);
  }

  ensureDirectories() {
    ensureDirectories(this.paths);
  }

  setupFileWatchers() {
    watchLibrary({
      modelsDir: this.modelsDir,
      scenesDir: this.scenesDir,
      onModelsChanged: () => this.emitEvent({ type: 'library-models-changed', models: this.listModels() }),
      onScenesChanged: () => {
        const scenes = this.scenes.changedList();

        if (scenes) this.emitEvent({ type: 'library-scenes-changed', scenes });
      },
    });
  }

  onEvent(listener) {
    return this.events.on(listener);
  }

  emitEvent(event) {
    this.events.emit(event);
  }

  startAgentBridge() {
    return this.bridge.start();
  }

  requestRenderer(kind, payload, timeoutMs = 60000, workspaceId) {
    return this.bridge.requestRenderer(kind, payload, timeoutMs, workspaceId);
  }

  resolveAgentRequest(response) {
    return this.bridge.resolveRequest(response);
  }

  isAiAgent() {
    return isAiAgent(this.agent.kind());
  }

  connectAcpAgent(customCommand) {
    return this.agent.connect(customCommand);
  }

  authenticateAcpAgent(methodId) {
    return this.agent.authenticate(methodId);
  }

  setAgentApiKey(key) {
    return this.agent.setApiKey(key);
  }

  sessionParams(workspaceId = DEFAULT_WORKSPACE) {
    return this.agent.sessionParams(workspaceId);
  }

  workspaceOf(sessionId) {
    return this.agent.workspaceOf(sessionId);
  }

  bindSession(workspaceId, sessionId) {
    this.agent.bindSession(workspaceId, sessionId);
  }

  createAcpSession(workspaceId = DEFAULT_WORKSPACE) {
    return this.agent.createSession(workspaceId);
  }

  ensureSession(workspaceId = DEFAULT_WORKSPACE) {
    return this.agent.ensureSession(workspaceId);
  }

  resumeAcpConversation(sessionId, workspaceId = DEFAULT_WORKSPACE) {
    return this.agent.resume(sessionId, workspaceId);
  }

  closeSessionQuietly(sessionId) {
    this.agent.closeSessionQuietly(sessionId);
  }

  closeWorkspace(workspaceId) {
    return this.agent.closeWorkspace(workspaceId);
  }

  newAcpConversation(workspaceId = DEFAULT_WORKSPACE) {
    return this.agent.newConversation(workspaceId);
  }

  cancelAcpPrompt(workspaceId = DEFAULT_WORKSPACE) {
    return this.agent.cancel(workspaceId);
  }

  disconnectAcpAgent() {
    this.agent.disconnect();
  }

  getAcpStatus(workspaceId = DEFAULT_WORKSPACE) {
    return this.agent.status(workspaceId);
  }

  sendAcpPrompt(payload) {
    return this.agent.sendPrompt(payload);
  }

  steerAcpPrompt(payload) {
    return this.agent.steer(payload);
  }

  buildPromptBlocks(payload) {
    return buildPromptBlocks(payload, {
      isAiAgent: this.isAiAgent(),
      saveReferenceImage: (mime, base64) => this.saveReferenceImage(mime, base64),
      describeEvidenceFolder: (folderId) => this.describeEvidenceFolder(folderId),
    });
  }

  saveReferenceImage(mime, base64) {
    return this.references.save(mime, base64);
  }

  listConversations() {
    this.ensureDirectories();

    return conversations.listConversations(this.conversationsDir);
  }

  getConversation(id) {
    return conversations.getConversation(this.conversationsDir, id);
  }

  saveConversation(conv) {
    this.ensureDirectories();
    conversations.saveConversation(this.conversationsDir, conv);

    return this.listConversations();
  }

  deleteConversation(id) {
    conversations.deleteConversation(this.conversationsDir, id);

    return this.listConversations();
  }

  listPurchases() {
    return purchases.listPurchases(this.libraryDir);
  }

  savePurchase(payload) {
    return purchases.savePurchase(this.libraryDir, payload);
  }

  saveEvidenceFile(payload) {
    return evidence.saveEvidenceFile(this.evidenceDir, payload);
  }

  listEvidenceFiles(folderId) {
    return evidence.listEvidenceFiles(this.evidenceDir, folderId);
  }

  describeEvidenceFolder(folderId) {
    return evidence.describeEvidenceFolder(this.evidenceDir, folderId);
  }

  saveUploadedImage(payload) {
    this.ensureDirectories();

    return uploads.saveUploadedImage(this.uploadsDir, payload);
  }

  listUploadedImages() {
    this.ensureDirectories();

    return uploads.listUploadedImages(this.uploadsDir);
  }

  listModels() {
    this.ensureDirectories();

    return models.listModels(this.modelsDir);
  }

  saveModel(modelDef) {
    this.ensureDirectories();

    return models.saveModel(this.modelsDir, modelDef);
  }

  deleteModel(modelId) {
    models.deleteModel(this.modelsDir, modelId);

    return this.listModels();
  }

  get scenes() {
    this.ensureDirectories();
    this.sceneLibrary ??= new SceneLibrary({
      scenesDir: this.scenesDir,
      cacheFile: path.join(this.libraryDir, '.scene-summaries.json'),
    });

    return this.sceneLibrary;
  }

  listScenes() {
    return this.scenes.list();
  }

  getScene(id) {
    return this.scenes.get(id);
  }

  saveScenePreview(payload) {
    const summary = this.scenes.savePreview(payload);

    if (summary && payload.current) this.writeAiReference({ previewDataUrl: payload.previewDataUrl });

    return summary;
  }

  saveScene(scenePayload) {
    const summary = this.scenes.save(scenePayload);

    if (summary) this.writeAiReference(scenePayload);

    return summary;
  }

  writeAiReference(scenePayload) {
    writeAiReference(this.aiRefDir, scenePayload);
  }

  deleteScene(sceneId) {
    return this.scenes.delete(sceneId);
  }
}
