import { query, enforceOverlayFocus } from './renderer/dom.js';
import { 
  renderMetrics, 
  renderIngestionQueue, 
  renderQueue, 
  renderSelected, 
  setActiveView 
} from './renderer/queue.js';
import { 
  renderRecords, 
  loadRecords, 
  setValidationErrors,
  setReviewRenderCallback
} from './renderer/review.js';
import { 
  setupModelDownloadUI,
  setOcrRenderCallback
} from './renderer/ocr.js';
import { 
  applyTheme, 
  loadSavedTheme, 
  checkAndShowWhatsNew, 
  setupAutoUpdateUI 
} from './renderer/overlays.js';
import { bindEvents } from './renderer/events.js';
import { setQueueRenderCallback, setValidationErrorsCallback } from './renderer/queue.js';

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
  document.addEventListener('focusin', enforceOverlayFocus);
  
  bindEvents(render);
  
  setActiveView('ingestion');
  await loadRecords();
  render();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}

// Re-export utility functions for unit testing compatibility
export { 
  compareVersions, 
  createQueueItem, 
  debounce,
  getConfidenceStatus, 
  getExtractionNotes, 
  getReviewStatusForExtraction, 
  normalizeExtraction, 
  validateReviewData 
} from './renderer/utils.js';
