const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const bridge = require('./sidecar_bridge');
const db = require('./database');

let ipcRegistered = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

function registerIpcHandlers() {
  if (ipcRegistered) return;

  ipcMain.handle('documents:select', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Documents',
          extensions: ['jpg', 'jpeg', 'png', 'pdf']
        }
      ]
    });

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('ocr:process', async (event, filePath) => {
    return bridge.runOCR(filePath);
  });

  ipcMain.handle('review:save', async (event, payload) => {
    return db.saveReviewedDocument(payload);
  });

  ipcMain.handle('records:list', async () => {
    return db.listRecords();
  });

  ipcRegistered = true;
}

function getRuntimeDatabasePath() {
  return path.join(app.getPath('userData'), 'staffpass.db');
}

function startApp() {
  db.init(getRuntimeDatabasePath());
  registerIpcHandlers();
  createWindow();
}

if (require.main === module) {
  app.whenReady().then(startApp);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    bridge.stop();
    db.close();
  });

  process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception in main process:', error);
  });
}

module.exports = {
  createWindow,
  registerIpcHandlers,
  startApp
};
