const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  selectDocuments: () => ipcRenderer.invoke('documents:select'),
  processOCR: (filePath) => ipcRenderer.invoke('ocr:process', filePath),
  saveReview: (payload) => ipcRenderer.invoke('review:save', payload),
  listRecords: () => ipcRenderer.invoke('records:list')
});
