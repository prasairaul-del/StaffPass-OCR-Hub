const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    trigger: (eventName, eventObj) => {
      if (listeners[eventName]) {
        return listeners[eventName](eventObj || { preventDefault() {}, target: element });
      }
      return undefined;
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
  const dir = path.join(__dirname, '..', 'renderer');
  const files = [
    path.join(dir, 'state.js'),
    path.join(dir, 'dom.js'),
    path.join(dir, 'utils.js'),
    path.join(dir, 'queue.js'),
    path.join(dir, 'ocr.js'),
    path.join(dir, 'review.js'),
    path.join(dir, 'overlays.js'),
    path.join(dir, 'events.js'),
    path.join(__dirname, '..', 'renderer.js')
  ];

  let source = '';
  for (const f of files) {
    source += fs.readFileSync(f, 'utf8') + '\n';
  }

  // Strip all imports and exports
  source = source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"].*?['"];?/gm, '')
    .replace(/^\s*export\s+const\s+/gm, 'const ')
    .replace(/^\s*export\s+let\s+/gm, 'let ')
    .replace(/^\s*export\s+function\s+/gm, 'function ')
    .replace(/^\s*export\s+async\s+function\s+/gm, 'async function ')
    .replace(/^\s*export\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];?/gm, '');

  const sandbox = {
    console,
    process,
    setTimeout,
    clearTimeout,
    window: {
      listeners: {},
      addEventListener(eventName, handler) {
        this.listeners[eventName] = handler;
      },
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

  const exposedSource = `${source}\nmodule.exports.__test__ = { bindEvents, dismissWhatsNew, enforceOverlayFocus, getExtractionNotes, getReviewStatusForExtraction, keepFocusInsideOverlay, showWhatsNewDialog, updateDocumentPreview, handleReviewKeyDown, focusNextField, state, loadRecords, renderRecords, updatePaginationUI };\nmodule.exports.createQueueItem = createQueueItem;\nmodule.exports.getConfidenceStatus = getConfidenceStatus;\nmodule.exports.normalizeExtraction = normalizeExtraction;\nmodule.exports.validateReviewData = validateReviewData;\nmodule.exports.debounce = debounce;`;
  
  vm.runInNewContext(exposedSource, sandbox, { filename: path.join(__dirname, '..', 'renderer.js') });
  
  sandbox.createQueueItem = (...args) => JSON.parse(JSON.stringify(sandbox.module.exports.createQueueItem(...args)));
  sandbox.getConfidenceStatus = sandbox.module.exports.getConfidenceStatus;
  sandbox.normalizeExtraction = (...args) => JSON.parse(JSON.stringify(sandbox.module.exports.normalizeExtraction(...args)));
  sandbox.validateReviewData = (...args) => JSON.parse(JSON.stringify(sandbox.module.exports.validateReviewData(...args)));
  sandbox.debounce = sandbox.module.exports.debounce;

  return sandbox;
}

const sandbox = loadRendererInternals();
const {
  createQueueItem,
  debounce,
  getConfidenceStatus,
  normalizeExtraction,
  validateReviewData
} = sandbox;

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

  it('should traverse documents on Alt+Down and Alt+Up', async () => {
    const sandbox = loadRendererInternals();
    const { handleReviewKeyDown, state } = sandbox.module.exports.__test__;
    
    state.activeView = 'review';
    state.queue = [
      { id: 'doc-1', status: 'queued', fileName: 'doc1.jpg' },
      { id: 'doc-2', status: 'review', fileName: 'doc2.jpg' },
      { id: 'doc-3', status: 'error', fileName: 'doc3.jpg' }
    ];
    state.selectedId = 'doc-1';

    const whatsNew = makeFakeElement('div');
    whatsNew.setAttribute('aria-hidden', 'true');
    const shortcuts = makeFakeElement('div');
    shortcuts.setAttribute('aria-hidden', 'true');
    sandbox.document.elements.set('whats-new-overlay', whatsNew);
    sandbox.document.elements.set('shortcuts-overlay', shortcuts);

    let focusCalled = false;
    const firstNameInput = makeFakeElement('input');
    firstNameInput.id = 'field-first-name';
    firstNameInput.onFocus = () => {
      focusCalled = true;
    };
    sandbox.document.elements.set('field-first-name', firstNameInput);

    const eventAltDown = {
      key: 'ArrowDown',
      altKey: true,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    handleReviewKeyDown(eventAltDown, () => {});

    assert.strictEqual(eventAltDown.defaultPrevented, true);
    assert.strictEqual(state.selectedId, 'doc-2');

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.strictEqual(focusCalled, true);

    // Test Alt+Up
    focusCalled = false;
    const eventAltUp = {
      key: 'ArrowUp',
      altKey: true,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    handleReviewKeyDown(eventAltUp, () => {});

    assert.strictEqual(eventAltUp.defaultPrevented, true);
    assert.strictEqual(state.selectedId, 'doc-1');

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.strictEqual(focusCalled, true);
  });

  it('should trigger approval on Ctrl+Enter', async () => {
    const sandbox = loadRendererInternals();
    const { handleReviewKeyDown, state } = sandbox.module.exports.__test__;

    state.activeView = 'review';
    state.queue = [
      { id: 'doc-1', status: 'queued', fileName: 'doc1.jpg', extraction: { first_name: 'John', last_name: 'Doe', doc_type: 'Passport', doc_number: '123' } }
    ];
    state.selectedId = 'doc-1';

    const whatsNew = makeFakeElement('div');
    whatsNew.setAttribute('aria-hidden', 'true');
    const shortcuts = makeFakeElement('div');
    shortcuts.setAttribute('aria-hidden', 'true');
    sandbox.document.elements.set('whats-new-overlay', whatsNew);
    sandbox.document.elements.set('shortcuts-overlay', shortcuts);

    const firstNameInput = makeFakeElement('input');
    firstNameInput.value = 'John';
    firstNameInput.id = 'field-first-name';
    sandbox.document.elements.set('field-first-name', firstNameInput);

    const lastNameInput = makeFakeElement('input');
    lastNameInput.value = 'Doe';
    lastNameInput.id = 'field-last-name';
    sandbox.document.elements.set('field-last-name', lastNameInput);

    const docTypeInput = makeFakeElement('input');
    docTypeInput.value = 'Passport';
    docTypeInput.id = 'field-doc-type';
    sandbox.document.elements.set('field-doc-type', docTypeInput);

    const docNumInput = makeFakeElement('input');
    docNumInput.value = '123';
    docNumInput.id = 'field-id-number';
    sandbox.document.elements.set('field-id-number', docNumInput);

    let saveReviewCalled = false;
    sandbox.window.api = {
      saveReview: async (payload) => {
        saveReviewCalled = true;
        assert.strictEqual(payload.review_status, 'Approved');
      },
      listRecords: async () => []
    };

    const eventCtrlEnter = {
      key: 'Enter',
      ctrlKey: true,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    handleReviewKeyDown(eventCtrlEnter, () => {});

    assert.strictEqual(eventCtrlEnter.defaultPrevented, true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.strictEqual(saveReviewCalled, true);
  });

  it('should move focus to next field on Enter key', () => {
    const sandbox = loadRendererInternals();
    const { handleReviewKeyDown, state } = sandbox.module.exports.__test__;

    state.activeView = 'review';
    
    const whatsNew = makeFakeElement('div');
    whatsNew.setAttribute('aria-hidden', 'true');
    const shortcuts = makeFakeElement('div');
    shortcuts.setAttribute('aria-hidden', 'true');
    sandbox.document.elements.set('whats-new-overlay', whatsNew);
    sandbox.document.elements.set('shortcuts-overlay', shortcuts);

    const firstNameInput = makeFakeElement('input');
    firstNameInput.id = 'field-first-name';
    sandbox.document.elements.set('field-first-name', firstNameInput);

    let nextFocused = false;
    const lastNameInput = makeFakeElement('input');
    lastNameInput.id = 'field-last-name';
    lastNameInput.onFocus = () => {
      nextFocused = true;
    };
    sandbox.document.elements.set('field-last-name', lastNameInput);

    const eventEnter = {
      key: 'Enter',
      target: firstNameInput,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    handleReviewKeyDown(eventEnter, () => {});

    assert.strictEqual(eventEnter.defaultPrevented, true);
    assert.strictEqual(nextFocused, true);
  });

  it('should ignore hotkeys when a modal overlay is active', () => {
    const sandbox = loadRendererInternals();
    const { handleReviewKeyDown, state } = sandbox.module.exports.__test__;

    state.activeView = 'review';
    state.queue = [
      { id: 'doc-1', status: 'queued', fileName: 'doc1.jpg' },
      { id: 'doc-2', status: 'review', fileName: 'doc2.jpg' }
    ];
    state.selectedId = 'doc-1';

    const whatsNew = makeFakeElement('div');
    whatsNew.setAttribute('aria-hidden', 'false');
    const shortcuts = makeFakeElement('div');
    shortcuts.setAttribute('aria-hidden', 'true');
    sandbox.document.elements.set('whats-new-overlay', whatsNew);
    sandbox.document.elements.set('shortcuts-overlay', shortcuts);

    const eventAltDown = {
      key: 'ArrowDown',
      altKey: true,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    handleReviewKeyDown(eventAltDown, () => {});

    assert.notStrictEqual(eventAltDown.defaultPrevented, true);
    assert.strictEqual(state.selectedId, 'doc-1');
  });

  describe('debounce utility', () => {
    it('should execute after the wait time', async () => {
      let called = 0;
      let argPassed = null;
      const fn = debounce((val) => {
        called++;
        argPassed = val;
      }, 50);

      fn('test-value');
      assert.strictEqual(called, 0);

      await new Promise(resolve => setTimeout(resolve, 80));
      assert.strictEqual(called, 1);
      assert.strictEqual(argPassed, 'test-value');
    });

    it('should throttle multiple quick successive calls and trigger only once', async () => {
      let called = 0;
      let argPassed = null;
      const fn = debounce((val) => {
        called++;
        argPassed = val;
      }, 50);

      fn('first');
      fn('second');
      fn('third');

      assert.strictEqual(called, 0);

      await new Promise(resolve => setTimeout(resolve, 80));
      assert.strictEqual(called, 1);
      assert.strictEqual(argPassed, 'third');
    });
  });
});

describe('Saved Records Pagination Controls', () => {
  let localSandbox;
  let listRecordsCalls;
  let countRecordsCalls;
  let tableBody;
  let infoText;
  let prevBtn;
  let nextBtn;
  let searchInput;
  let typeFilter;
  let pageSizeSelector;

  beforeEach(() => {
    localSandbox = loadRendererInternals();
    listRecordsCalls = [];
    countRecordsCalls = [];

    tableBody = makeFakeElement('tbody');
    infoText = makeFakeElement('div');
    prevBtn = makeFakeElement('button');
    nextBtn = makeFakeElement('button');
    searchInput = makeFakeElement('input');
    typeFilter = makeFakeElement('select');
    pageSizeSelector = makeFakeElement('select');

    localSandbox.document.elements.set('records-table-body', tableBody);
    localSandbox.document.elements.set('pagination-info-text', infoText);
    localSandbox.document.elements.set('records-prev-page', prevBtn);
    localSandbox.document.elements.set('records-next-page', nextBtn);
    localSandbox.document.elements.set('record-search-input', searchInput);
    localSandbox.document.elements.set('record-type-filter', typeFilter);
    localSandbox.document.elements.set('records-page-size', pageSizeSelector);

    localSandbox.window.api = {
      listRecords: async (options) => {
        listRecordsCalls.push(JSON.parse(JSON.stringify(options)));
        return [
          { first_name: 'John', last_name: 'Doe', doc_type: 'Passport', doc_number: '123', expiry_date: '2026-06-09', confidence_score: 95, review_status: 'Approved' }
        ];
      },
      countRecords: async (options) => {
        countRecordsCalls.push(JSON.parse(JSON.stringify(options)));
        return 15;
      }
    };
  });

  it('should query state.pagination and render records properly', async () => {
    const { loadRecords, renderRecords, state } = localSandbox.module.exports.__test__;
    state.pagination = { page: 1, limit: 10, total: 0 };

    await loadRecords();
    assert.strictEqual(listRecordsCalls.length, 1);
    assert.deepStrictEqual(listRecordsCalls[0], { search: '', type: '', page: 1, limit: 10 });
    assert.strictEqual(countRecordsCalls.length, 1);
    assert.deepStrictEqual(countRecordsCalls[0], { search: '', type: '' });
    assert.strictEqual(state.pagination.total, 15);

    renderRecords();
    assert.strictEqual(infoText.textContent, 'Showing 1-10 of 15 records');
    assert.strictEqual(prevBtn.disabled, true);
    assert.strictEqual(nextBtn.disabled, false);
  });

  it('should handle prev and next page clicks', async () => {
    const { bindEvents, state } = localSandbox.module.exports.__test__;
    state.pagination = { page: 1, limit: 10, total: 15 };

    bindEvents(() => {});

    localSandbox.window.api.listRecords = async (options) => {
      listRecordsCalls.push(JSON.parse(JSON.stringify(options)));
      return [];
    };

    await nextBtn.click();
    assert.strictEqual(state.pagination.page, 2);
    assert.strictEqual(listRecordsCalls[0].page, 2);

    await prevBtn.click();
    assert.strictEqual(state.pagination.page, 1);
    assert.strictEqual(listRecordsCalls[1].page, 1);
  });

  it('should handle page size changes', async () => {
    const { bindEvents, state } = localSandbox.module.exports.__test__;
    state.pagination = { page: 2, limit: 10, total: 15 };

    bindEvents(() => {});

    localSandbox.window.api.listRecords = async (options) => {
      listRecordsCalls.push(JSON.parse(JSON.stringify(options)));
      return [];
    };

    pageSizeSelector.value = '25';
    await pageSizeSelector.trigger('change', { target: { value: '25' } });

    assert.strictEqual(state.pagination.limit, 25);
    assert.strictEqual(state.pagination.page, 1);
  });

  it('should reset page index to 1 when changing search query or doc type filter', async () => {
    const { bindEvents, state } = localSandbox.module.exports.__test__;
    state.pagination = { page: 3, limit: 10, total: 35 };

    bindEvents(() => {});

    localSandbox.window.api.listRecords = async (options) => {
      listRecordsCalls.push(JSON.parse(JSON.stringify(options)));
      return [];
    };

    typeFilter.value = 'Passport';
    await typeFilter.trigger('change');

    assert.strictEqual(state.pagination.page, 1);

    state.pagination.page = 3;

    searchInput.value = 'Alice';
    await searchInput.trigger('input');

    await new Promise(resolve => setTimeout(resolve, 280));

    assert.strictEqual(state.pagination.page, 1);
  });
});

describe('Window unhandledrejection listener', () => {
  it('should intercept unhandled promise rejections and show a toast with details', () => {
    const localSandbox = loadRendererInternals();
    const listener = localSandbox.window.listeners['unhandledrejection'];
    assert.ok(listener, 'unhandledrejection listener should be registered');

    // Create a mock toast element in the document sandbox
    const toastEl = makeFakeElement('div');
    localSandbox.document.elements.set('toast', toastEl);

    // Call the listener with a mock event
    listener({
      reason: new Error('Simulated async failure')
    });

    assert.ok(toastEl.classList.contains('is-visible'), 'Toast should be visible');
    assert.ok(toastEl.textContent.includes('Simulated async failure'), 'Toast message should contain error details');
  });
});

describe('Window drag and drop logic', () => {
  it('should handle dragenter, dragleave and drop events on window', () => {
    const localSandbox = loadRendererInternals();
    
    // Define mock element for drag-overlay
    const dragOverlay = makeFakeElement('div');
    dragOverlay.style.display = 'none';
    localSandbox.document.elements.set('drag-overlay', dragOverlay);

    // Track calls to addFiles
    let addedFiles = [];
    localSandbox.addFiles = (files) => {
      addedFiles = files;
    };

    const bindEvents = localSandbox.module.exports.__test__.bindEvents;
    bindEvents(() => {});

    // Check listeners are registered on window
    const dragenter = localSandbox.window.listeners['dragenter'];
    const dragleave = localSandbox.window.listeners['dragleave'];
    const drop = localSandbox.window.listeners['drop'];

    assert.ok(dragenter, 'dragenter listener registered');
    assert.ok(dragleave, 'dragleave listener registered');
    assert.ok(drop, 'drop listener registered');

    // Simulate dragenter
    dragenter({ preventDefault() {} });
    assert.strictEqual(dragOverlay.style.display, 'flex');

    // Simulate dragleave (counter decreases to 0)
    dragleave({ preventDefault() {} });
    assert.strictEqual(dragOverlay.style.display, 'none');

    // Simulate dragenter and drop
    dragenter({ preventDefault() {} });
    assert.strictEqual(dragOverlay.style.display, 'flex');

    const fakeFiles = [{ name: 'doc.png' }];
    drop({
      preventDefault() {},
      dataTransfer: { files: fakeFiles }
    });

    assert.strictEqual(dragOverlay.style.display, 'none');
    assert.strictEqual(addedFiles.length, 1);
    assert.strictEqual(addedFiles[0].name, 'doc.png');
  });
});
