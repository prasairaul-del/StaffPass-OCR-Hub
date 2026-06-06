const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const bridge = require('./sidecar_bridge');
const db = require('./database');

let ipcRegistered = false;
let mainWindow = null;

function createWindow() {
  console.log('[DEBUG] createWindow: creating BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (mainWindow.webContents) {
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error(`[DEBUG] Page failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}`);
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('[DEBUG] Render process gone:', details);
    });

    mainWindow.webContents.on('unresponsive', () => {
      console.warn('[DEBUG] Window became unresponsive');
    });

    // Listen to renderer console logs
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[RENDERER CONSOLE] [Level ${level}] ${message} (at ${sourceId}:${line})`);
    });

    // Open the DevTools to inspect renderer console
    mainWindow.webContents.openDevTools();
  }

  console.log('[DEBUG] loadFile index.html...');
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

  ipcMain.handle('documents:readAsBase64', async (event, filePath) => {
    const fs = require('fs');
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.bmp') mimeType = 'image/bmp';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.tiff' || ext === '.tif') mimeType = 'image/tiff';
      return `data:${mimeType};base64,${data.toString('base64')}`;
    } catch (err) {
      console.error(err);
      return null;
    }
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

  ipcMain.handle('ocr:downloadModel', async (event) => {
    const webContents = event.sender;
    return bridge.downloadModel((status) => {
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('ocr:downloadStatus', status);
      }
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
  console.log('[DEBUG] startApp: starting...');
  const dbPath = getRuntimeDatabasePath();
  console.log('[DEBUG] startApp: database path is', dbPath);
  db.init(dbPath);
  console.log('[DEBUG] startApp: database init done');
  registerIpcHandlers();
  console.log('[DEBUG] startApp: ipc handlers registered');
  createWindow();
  console.log('[DEBUG] startApp: window created');
  setupAutoUpdater();
  console.log('[DEBUG] startApp: auto updater setup done');

  // Check for updates 3 seconds after startup
  setTimeout(() => {
    console.log('[DEBUG] startApp: triggering autoUpdater check');
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[DEBUG] autoUpdater error:', err);
    });
  }, 3000);
}

if (require.main === module || !module.parent) {
  console.log('[DEBUG] main.js execution started at root level');
  
  let gotTheLock;
  try {
    gotTheLock = app.requestSingleInstanceLock();
    console.log('[DEBUG] gotSingleInstanceLock result:', gotTheLock);
  } catch (err) {
    console.error('[DEBUG] requestSingleInstanceLock failed:', err);
  }

  if (!gotTheLock) {
    console.log('[DEBUG] Single instance lock NOT obtained, quitting...');
    app.quit();
  } else {
    app.on('second-instance', () => {
      console.log('[DEBUG] Second instance detected, restoring main window');
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    console.log('[DEBUG] Registering app whenReady handler');
    app.whenReady().then(() => {
      console.log('[DEBUG] app whenReady fired');
      startApp();
    }).catch(err => {
      console.error('[DEBUG] app.whenReady rejected:', err);
    });

    app.on('window-all-closed', () => {
      console.log('[DEBUG] window-all-closed event fired');
      if (process.platform !== 'darwin') app.quit();
    });

    app.on('will-quit', () => {
      console.log('[DEBUG] will-quit event fired');
      bridge.stop();
      db.close();
    });
  }

  process.on('uncaughtException', (error) => {
    console.error('[DEBUG] Unhandled Exception in main process:', error);
  });
  
  process.on('unhandledRejection', (reason) => {
    console.error('[DEBUG] Unhandled Rejection in main process:', reason);
  });
}

module.exports = {
  createWindow,
  registerIpcHandlers,
  setupAutoUpdater,
  startApp
};

