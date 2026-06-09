const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { fileURLToPath } = require('url');
const { autoUpdater } = require('electron-updater');
const bridge = require('./sidecar_bridge');
const db = require('./database');

let ipcRegistered = false;
let mainWindow = null;
const DOCUMENT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.tif', '.tiff', '.webp']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const PREVIEW_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff']);

function createWindow() {
  console.log('[DEBUG] createWindow: creating BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
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

    if (!app.isPackaged && process.env.STAFFPASS_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }

  console.log('[DEBUG] loadFile index.html...');
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  return mainWindow;
}

function getSenderUrl(event) {
  if (event && event.senderFrame && event.senderFrame.url) return event.senderFrame.url;
  if (event && event.sender && event.sender.getURL) return event.sender.getURL();
  return '';
}

function assertTrustedSender(event) {
  const senderUrl = getSenderUrl(event);
  if (!senderUrl) throw new Error('Blocked IPC request from unknown sender.');

  let parsed;
  try {
    parsed = new URL(senderUrl);
  } catch (_err) {
    throw new Error('Blocked IPC request from invalid sender.');
  }

  if (parsed.protocol !== 'file:') {
    throw new Error('Blocked IPC request from untrusted sender.');
  }

  let senderPath;
  try {
    senderPath = path.normalize(fileURLToPath(parsed));
  } catch (_err) {
    throw new Error('Blocked IPC request from invalid sender.');
  }

  const expectedPath = path.normalize(path.join(__dirname, 'index.html'));
  if (senderPath !== expectedPath) {
    throw new Error('Blocked IPC request from untrusted sender.');
  }
}

function assertAllowedDocumentPath(filePath, allowedExtensions) {
  const normalizedPath = typeof filePath === 'string' ? path.normalize(filePath) : '';
  const extension = path.extname(normalizedPath).toLowerCase();
  const extensions = allowedExtensions || DOCUMENT_EXTENSIONS;

  if (!normalizedPath || !path.isAbsolute(normalizedPath)) {
    throw new Error('Document path must be absolute.');
  }
  if (!extensions.has(extension)) {
    throw new Error('Document type is not supported.');
  }
  if (!fs.existsSync(normalizedPath)) {
    throw new Error('Document file does not exist.');
  }

  return normalizedPath;
}

function getPreviewMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.tiff' || ext === '.tif') return 'image/tiff';
  return 'image/jpeg';
}

function csvEscape(value) {
  const textValue = value == null ? '' : String(value);
  if (/[",\r\n]/.test(textValue)) {
    return `"${textValue.replace(/"/g, '""')}"`;
  }
  return textValue;
}

function recordsToCsv(records) {
  const columns = [
    ['first_name', 'First Name'],
    ['last_name', 'Last Name'],
    ['phone_number', 'Phone Number'],
    ['doc_type', 'Document Type'],
    ['doc_number', 'Document Number'],
    ['expiry_date', 'Expiry Date'],
    ['confidence_score', 'Confidence Score'],
    ['review_status', 'Review Status'],
    ['notes', 'Notes'],
    ['uploaded_at', 'Uploaded At']
  ];
  const rows = [columns.map(([, heading]) => heading)];
  records.forEach((record) => {
    rows.push(columns.map(([key]) => record[key]));
  });
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

function registerIpcHandlers() {
  if (ipcRegistered) return;

  ipcMain.handle('documents:select', async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog({
      title: 'Select documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Documents',
          extensions: ['jpg', 'jpeg', 'png', 'pdf', 'tif', 'tiff', 'webp']
        }
      ]
    });

    if (result.canceled) return [];
    return result.filePaths.filter((filePath) => {
      try {
        assertAllowedDocumentPath(filePath, DOCUMENT_EXTENSIONS);
        return true;
      } catch (_err) {
        return false;
      }
    });
  });

  ipcMain.handle('documents:readAsBase64', async (event, filePath) => {
    assertTrustedSender(event);
    const safePath = assertAllowedDocumentPath(filePath, PREVIEW_IMAGE_EXTENSIONS);
    try {
      const data = await fs.promises.readFile(safePath);
      const mimeType = getPreviewMimeType(safePath);
      return `data:${mimeType};base64,${data.toString('base64')}`;
    } catch (err) {
      console.error(err);
      return null;
    }
  });

  ipcMain.handle('documents:previewPdfPage', async (event, filePath) => {
    assertTrustedSender(event);
    const safePath = assertAllowedDocumentPath(filePath, PDF_EXTENSIONS);
    return bridge.previewPdfPage(safePath);
  });

  ipcMain.handle('ocr:process', async (event, filePath) => {
    assertTrustedSender(event);
    const safePath = assertAllowedDocumentPath(filePath, DOCUMENT_EXTENSIONS);
    return bridge.runOCR(safePath);
  });

  ipcMain.handle('review:save', async (event, payload) => {
    assertTrustedSender(event);
    if (payload && payload.file_path) {
      payload.file_path = assertAllowedDocumentPath(payload.file_path, DOCUMENT_EXTENSIONS);
    }
    return db.saveReviewedDocument(payload);
  });

  ipcMain.handle('records:list', async (event, options) => {
    assertTrustedSender(event);
    return db.listRecords(options);
  });

  ipcMain.handle('records:count', async (event, options) => {
    assertTrustedSender(event);
    return db.countRecords(options);
  });

  ipcMain.handle('records:export', async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showSaveDialog({
      title: 'Export StaffPass records',
      defaultPath: `staffpass-records-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true, rowCount: 0 };
    }

    const targetPath = path.normalize(result.filePath);
    if (path.extname(targetPath).toLowerCase() !== '.csv') {
      throw new Error('Export target must be a CSV file.');
    }

    const records = db.listRecords();
    fs.writeFileSync(targetPath, recordsToCsv(records), 'utf8');
    return { ok: true, canceled: false, rowCount: records.length };
  });

  ipcMain.handle('app:getVersion', (event) => {
    assertTrustedSender(event);
    return app.getVersion();
  });

  ipcMain.handle('release-notes:get', async (event, version) => {
    assertTrustedSender(event);
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
    assertTrustedSender(event);
    const webContents = event.sender;
    return bridge.downloadModel((status) => {
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('ocr:downloadStatus', status);
      }
    });
  });

  ipcMain.on('updater:check', (event) => {
    assertTrustedSender(event);
    autoUpdater.checkForUpdates().catch(() => {});
  });

  ipcMain.on('updater:install', (event) => {
    assertTrustedSender(event);
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
  assertAllowedDocumentPath,
  assertTrustedSender,
  createWindow,
  registerIpcHandlers,
  recordsToCsv,
  setupAutoUpdater,
  startApp
};
