const assert = require('assert');
const os = require('os');
const path = require('path');
const Module = require('module');

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

  it('registers the planned IPC handlers and secure window wiring', async () => {
    const registeredHandlers = {};
    let dialogOptions;
    let bridgeFilePath;
    let createdWindowOptions;
    let loadedFilePath;
    const dbCalls = [];

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
          this.loadFile = (filePath) => {
            loadedFilePath = filePath;
          };
        },
        dialog: {
          showOpenDialog: async (options) => {
            dialogOptions = options;
            return { canceled: false, filePaths: ['C:/docs/passport.jpg'] };
          }
        },
        ipcMain: {
          handle: (channel, handler) => {
            registeredHandlers[channel] = handler;
          }
        }
      },
      './database': {
        init: (dbPath) => dbCalls.push(['init', dbPath]),
        close: () => dbCalls.push(['close']),
        saveReviewedDocument: (payload) => {
          dbCalls.push(['save', payload]);
          return { ok: true, payload };
        },
        listRecords: () => {
          dbCalls.push(['list']);
          return [{ id: 1 }];
        }
      },
      './sidecar_bridge': {
        runOCR: async (filePath) => {
          bridgeFilePath = filePath;
          return { first_name: 'JOHN', file_path: filePath };
        },
        stop: () => dbCalls.push(['bridge-stop'])
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

    assert.deepStrictEqual(
      Object.keys(registeredHandlers).sort(),
      ['documents:select', 'ocr:process', 'records:list', 'review:save']
    );

    const selectedFiles = await registeredHandlers['documents:select']();
    assert.deepStrictEqual(selectedFiles, ['C:/docs/passport.jpg']);
    assert.deepStrictEqual(dialogOptions.properties, ['openFile', 'multiSelections']);
    assert.deepStrictEqual(dialogOptions.filters, [
      { name: 'Documents', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }
    ]);

    const ocrResult = await registeredHandlers['ocr:process']({}, 'C:/docs/passport.jpg');
    assert.strictEqual(bridgeFilePath, 'C:/docs/passport.jpg');
    assert.strictEqual(ocrResult.first_name, 'JOHN');

    const reviewResult = await registeredHandlers['review:save']({}, { file_path: 'C:/docs/passport.jpg' });
    assert.strictEqual(reviewResult.ok, true);
    assert.deepStrictEqual(dbCalls.find(([name]) => name === 'save')[1], { file_path: 'C:/docs/passport.jpg' });

    const recordResult = await registeredHandlers['records:list']();
    assert.deepStrictEqual(recordResult, [{ id: 1 }]);

    assert.ok(dbCalls.some(([name]) => name === 'list'));
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
      ['listRecords', 'processOCR', 'saveReview', 'selectDocuments']
    );

    await exposed.api.selectDocuments();
    await exposed.api.processOCR('scan.jpg');
    await exposed.api.saveReview({ ok: true });
    await exposed.api.listRecords();

    assert.deepStrictEqual(invokeCalls, [
      ['documents:select', undefined],
      ['ocr:process', 'scan.jpg'],
      ['review:save', { ok: true }],
      ['records:list', undefined]
    ]);
  });
});
