const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  createQueueItem,
  getConfidenceStatus,
  normalizeExtraction,
  validateReviewData
} = require('../renderer');

function makeFakeElement(tagName = 'div') {
  const listeners = {};
  const classes = new Set();
  const element = {
    tagName: tagName.toUpperCase(),
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    dataset: {},
    style: {},
    className: '',
    attributes: {},
    classList: {
      add: (...tokens) => tokens.forEach((token) => classes.add(token)),
      remove: (...tokens) => tokens.forEach((token) => classes.delete(token)),
      toggle: (token, force) => {
        if (force === true) {
          classes.add(token);
          return true;
        }
        if (force === false) {
          classes.delete(token);
          return false;
        }
        if (classes.has(token)) {
          classes.delete(token);
          return false;
        }
        classes.add(token);
        return true;
      },
      contains: (token) => classes.has(token)
    },
    addEventListener: (eventName, handler) => {
      listeners[eventName] = handler;
    },
    click: () => {
      if (listeners.click) {
        return listeners.click({ preventDefault() {}, target: element });
      }
      return undefined;
    },
    querySelector: (selector) => {
      if (selector === '.step-icon') return null;
      return null;
    },
    setAttribute: (name, value) => {
      element.attributes[name] = String(value);
    },
    getAttribute: (name) => element.attributes[name] ?? null,
    appendChild: () => {},
    focus: () => {
      if (typeof element.onFocus === 'function') {
        element.onFocus();
      }
    },
    remove: () => {}
  };
  return element;
}

function loadRendererInternals() {
  const rendererPath = path.join(__dirname, '..', 'renderer.js');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const sandbox = {
    console,
    process,
    setTimeout,
    clearTimeout,
    window: {
      addEventListener: () => {},
      api: {}
    },
    document: {
      elements: new Map(),
      documentElement: {
        setAttribute: () => {},
        getAttribute: () => null
      },
      body: {
        appendChild: () => {}
      },
      activeElement: null,
      addEventListener: () => {},
      createElement: (tagName) => makeFakeElement(tagName),
      getElementById(id) {
        return this.elements.get(id) || null;
      }
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    module: { exports: {} },
    exports: {}
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  const exposedSource = `${source}\nmodule.exports.__test__ = { bindEvents, dismissWhatsNew, enforceOverlayFocus, getExtractionNotes, getReviewStatusForExtraction, keepFocusInsideOverlay, showWhatsNewDialog, updateDocumentPreview };`;
  vm.runInNewContext(exposedSource, sandbox, { filename: rendererPath });
  return sandbox;
}

describe('Renderer UI Helpers', () => {
  it('should map confidence scores to review statuses', () => {
    assert.strictEqual(getConfidenceStatus(95), 'Trusted');
    assert.strictEqual(getConfidenceStatus(80), 'Review Recommended');
    assert.strictEqual(getConfidenceStatus(79), 'Manual Review Required');
  });

  it('should validate required review fields', () => {
    const errors = validateReviewData({
      first_name: '',
      last_name: '',
      doc_type: '',
      doc_number: ''
    });
    assert.deepStrictEqual(errors, [
      'First name is required.',
      'Last name is required.',
      'Document type is required.',
      'Document number is required.'
    ]);
  });

  it('should normalize OCR result values for the inspector', () => {
    const result = normalizeExtraction({ first_name: 'JOHN', confidence: 94 });
    assert.strictEqual(result.first_name, 'JOHN');
    assert.strictEqual(result.last_name, '');
    assert.strictEqual(result.confidence_score, 94);
  });

  it('should preserve structured OCR responses without fabricating identity data', () => {
    const result = normalizeExtraction({
      ok: false,
      degraded: true,
      engine: 'glm-ocr',
      warnings: ['Manual review required.'],
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

    assert.deepStrictEqual(result, {
      first_name: '',
      last_name: '',
      doc_type: '',
      doc_number: '',
      expiry_date: '',
      phone_number: '',
      confidence_score: 0,
      notes: '',
      ok: false,
      degraded: true,
      engine: 'glm-ocr',
      warnings: ['Manual review required.']
    });
  });

  it('should surface manual-review warnings in the renderer helpers', () => {
    const { module } = loadRendererInternals();
    const { getExtractionNotes, getReviewStatusForExtraction } = module.exports.__test__;
    const extraction = {
      degraded: true,
      confidence_score: 99,
      warnings: ['GLM-OCR fallback was used.', 'Manual review required.']
    };

    assert.strictEqual(getReviewStatusForExtraction(extraction), 'Manual Review Required');
    assert.strictEqual(
      getExtractionNotes(extraction),
      'GLM-OCR fallback was used. Manual review required.'
    );
  });

  it('should keep modal focus inside the open dialog', () => {
    const sandbox = loadRendererInternals();
    const overlay = makeFakeElement('div');
    const closeBtn = makeFakeElement('button');
    const actionBtn = makeFakeElement('button');
    const outsideBtn = makeFakeElement('button');

    closeBtn.onFocus = () => {
      sandbox.document.activeElement = closeBtn;
    };
    actionBtn.onFocus = () => {
      sandbox.document.activeElement = actionBtn;
    };
    outsideBtn.onFocus = () => {
      sandbox.document.activeElement = outsideBtn;
    };

    overlay.querySelector = (selector) => {
      if (selector === '#whats-new-close') return closeBtn;
      return null;
    };
    overlay.querySelectorAll = () => [closeBtn, actionBtn];
    overlay.contains = (node) => node === closeBtn || node === actionBtn;
    overlay.setAttribute('aria-hidden', 'false');

    sandbox.document.elements.set('whats-new-overlay', overlay);
    sandbox.document.activeElement = outsideBtn;

    const { keepFocusInsideOverlay, enforceOverlayFocus } = sandbox.module.exports.__test__;
    const tabEvent = {
      key: 'Tab',
      shiftKey: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };

    assert.strictEqual(keepFocusInsideOverlay(tabEvent, 'whats-new-overlay'), true);
    assert.strictEqual(tabEvent.defaultPrevented, true);
    assert.strictEqual(sandbox.document.activeElement, closeBtn);

    sandbox.document.activeElement = outsideBtn;
    enforceOverlayFocus({ target: outsideBtn });
    assert.strictEqual(sandbox.document.activeElement, closeBtn);
  });

  it('should create queued document items from Windows paths', () => {
    const item = createQueueItem('C:\\Docs\\passport.jpg');
    assert.strictEqual(item.fileName, 'passport.jpg');
    assert.strictEqual(item.status, 'queued');
    assert.strictEqual(item.reviewStatus, 'Pending Review');
  });

  it('should validate expiry date format YYYY-MM-DD', () => {
    const errors = validateReviewData({
      first_name: 'John',
      last_name: 'Doe',
      doc_type: 'Passport',
      doc_number: '1234',
      expiry_date: '2026/12/31'
    });
    assert.deepStrictEqual(errors, ['Expiry date format must be YYYY-MM-DD.']);
  });

  it('should parse and format file sizes in createQueueItem', () => {
    const itemB = createQueueItem('C:\\test.jpg', 512);
    assert.strictEqual(itemB.fileSize, '512 B');

    const itemKB = createQueueItem('C:\\test.jpg', 1536);
    assert.strictEqual(itemKB.fileSize, '1.5 KB');

    const itemMB = createQueueItem('C:\\test.jpg', 1048576 * 2.5);
    assert.strictEqual(itemMB.fileSize, '2.5 MB');
  });

  it('should render PDF previews through the bridge API', async () => {
    const preview = makeFakeElement('div');
    preview.children = [];
    Object.defineProperty(preview, 'innerHTML', {
      configurable: true,
      get: () => '',
      set: () => {
        preview.children = [];
      }
    });
    preview.appendChild = (child) => {
      preview.children.push(child);
    };
    const reviewPreview = makeFakeElement('div');
    reviewPreview.children = [];
    Object.defineProperty(reviewPreview, 'innerHTML', {
      configurable: true,
      get: () => '',
      set: () => {
        reviewPreview.children = [];
      }
    });
    reviewPreview.appendChild = (child) => {
      reviewPreview.children.push(child);
    };
    const sandbox = loadRendererInternals();
    const previewCalls = [];
    sandbox.document.elements.set('document-preview-container', preview);
    sandbox.document.elements.set('review-preview-container', reviewPreview);
    sandbox.window.api = {
      previewPdfPage: async (filePath) => {
        previewCalls.push(filePath);
        return {
          ok: true,
          mimeType: 'image/png',
          data: 'cGRmLXByZXZpZXc=',
          width: 640,
          height: 360,
          warnings: []
        };
      }
    };

    await sandbox.module.exports.__test__.updateDocumentPreview({
      filePath: 'C:\\docs\\passport.pdf',
      fileName: 'passport.pdf'
    });

    assert.deepStrictEqual(previewCalls, ['C:\\docs\\passport.pdf']);
    assert.strictEqual(preview.children.length, 1);
    assert.strictEqual(preview.children[0].tagName, 'IMG');
    assert.ok(String(preview.children[0].src).startsWith('data:image/png;base64,'));
    assert.strictEqual(reviewPreview.children.length, 1);
    assert.strictEqual(reviewPreview.children[0].tagName, 'IMG');
  });

  it('should invoke the export API from the records toolbar', () => {
    const exportsCalled = [];
    const appStatus = makeFakeElement('div');
    const exportButton = makeFakeElement('button');
    const sandbox = loadRendererInternals();
    sandbox.window.api = {
      exportRecords: () => {
        exportsCalled.push('exportRecords');
      }
    };
    sandbox.document.elements.set('app-status', appStatus);
    sandbox.document.elements.set('export-records-btn', exportButton);

    sandbox.module.exports.__test__.bindEvents();
    exportButton.click();

    assert.deepStrictEqual(exportsCalled, ['exportRecords']);
  });
});
