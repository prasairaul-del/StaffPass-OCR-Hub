import { state } from './renderer/state.js';
import { query, setStatus, enforceOverlayFocus, focusNextField } from './renderer/dom.js';

import { 
  renderMetrics, 
  renderIngestionQueue, 
  renderQueue, 
  renderSelected, 
  selectDocuments, 
  addFiles,
  setActiveView,
  setQueueRenderCallback,
  setValidationErrorsCallback
} from './renderer/queue.js';
import { 
  renderRecords, 
  saveSelectedReview, 
  loadRecords, 
  exportRecords,
  setValidationErrors,
  setReviewRenderCallback
} from './renderer/review.js';
import { 
  processSelectedOCR, 
  setupModelDownloadUI,
  setOcrRenderCallback
} from './renderer/ocr.js';
import { 
  applyTheme, 
  loadSavedTheme, 
  toggleTheme, 
  toggleShortcutsOverlay, 
  dismissWhatsNew, 
  checkAndShowWhatsNew, 
  setupAutoUpdateUI, 
  checkForUpdates, 
  showToast 
} from './renderer/overlays.js';

// Setup callbacks to resolve circular dependencies
setQueueRenderCallback(render);
setValidationErrorsCallback(setValidationErrors);
setOcrRenderCallback(render);
setReviewRenderCallback(render);

export function render() {
  renderMetrics();
  renderIngestionQueue();
  renderQueue();
  renderSelected();
  renderRecords();
}

export function bindEvents() {
  query('tab-ingestion')?.addEventListener('click', () => setActiveView('ingestion'));
  query('tab-review-queue')?.addEventListener('click', () => setActiveView('review'));
  query('tab-records')?.addEventListener('click', () => setActiveView('records'));
  query('process-selected')?.addEventListener('click', processSelectedOCR);
  query('clear-queue-btn')?.addEventListener('click', () => {
    state.queue = [];
    state.selectedId = null;
    setStatus('Queue cleared.');
    render();
  });
  query('refresh-queue-btn')?.addEventListener('click', async () => {
    await loadRecords();
    render();
    setStatus('Workspace refreshed.');
  });
  query('refresh-records')?.addEventListener('click', async () => {
    await loadRecords();
    render();
    setStatus('Records refreshed.');
  });
  query('export-records-btn')?.addEventListener('click', exportRecords);
  query('approve-btn')?.addEventListener('click', () => saveSelectedReview('Approved'));
  query('reject-btn')?.addEventListener('click', () => saveSelectedReview('Rejected'));
  query('correct-btn')?.addEventListener('click', () => saveSelectedReview('Corrected'));
  query('save-corrections-btn')?.addEventListener('click', () => saveSelectedReview('Corrected'));

  query('record-search-input')?.addEventListener('input', () => {
    renderRecords();
  });
  query('record-type-filter')?.addEventListener('change', () => {
    renderRecords();
  });

  query('file-input')?.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) addFiles(files);
    event.target.value = '';
  });

  query('drop-zone')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDocuments();
    }
  });

  const dropZone = query('drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'));
    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length > 0) addFiles(files);
    });
  }
}

export async function init() {
  applyTheme(loadSavedTheme());
  setupAutoUpdateUI();
  setupModelDownloadUI();
  
  // Load version and set the UI text
  if (window.api && window.api.getVersion) {
    try {
      const version = await window.api.getVersion();
      const versionEl = query('app-version');
      if (versionEl) versionEl.textContent = `v${version}`;
    } catch (_err) { /* ignore */ }
  }

  checkAndShowWhatsNew();
  query('theme-toggle')?.addEventListener('click', toggleTheme);
  query('shortcuts-close')?.addEventListener('click', toggleShortcutsOverlay);
  query('whats-new-close')?.addEventListener('click', dismissWhatsNew);
  query('whats-new-dismiss')?.addEventListener('click', dismissWhatsNew);
  query('whats-new-overlay')?.addEventListener('click', (event) => {
    if (event.target.classList.contains('shortcuts-backdrop')) dismissWhatsNew();
  });
  query('shortcuts-overlay')?.addEventListener('click', (event) => {
    if (event.target.classList.contains('shortcuts-backdrop')) toggleShortcutsOverlay();
  });

  document.addEventListener('keydown', (event) => {
    handleReviewKeyDown(event);
    if (
      // keepFocusInsideOverlay will query and trap tab focus inside overlays
      (event.key === 'Tab' && (query('whats-new-overlay')?.getAttribute('aria-hidden') === 'false' || query('shortcuts-overlay')?.getAttribute('aria-hidden') === 'false'))
    ) {
      // Handled by focus-trap listeners
    }
    if (event.ctrlKey && event.shiftKey && event.key === 'D') {
      event.preventDefault();
      toggleTheme();
      return;
    }
    if (event.ctrlKey && event.key === '/') {
      event.preventDefault();
      toggleShortcutsOverlay();
      return;
    }
    if (event.key === 'Escape') {
      const whatsNewOverlay = query('whats-new-overlay');
      const shortcutsOverlay = query('shortcuts-overlay');
      if (whatsNewOverlay && whatsNewOverlay.getAttribute('aria-hidden') === 'false') {
        dismissWhatsNew();
      } else if (shortcutsOverlay && shortcutsOverlay.getAttribute('aria-hidden') === 'false') {
        toggleShortcutsOverlay();
      }
      return;
    }
    if (event.ctrlKey && !event.altKey) {
      const tabMap = { '1': 'ingestion', '2': 'review', '3': 'records' };
      const view = tabMap[event.key];
      if (view) {
        event.preventDefault();
        setActiveView(view);
        render();
        showToast(view === 'review' ? 'Review Queue' : view[0].toUpperCase() + view.slice(1));
        return;
      }
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        query('export-records-btn')?.click();
        return;
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        processSelectedOCR();
        return;
      }
      if (event.key === 'o' || event.key === 'O') {
        event.preventDefault();
        selectDocuments();
        return;
      }
      if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        checkForUpdates();
        return;
      }
    }
  });

  document.addEventListener('focusin', enforceOverlayFocus);
  query('check-updates-btn')?.addEventListener('click', checkForUpdates);
  bindEvents();
  setActiveView('ingestion');
  await loadRecords();
  render();
}

export function handleReviewKeyDown(event) {
  if (state.activeView !== 'review') return;

  const whatsNewOverlay = query('whats-new-overlay');
  const shortcutsOverlay = query('shortcuts-overlay');
  if (whatsNewOverlay && whatsNewOverlay.getAttribute('aria-hidden') !== 'true') return;
  if (shortcutsOverlay && shortcutsOverlay.getAttribute('aria-hidden') !== 'true') return;

  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault();
    saveSelectedReview('Approved');
    return;
  }
  if (event.ctrlKey && event.key === 'Backspace') {
    event.preventDefault();
    saveSelectedReview('Rejected');
    return;
  }
  if (event.ctrlKey && (event.key === 's' || event.key === 'S')) {
    event.preventDefault();
    saveSelectedReview('Corrected');
    return;
  }
  if (event.altKey && event.key === 'ArrowDown') {
    event.preventDefault();
    const index = state.queue.findIndex((item) => item.id === state.selectedId);
    if (index !== -1 && index + 1 < state.queue.length) {
      state.selectedId = state.queue[index + 1].id;
      render();
      setTimeout(() => {
        const field = query('field-first-name');
        if (field && typeof field.focus === 'function') {
          field.focus();
        }
      }, 50);
    }
    return;
  }
  if (event.altKey && event.key === 'ArrowUp') {
    event.preventDefault();
    const index = state.queue.findIndex((item) => item.id === state.selectedId);
    if (index !== -1 && index - 1 >= 0) {
      state.selectedId = state.queue[index - 1].id;
      render();
      setTimeout(() => {
        const field = query('field-first-name');
        if (field && typeof field.focus === 'function') {
          field.focus();
        }
      }, 50);
    }
    return;
  }
  if (event.key === 'Enter') {
    const textInputs = [
      'field-first-name',
      'field-last-name',
      'field-doc-type',
      'field-id-number',
      'field-expiry-date',
      'field-phone-number'
    ];
    if (textInputs.includes(event.target?.id)) {
      event.preventDefault();
      focusNextField(event.target);
    }
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}

// Re-export utility functions for unit testing
export { 
  compareVersions, 
  createQueueItem, 
  getConfidenceStatus, 
  getExtractionNotes, 
  getReviewStatusForExtraction, 
  normalizeExtraction, 
  validateReviewData 
} from './renderer/utils.js';
