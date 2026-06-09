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
  query('tab-ingestion')?.addEventListener('click', () => {
    setActiveView('ingestion');
    render();
  });
  query('tab-review-queue')?.addEventListener('click', () => {
    setActiveView('review');
    render();
  });
  query('tab-records')?.addEventListener('click', () => {
    setActiveView('records');
    render();
  });
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

  searchInput?.addEventListener('input', () => {
    if (spinner) {
      spinner.classList.add('is-searching');
    }
    debouncedSearch();
  });

  query('record-type-filter')?.addEventListener('change', async () => {
    state.pagination.page = 1;
    await loadRecords();
    renderRecords();
  });

  query('records-prev-page')?.addEventListener('click', async () => {
    if (state.pagination.page > 1) {
      state.pagination.page -= 1;
      await loadRecords();
      renderRecords();
    }
  });

  query('records-next-page')?.addEventListener('click', async () => {
    const totalPages = Math.ceil(state.pagination.total / state.pagination.limit);
    if (state.pagination.page < totalPages) {
      state.pagination.page += 1;
      await loadRecords();
      renderRecords();
    }
  });

  query('records-page-size')?.addEventListener('change', async (event) => {
    state.pagination.limit = Number(event.target.value);
    state.pagination.page = 1;
    await loadRecords();
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

  let dragCounter = 0;
  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragCounter++;
    const overlay = query('drag-overlay');
    if (overlay) overlay.style.display = 'flex';
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  window.addEventListener('dragleave', (event) => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      const overlay = query('drag-overlay');
      if (overlay) overlay.style.display = 'none';
    }
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragCounter = 0;
    const overlay = query('drag-overlay');
    if (overlay) overlay.style.display = 'none';
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) addFiles(files);
  });

  // Global document events
  document.addEventListener('keydown', (event) => {
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
}
