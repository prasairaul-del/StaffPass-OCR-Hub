process.env.OCR_ENGINE = 'mock';
const assert = require('assert');
const bridge = require('../sidecar_bridge');

describe('OCR Sidecar Bridge', () => {
  after(() => {
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
});
