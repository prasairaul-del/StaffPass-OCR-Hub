const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

function loadModuleWithStubs(modulePath, stubs) {
  const resolvedPath = require.resolve(modulePath);
  delete require.cache[resolvedPath];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

describe('Electron app wiring', () => {
  it('keeps the package configuration pointed at main.js', () => {
    const pkg = require('../package.json');
    assert.strictEqual(pkg.main, 'main.js');
    assert.ok(pkg.devDependencies.electron);
  });

  it('creates a sandboxed window without forcing DevTools open', async () => {
    let createdWindowOptions;
    let openDevToolsCalls = 0;

    const main = loadModuleWithStubs('../main', {
      electron: {
        app: {
          getPath: () => path.join(os.tmpdir(), 'staffpass-electron-tests'),
          on: () => {},
          quit: () => {},
          whenReady: () => Promise.resolve()
        },
        BrowserWindow: function BrowserWindow(options) {
          createdWindowOptions = options;
          this.webContents = {
            on: () => {},
            openDevTools: () => {
              openDevToolsCalls += 1;
            }
          };
          this.loadFile = () => {};
        },
        dialog: {
          showOpenDialog: async () => ({ canceled: true, filePaths: [] })
        },
        ipcMain: {
          handle: () => {},
          on: () => {}
        }
      },
      'electron-updater': {
        autoUpdater: {
          autoDownload: false,
          autoInstallOnAppQuit: false,
          on: () => {},
          checkForUpdates: async () => null,
          quitAndInstall: () => {}
        }
      },
      './database': {
        init: () => {},
        close: () => {},
        saveReviewedDocument: () => ({ ok: true }),
        listRecords: () => []
      },
      './sidecar_bridge': {
        runOCR: async () => ({ ok: true, degraded: false, data: {} }),
        downloadModel: () => {},
        stop: () => {}
      }
    });

    main.createWindow();

    assert.strictEqual(createdWindowOptions.webPreferences.contextIsolation, true);
    assert.strictEqual(createdWindowOptions.webPreferences.nodeIntegration, false);
    assert.strictEqual(createdWindowOptions.webPreferences.sandbox, true);
    assert.strictEqual(openDevToolsCalls, 0);
  });

  it('registers the planned IPC handlers, export route, and file validation', async () => {
    const registeredHandlers = {};
    let dialogOptions;
    let bridgeFilePath;
    let previewFilePath;
    let createdWindowOptions;
    let loadedFilePath;
    const bridgeCalls = [];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staffpass-electron-test-'));
    const trustedSenderUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
    const jpgPath = path.join(tempDir, 'passport.jpg');
    const pdfPath = path.join(tempDir, 'passport.pdf');
    const txtPath = path.join(tempDir, 'passport.txt');
    const csvPath = path.join(tempDir, 'records.csv');
    fs.writeFileSync(jpgPath, 'fake image data');
    fs.writeFileSync(pdfPath, '%PDF-1.4\n%fake pdf');
    fs.writeFileSync(txtPath, 'fake text data');

    try {
      const main = loadModuleWithStubs('../main', {
        electron: {
          app: {
            getPath: () => path.join(os.tmpdir(), 'staffpass-electron-tests'),
            on: () => {},
            quit: () => {},
            whenReady: () => Promise.resolve()
          },
          BrowserWindow: function BrowserWindow(options) {
            createdWindowOptions = options;
            this.webContents = {
              on: () => {},
              openDevTools: () => {}
            };
            this.loadFile = (filePath) => {
              loadedFilePath = filePath;
            };
          },
          dialog: {
            showOpenDialog: async (options) => {
              dialogOptions = options;
              return { canceled: false, filePaths: [jpgPath] };
            },
            showSaveDialog: async (options) => {
              dialogOptions = options;
              return { canceled: false, filePath: csvPath };
            }
          },
          ipcMain: {
            handle: (channel, handler) => {
              registeredHandlers[channel] = handler;
            },
            on: () => {}
          }
        },
        'electron-updater': {
          autoUpdater: {
            autoDownload: false,
            autoInstallOnAppQuit: false,
            on: () => {},
            checkForUpdates: async () => null,
            quitAndInstall: () => {}
          }
        },
        './database': {
          init: () => {},
          close: () => {},
          saveReviewedDocument: (payload) => {
            return { ok: true, payload };
          },
          listRecords: () => {
            return [{ id: 1 }];
          },
          countRecords: () => {
            return 1;
          }
        },
        './sidecar_bridge': {
          runOCR: async (filePath) => {
            bridgeFilePath = filePath;
            bridgeCalls.push(filePath);
            return {
              ok: true,
              degraded: false,
              engine: 'mock',
              warnings: [],
              data: { first_name: 'JOHN', file_path: filePath }
            };
          },
          previewPdfPage: async (filePath) => {
            previewFilePath = filePath;
            return {
              ok: true,
              mimeType: 'image/png',
              data: 'ZmFrZS1wbmctZGF0YQ==',
              width: 320,
              height: 180,
              warnings: []
            };
          },
          downloadModel: () => {},
          stop: () => {}
        }
      });

      main.registerIpcHandlers();
      const window = main.createWindow();
      assert.ok(window);

      assert.strictEqual(path.basename(loadedFilePath), 'index.html');
      assert.strictEqual(createdWindowOptions.width, 1200);
      assert.strictEqual(createdWindowOptions.height, 800);
      assert.match(createdWindowOptions.webPreferences.preload, /preload\.js$/);
      assert.strictEqual(createdWindowOptions.webPreferences.contextIsolation, true);
      assert.strictEqual(createdWindowOptions.webPreferences.nodeIntegration, false);
      assert.strictEqual(createdWindowOptions.webPreferences.sandbox, true);

      assert.deepStrictEqual(
        Object.keys(registeredHandlers).sort(),
        ['app:getVersion', 'documents:previewPdfPage', 'documents:readAsBase64', 'documents:select', 'ocr:downloadModel', 'ocr:process', 'records:count', 'records:export', 'records:list', 'release-notes:get', 'review:save']
      );

      const senderEvent = { senderFrame: { url: trustedSenderUrl } };

      const selectedFiles = await registeredHandlers['documents:select'](senderEvent);
      assert.deepStrictEqual(selectedFiles, [jpgPath]);
      assert.deepStrictEqual(dialogOptions.properties, ['openFile', 'multiSelections']);
      assert.deepStrictEqual(dialogOptions.filters, [
        { name: 'Documents', extensions: ['jpg', 'jpeg', 'png', 'pdf', 'tif', 'tiff', 'webp'] }
      ]);

      const ocrResult = await registeredHandlers['ocr:process'](senderEvent, jpgPath);
      assert.strictEqual(bridgeFilePath, jpgPath);
      assert.strictEqual(ocrResult.ok, true);
      assert.strictEqual(ocrResult.degraded, false);
      assert.strictEqual(ocrResult.engine, 'mock');
      assert.strictEqual(ocrResult.data.first_name, 'JOHN');

      const previewResult = await registeredHandlers['documents:previewPdfPage'](senderEvent, pdfPath);
      assert.strictEqual(previewFilePath, pdfPath);
      assert.deepStrictEqual(previewResult, {
        ok: true,
        mimeType: 'image/png',
        data: 'ZmFrZS1wbmctZGF0YQ==',
        width: 320,
        height: 180,
        warnings: []
      });

      await assert.rejects(
        () => registeredHandlers['documents:previewPdfPage'](senderEvent, txtPath),
        /document type is not supported|invalid|unsupported|extension/i
      );

      await assert.rejects(
        () => registeredHandlers['ocr:process'](senderEvent, txtPath),
        /document type is not supported|invalid|unsupported|extension/i
      );
      assert.deepStrictEqual(bridgeCalls, [jpgPath]);

      const reviewResult = await registeredHandlers['review:save'](senderEvent, { file_path: jpgPath });
      assert.strictEqual(reviewResult.ok, true);

      const recordResult = await registeredHandlers['records:list'](senderEvent);
      assert.deepStrictEqual(recordResult, [{ id: 1 }]);

      const exportResult = await registeredHandlers['records:export'](senderEvent);
      assert.strictEqual(exportResult.ok, true);
      assert.strictEqual(exportResult.canceled, false);
      assert.strictEqual(exportResult.rowCount, 1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('exposes the explicit preload APIs on the context bridge', async () => {
    const invokeCalls = [];
    const exposed = {};

    loadModuleWithStubs('../preload', {
      electron: {
        contextBridge: {
          exposeInMainWorld: (key, value) => {
            exposed[key] = value;
          }
        },
        ipcRenderer: {
          send: () => {},
          invoke: async (channel, payload) => {
            invokeCalls.push([channel, payload]);
            return { channel, payload };
          },
          on: () => {}
        }
      }
    });

    assert.ok(exposed.api);
    assert.deepStrictEqual(
      Object.keys(exposed.api).sort(),
      ['checkForUpdates', 'countRecords', 'downloadModel', 'exportRecords', 'fetchReleaseNotes', 'getVersion', 'installUpdate', 'listRecords', 'onDownloadStatus', 'onUpdateStatus', 'previewPdfPage', 'processOCR', 'readAsBase64', 'saveReview', 'selectDocuments']
    );

    await exposed.api.selectDocuments();
    await exposed.api.previewPdfPage('preview.pdf');
    await exposed.api.processOCR('scan.jpg');
    await exposed.api.saveReview({ ok: true });
    await exposed.api.listRecords();
    await exposed.api.countRecords();
    await exposed.api.exportRecords();

    assert.deepStrictEqual(invokeCalls, [
      ['documents:select', undefined],
      ['documents:previewPdfPage', 'preview.pdf'],
      ['ocr:process', 'scan.jpg'],
      ['review:save', { ok: true }],
      ['records:list', undefined],
      ['records:count', undefined],
      ['records:export', undefined]
    ]);
  });
});
