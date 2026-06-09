import { state } from './state.js';
import { query, setStatus, focusNextField } from './dom.js';
import { debounce } from './utils.js';
import { 
  setActiveView, 
  addFiles, 
  selectDocuments 
} from './queue.js';
import { 
  renderRecords, 
  saveSelectedReview, 
  loadRecords, 
  exportRecords 
} from './review.js';
import { processSelectedOCR } from './ocr.js';
import { 
  toggleTheme, 
  toggleShortcutsOverlay, 
  dismissWhatsNew, 
  checkForUpdates,
  showToast 
} from './overlays.js';

export function handleReviewKeyDown(event, render) {
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

export function bindEvents(render) {
  const registered = [];
  
  function add(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    registered.push({ target, event, handler });
  }

  add(query('tab-ingestion'), 'click', () => {
    setActiveView('ingestion');
    render();
  });
  add(query('tab-review-queue'), 'click', () => {
    setActiveView('review');
    render();
  });
  add(query('tab-records'), 'click', () => {
    setActiveView('records');
    render();
  });
  add(query('process-selected'), 'click', processSelectedOCR);
  add(query('clear-queue-btn'), 'click', () => {
    state.queue = [];
    state.selectedId = null;
    setStatus('Queue cleared.');
    render();
  });
  add(query('refresh-queue-btn'), 'click', async () => {
    await loadRecords();
    render();
    setStatus('Workspace refreshed.');
  });
  add(query('refresh-records'), 'click', async () => {
    await loadRecords();
    render();
    setStatus('Records refreshed.');
  });
  add(query('export-records-btn'), 'click', exportRecords);
  add(query('approve-btn'), 'click', () => saveSelectedReview('Approved'));
  add(query('reject-btn'), 'click', () => saveSelectedReview('Rejected'));
  add(query('correct-btn'), 'click', () => saveSelectedReview('Corrected'));
  add(query('save-corrections-btn'), 'click', () => saveSelectedReview('Corrected'));

  const searchInput = query('record-search-input');
  const spinner = query('search-spinner');

  const debouncedSearch = debounce(async () => {
    state.pagination.page = 1;
    await loadRecords();
    renderRecords();
    if (spinner) {
      spinner.classList.remove('is-searching');
    }
  }, 250);

  add(searchInput, 'input', () => {
    if (spinner) {
      spinner.classList.add('is-searching');
    }
    debouncedSearch();
  });

  add(query('record-type-filter'), 'change', async () => {
    state.pagination.page = 1;
    await loadRecords();
    renderRecords();
  });

  add(query('records-prev-page'), 'click', async () => {
    if (state.pagination.page > 1) {
      state.pagination.page -= 1;
      await loadRecords();
      renderRecords();
    }
  });

  add(query('records-next-page'), 'click', async () => {
    const totalPages = Math.ceil(state.pagination.total / state.pagination.limit);
    if (state.pagination.page < totalPages) {
      state.pagination.page += 1;
      await loadRecords();
      renderRecords();
    }
  });

  add(query('records-page-size'), 'change', async (event) => {
    state.pagination.limit = Number(event.target.value);
    state.pagination.page = 1;
    await loadRecords();
    renderRecords();
  });

  add(query('file-input'), 'change', (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) addFiles(files);
    event.target.value = '';
  });

  add(query('drop-zone'), 'keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDocuments();
    }
  });

  const dropZone = query('drop-zone');
  if (dropZone) {
    add(dropZone, 'dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
    add(dropZone, 'dragleave', () => dropZone.classList.remove('is-dragging'));
    add(dropZone, 'drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length > 0) addFiles(files);
    });
  }

  let dragCounter = 0;
  add(window, 'dragenter', (event) => {
    event.preventDefault();
    dragCounter++;
    const overlay = query('drag-overlay');
    if (overlay) overlay.style.display = 'flex';
  });

  add(window, 'dragover', (event) => {
    event.preventDefault();
  });

  add(window, 'dragleave', (event) => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      const overlay = query('drag-overlay');
      if (overlay) overlay.style.display = 'none';
    }
  });

  add(window, 'drop', (event) => {
    event.preventDefault();
    dragCounter = 0;
    const overlay = query('drag-overlay');
    if (overlay) overlay.style.display = 'none';
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) addFiles(files);
  });

  const handleBlurOrDragend = () => {
    dragCounter = 0;
    const overlay = query('drag-overlay');
    if (overlay) overlay.style.display = 'none';
  };
  add(window, 'blur', handleBlurOrDragend);
  add(window, 'dragend', handleBlurOrDragend);

  // Global document events
  add(document, 'keydown', (event) => {
    handleReviewKeyDown(event, render);
    
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

  add(query('theme-toggle'), 'click', toggleTheme);
  add(query('shortcuts-close'), 'click', toggleShortcutsOverlay);
  add(query('whats-new-close'), 'click', dismissWhatsNew);
  add(query('whats-new-dismiss'), 'click', dismissWhatsNew);
  add(query('whats-new-overlay'), 'click', (event) => {
    if (event.target.classList.contains('shortcuts-backdrop')) dismissWhatsNew();
  });
  add(query('shortcuts-overlay'), 'click', (event) => {
    if (event.target.classList.contains('shortcuts-backdrop')) toggleShortcutsOverlay();
  });

  return function cleanup() {
    registered.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
  };
}
