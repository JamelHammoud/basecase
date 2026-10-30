const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  isFullScreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  onFullScreenChange: (callback) => {
    const handler = (_event, value) => callback(value);

    ipcRenderer.on('window:fullscreen', handler);

    return () => ipcRenderer.removeListener('window:fullscreen', handler);
  },
  getAcpStatus: (workspaceId) => ipcRenderer.invoke('acp:status', workspaceId),
  connectAcp: (agentCommand) => ipcRenderer.invoke('acp:connect', agentCommand),
  authenticateAcp: (methodId) => ipcRenderer.invoke('acp:authenticate', methodId),
  setAgentApiKey: (key) => ipcRenderer.invoke('acp:set-api-key', key),
  sendAcpPrompt: (payload) => ipcRenderer.invoke('acp:prompt', payload),
  steerAcp: (payload) => ipcRenderer.invoke('acp:steer', payload),
  cancelAcp: (workspaceId) => ipcRenderer.invoke('acp:cancel', workspaceId),
  resumeAcp: (sessionId, workspaceId) => ipcRenderer.invoke('acp:resume', sessionId, workspaceId),
  closeAcpWorkspace: (workspaceId) => ipcRenderer.invoke('acp:close-workspace', workspaceId),
  liveAcpRuns: (workspaceId) => ipcRenderer.invoke('acp:live-runs', workspaceId),
  forgetAcpRun: (workspaceId) => ipcRenderer.invoke('acp:forget-run', workspaceId),
  listChats: () => ipcRenderer.invoke('chat:list'),
  listPurchases: () => ipcRenderer.invoke('purchases:list'),
  trainStatus: () => ipcRenderer.invoke('train:status'),
  trainStart: (payload) => ipcRenderer.invoke('train:start', payload),
  trainStop: (workspaceId) => ipcRenderer.invoke('train:stop', workspaceId),
  simreadyStatus: () => ipcRenderer.invoke('simready:status'),
  simreadyFetch: (payload) => ipcRenderer.invoke('simready:fetch', payload),
  simreadyFile: (payload) => ipcRenderer.invoke('simready:file', payload),
  getPolicy: (id) => ipcRenderer.invoke('policy:get', id),
  deletePolicy: (id) => ipcRenderer.invoke('policy:delete', id),
  savePurchase: (payload) => ipcRenderer.invoke('purchases:save', payload),
  getChat: (id) => ipcRenderer.invoke('chat:get', id),
  saveChat: (conv) => ipcRenderer.invoke('chat:save', conv),
  deleteChat: (id) => ipcRenderer.invoke('chat:delete', id),
  newAcpConversation: (workspaceId) => ipcRenderer.invoke('acp:new-conversation', workspaceId),
  respondToAgent: (payload) => ipcRenderer.invoke('agent:respond', payload),
  uploadImage: (payload) => ipcRenderer.invoke('library:upload-image', payload),
  listImages: () => ipcRenderer.invoke('library:list-images'),
  saveEvidenceFile: (payload) => ipcRenderer.invoke('library:save-evidence-file', payload),
  listModels: () => ipcRenderer.invoke('library:list-models'),
  saveModel: (modelDef) => ipcRenderer.invoke('library:save-model', modelDef),
  deleteModel: (modelId) => ipcRenderer.invoke('library:delete-model', modelId),
  listScenes: () => ipcRenderer.invoke('library:list-scenes'),
  getScene: (sceneId) => ipcRenderer.invoke('library:get-scene', sceneId),
  saveScenePreview: (payload) => ipcRenderer.invoke('library:save-scene-preview', payload),
  saveScene: (scenePayload) => ipcRenderer.invoke('library:save-scene', scenePayload),
  saveSceneJson: (json) => ipcRenderer.invoke('library:save-scene-json', json),
  deleteScene: (sceneId) => ipcRenderer.invoke('library:delete-scene', sceneId),
  saveGuide: (payload) => ipcRenderer.invoke('guide:save', payload),
  openGuide: (id) => ipcRenderer.invoke('guide:open', id),
  revealGuide: (id) => ipcRenderer.invoke('guide:reveal', id),
  guideExists: (id) => ipcRenderer.invoke('guide:exists', id),
  guideHtml: (id) => ipcRenderer.invoke('guide:html', id),
  shareFile: (payload) => ipcRenderer.invoke('share:file', payload),
  printCall: (channel, payload) =>
    String(channel).startsWith('print:')
      ? ipcRenderer.invoke(channel, payload)
      : Promise.reject(new Error('Unknown print call')),
  setMenuState: (state) => ipcRenderer.send('menu:state', state),
  onMenuCommand: (callback) => {
    const handler = (_event, id) => callback(id);

    ipcRenderer.on('menu:command', handler);

    return () => ipcRenderer.removeListener('menu:command', handler);
  },
  onBackendEvent: (callback) => {
    const handler = (_event, data) => callback(data);

    ipcRenderer.on('backend:event', handler);

    return () => ipcRenderer.removeListener('backend:event', handler);
  },
});
