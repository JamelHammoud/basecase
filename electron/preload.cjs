const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getAcpStatus: (workspaceId) => ipcRenderer.invoke('acp:status', workspaceId),
  connectAcp: (agentCommand) => ipcRenderer.invoke('acp:connect', agentCommand),
  sendAcpPrompt: (payload) => ipcRenderer.invoke('acp:prompt', payload),
  steerAcp: (payload) => ipcRenderer.invoke('acp:steer', payload),
  cancelAcp: (workspaceId) => ipcRenderer.invoke('acp:cancel', workspaceId),
  resumeAcp: (sessionId, workspaceId) => ipcRenderer.invoke('acp:resume', sessionId, workspaceId),
  closeAcpWorkspace: (workspaceId) => ipcRenderer.invoke('acp:close-workspace', workspaceId),
  listChats: () => ipcRenderer.invoke('chat:list'),
  listPurchases: () => ipcRenderer.invoke('purchases:list'),
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
  saveScene: (scenePayload) => ipcRenderer.invoke('library:save-scene', scenePayload),
  deleteScene: (sceneId) => ipcRenderer.invoke('library:delete-scene', sceneId),
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
