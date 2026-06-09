process.env.OCR_ENGINE = 'mock';
const assert = require('assert');
const fs = require('fs');
const bridge = require('../sidecar_bridge');

describe('OCR Sidecar Bridge', () => {
  before(() => {
    fs.writeFileSync('dummy.jpg', 'mock image data');
  });

  after(() => {
    try {
      fs.unlinkSync('dummy.jpg');
    } catch (e) {}
    bridge.stop();
  });

  it('should preserve structured OCR responses with fallback metadata intact', () => {
    const normalized = bridge.normalizeOcrResponse({
      ok: false,
      degraded: true,
      engine: 'glm-ocr',
      warnings: ['GLM-OCR fallback used.'],
      data: {
        first_name: '',
        last_name: '',
        doc_type: '',
        doc_number: '',
        expiry_date: '',
        phone_number: '',
        confidence_score: 0
      }
    });

    assert.deepStrictEqual(normalized, {
      ok: false,
      degraded: true,
      engine: 'glm-ocr',
      warnings: ['GLM-OCR fallback used.'],
      data: {
        first_name: '',
        last_name: '',
        doc_type: '',
        doc_number: '',
        expiry_date: '',
        phone_number: '',
        confidence_score: 0
      }
    });
  });

  it('should process OCR task and return mock data', async () => {
    assert.strictEqual(bridge.isRunning(), false);
    const result = await bridge.runOCR('dummy.jpg');
    assert.strictEqual(bridge.isRunning(), true);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.degraded, false);
    assert.strictEqual(result.engine, 'mock');
    assert.strictEqual(result.data.first_name, 'JOHN');
    assert.strictEqual(result.data.doc_type, 'PASSPORT');
  });

  it('should reject when the Python executable cannot be launched', async () => {
    const originalPython = process.env.PYTHON;
    process.env.PYTHON = 'missing-python-executable-for-test';
    bridge.stop();

    try {
      await assert.rejects(
        () => bridge.runOCR('dummy.jpg'),
        /missing-python-executable-for-test|ENOENT|spawn/
      );
    } finally {
      if (originalPython === undefined) {
        delete process.env.PYTHON;
      } else {
        process.env.PYTHON = originalPython;
      }
      bridge.stop();
    }
  });

  it('should invoke the progress callback and complete/fail downloadModel', async () => {
    const originalPython = process.env.PYTHON;
    process.env.PYTHON = 'missing-python-executable-for-test';
    try {
      await bridge.downloadModel(() => {});
      assert.fail('should have rejected');
    } catch (err) {
      assert.match(err.message, /missing-python-executable-for-test|ENOENT|spawn/);
    } finally {
      if (originalPython === undefined) {
        delete process.env.PYTHON;
      } else {
        process.env.PYTHON = originalPython;
      }
    }
  });

  it('should reject PDF preview requests when Python cannot be launched', async () => {
    const originalPython = process.env.PYTHON;
    process.env.PYTHON = 'missing-python-executable-for-test';
    bridge.stop();

    try {
      await assert.rejects(
        () => bridge.previewPdfPage('dummy.pdf'),
        /missing-python-executable-for-test|ENOENT|spawn/
      );
    } finally {
      if (originalPython === undefined) {
        delete process.env.PYTHON;
      } else {
        process.env.PYTHON = originalPython;
      }
      bridge.stop();
    }
  });

  it('should attempt to auto-restart the sidecar if it exits prematurely during active requests', async () => {
    const child_process = require('child_process');
    const originalSpawn = child_process.spawn;

    let spawnCount = 0;
    let mockChild = null;

    child_process.spawn = function(command, args, options) {
      spawnCount++;
      const listeners = {};
      const mockStdin = {
        write: (data, callback) => {
          if (callback) callback();
        }
      };
      const mockStdout = {
        on: (event, cb) => {}
      };
      const mockStderr = {
        on: (event, cb) => {}
      };
      const childObj = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        on: (event, cb) => {
          listeners[event] = cb;
        },
        kill: () => {},
        exitCode: null,
        trigger: (event, ...args) => {
          if (listeners[event]) listeners[event](...args);
        }
      };
      mockChild = childObj;
      return childObj;
    };

    // Clear cache and require sidecar_bridge fresh to pick up overridden spawn
    delete require.cache[require.resolve('../sidecar_bridge')];
    const freshBridge = require('../sidecar_bridge');

    try {
      freshBridge.stop();
      const promise = freshBridge.runOCR('dummy.jpg');
      promise.catch(() => {});
      assert.strictEqual(spawnCount, 1);
      
      mockChild.trigger('exit', 1, null);
      assert.strictEqual(spawnCount, 2);
    } finally {
      child_process.spawn = originalSpawn;
      delete require.cache[require.resolve('../sidecar_bridge')];
    }
  });

  it('should reject payloads with invalid structure on JS side', async () => {
    await assert.rejects(
      () => bridge.runOCR(null),
      /Missing or invalid file_path/
    );

    await assert.rejects(
      () => bridge.runOCR({}),
      /Missing or invalid file_path/
    );
  });

  it('should immediately terminate the sidecar process on request timeout', async () => {
    delete require.cache[require.resolve('../sidecar_bridge')];
    const freshBridge = require('../sidecar_bridge');
    const originalTimeout = process.env.OCR_TIMEOUT_MS;
    process.env.OCR_TIMEOUT_MS = '20';

    try {
      await assert.rejects(
        () => freshBridge.runOCR('dummy.jpg'),
        /timed out/
      );
      assert.strictEqual(freshBridge.isRunning(), false);
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.OCR_TIMEOUT_MS;
      } else {
        process.env.OCR_TIMEOUT_MS = originalTimeout;
      }
      freshBridge.stop();
      delete require.cache[require.resolve('../sidecar_bridge')];
    }
  });
});
