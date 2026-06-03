const assert = require('assert');
const bridge = require('../sidecar_bridge');

describe('OCR Sidecar Bridge', () => {
  after(() => {
    bridge.stop();
  });

  it('should process OCR task and return mock data', async () => {
    assert.strictEqual(bridge.isRunning(), false);
    const result = await bridge.runOCR('dummy.jpg');
    assert.strictEqual(bridge.isRunning(), true);
    assert.strictEqual(result.first_name, 'JOHN');
    assert.strictEqual(result.doc_type, 'PASSPORT');
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
});
