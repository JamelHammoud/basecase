const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('basecaseStorage', {
  send: (json) => ipcRenderer.send('storage:migrate', json),
});
