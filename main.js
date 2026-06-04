const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const bridge = require('./sidecar_bridge');
const db = require('./database');

let ipcRegistered = false;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  return mainWindow;
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

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('release-notes:get', async (event, version) => {
    const owner = 'prasairaul-del';
    const repo = 'StaffPass-OCR-Hub';
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/v${version}`;
    return new Promise((resolve) => {
      https.get(url, { headers: { 'User-Agent': 'StaffPass-OCR-Hub' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            resolve({ body: release.body || '', name: release.name || '' });
          } catch (_err) {
            resolve({ body: '', name: '' });
          }
        });
      }).on('error', () => {
        resolve({ body: '', name: '' });
      });
    });
  });

  ipcMain.on('updater:check', () => {
    autoUpdater.checkForUpdates().catch(() => {});
  });

  ipcMain.on('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcRegistered = true;
}

function getRuntimeDatabasePath() {
  return path.join(app.getPath('userData'), 'staffpass.db');
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater:status', { state: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater:status', {
        state: 'available',
        version: info.version
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater:status', { state: 'not-available' });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater:status', {
        state: 'downloading',
        percent: Math.round(progress.percent)
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater:status', {
        state: 'downloaded',
        version: info.version
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('updater:status', {
        state: 'error',
        message: err.message
      });
    }
  });
}

function startApp() {
  db.init(getRuntimeDatabasePath());
  registerIpcHandlers();
  createWindow();
  setupAutoUpdater();

  // Check for updates 3 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);
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
  setupAutoUpdater,
  startApp
};
