const { contextBridge, ipcRenderer } = require('electron');

function createSafeListener(channel, callback) {
  const subscription = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, subscription);
  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
}

contextBridge.exposeInMainWorld('api', {
  selectDocuments: () => ipcRenderer.invoke('documents:select'),
  readAsBase64: (filePath) => ipcRenderer.invoke('documents:readAsBase64', filePath),
  previewPdfPage: (filePath) => ipcRenderer.invoke('documents:previewPdfPage', filePath),
  processOCR: (filePath) => ipcRenderer.invoke('ocr:process', filePath),
  saveReview: (payload) => ipcRenderer.invoke('review:save', payload),
  listRecords: () => ipcRenderer.invoke('records:list'),
  exportRecords: (options) => ipcRenderer.invoke('records:export', options),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  fetchReleaseNotes: (version) => ipcRenderer.invoke('release-notes:get', version),

  // Auto-updater APIs
  checkForUpdates: () => ipcRenderer.send('updater:check'),
  installUpdate: () => ipcRenderer.send('updater:install'),
  onUpdateStatus: (callback) => createSafeListener('updater:status', callback),

  // Model download APIs
  downloadModel: () => ipcRenderer.invoke('ocr:downloadModel'),
  onDownloadStatus: (callback) => createSafeListener('ocr:downloadStatus', callback)
});
