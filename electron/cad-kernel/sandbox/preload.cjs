const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kernelHost', {
  onJob: (listener) => ipcRenderer.on('kernel:job', (_event, job) => listener(job)),
  ready: () => ipcRenderer.send('kernel:ready'),
  result: (id, bytes) => ipcRenderer.send('kernel:result', id, bytes),
  failed: (reason) => ipcRenderer.send('kernel:failed', String(reason)),
});
