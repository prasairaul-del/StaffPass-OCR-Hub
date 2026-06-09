import { state, fields } from './state.js';
import { createQueueItem, getExtractionNotes } from './utils.js';
import { query, text, setStatus } from './dom.js';

let _queueRender = () => {};

export function setQueueRenderCallback(fn) {
  _queueRender = fn;
}

export function getSelectedItem() {
  return state.queue.find((item) => item.id === state.selectedId) || null;
}

export function setActiveView(view) {
  state.activeView = view;
  const panelMap = {
    ingestion: 'ingestion-panel',
    review: 'review-panel'
  };
  const tabMap = {
    ingestion: 'tab-ingestion',
    review: 'tab-review-queue',
    records: 'tab-records'
  };

  Object.entries(panelMap).forEach(([name, id]) => {
    const panel = query(id);
    if (panel) panel.hidden = name !== view;
  });

  const summaryPanel = query('summary-panel');
  if (summaryPanel) {
    summaryPanel.hidden = view === 'records';
  }

  const recordsPanel = query('records-panel');
  if (recordsPanel) {
    recordsPanel.hidden = view !== 'records';
  }

  Object.entries(tabMap).forEach(([name, id]) => {
    const tab = query(id);
    if (!tab) return;
    tab.classList.toggle('is-active', name === view);
    tab.setAttribute('aria-selected', name === view ? 'true' : 'false');
  });

  text('workspace-mode', view === 'review' ? 'Review Queue' : view[0].toUpperCase() + view.slice(1));
}

export function addFiles(filePaths) {
  const paths = filePaths.filter(Boolean);
  if (paths.length === 0) {
    setStatus('No documents selected.');
    return;
  }

  const items = paths.map(f => {
    const path = typeof f === 'string' ? f : (f.path || f);
    const size = typeof f === 'object' && f ? f.size : null;
    return createQueueItem(path, size);
  });
  state.queue.push(...items);
  if (!state.selectedId && items.length > 0) {
    state.selectedId = items[0].id;
  }
  setStatus(`${items.length} document${items.length === 1 ? '' : 's'} added to the queue.`, 'success');
  _queueRender();
}

export function removeIngestedFile(id) {
  state.queue = state.queue.filter(item => item.id !== id);
  if (state.selectedId === id) {
    state.selectedId = state.queue.length > 0 ? state.queue[0].id : null;
  }
  setStatus('Document removed from queue.');
  _queueRender();
}

export function renderIngestionQueue() {
  const body = query('ingestion-queue-body');
  if (!body) return;
  body.innerHTML = '';

  if (state.queue.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'queue-empty';
    cell.textContent = 'No documents ingested yet.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  state.queue.forEach((item) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = item.fileName;
    row.appendChild(nameCell);

    const sizeCell = document.createElement('td');
    sizeCell.textContent = item.fileSize || 'Unknown';
    row.appendChild(sizeCell);

    const statusCell = document.createElement('td');
    statusCell.textContent = item.status;
    row.appendChild(statusCell);

    const actionsCell = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tool-button queue-remove-button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeIngestedFile(item.id));
    actionsCell.appendChild(removeBtn);
    row.appendChild(actionsCell);

    body.appendChild(row);
  });
}

export async function updateDocumentPreview(item) {
  const containers = [query('document-preview-container'), query('review-preview-container')].filter(Boolean);
  if (containers.length === 0) return;

  const setMessage = (message, className = '') => {
    containers.forEach((container) => {
      container.innerHTML = '';
      const span = document.createElement('span');
      span.className = className;
      span.textContent = message;
      container.appendChild(span);
    });
  };

  if (!item) {
    setMessage('No document selected', 'preview-muted');
    return;
  }

  const ext = item.fileName.split('.').pop().toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'].includes(ext);
  const isPdf = ext === 'pdf';

  if (isImage) {
    setMessage('Loading preview...', 'preview-muted');
    try {
      if (window.api && window.api.readAsBase64) {
        const base64Data = await window.api.readAsBase64(item.filePath);
        if (base64Data) {
          containers.forEach((container) => {
            container.innerHTML = '';
            const image = document.createElement('img');
            image.src = base64Data;
            image.alt = item.fileName;
            image.className = 'document-preview-image';
            container.appendChild(image);
          });
          return;
        }
      }
    } catch (err) {
      console.error(err);
    }
    setMessage('Failed to load preview', 'preview-error');
  } else if (isPdf) {
    setMessage('Loading preview...', 'preview-muted');
    try {
      if (window.api && window.api.previewPdfPage) {
        const preview = await window.api.previewPdfPage(item.filePath);
        if (preview && preview.ok && preview.data) {
          containers.forEach((container) => {
            container.innerHTML = '';
            const image = document.createElement('img');
            image.src = `data:${preview.mimeType || 'image/png'};base64,${preview.data}`;
            image.alt = item.fileName;
            image.className = 'document-preview-image';
            if (preview.width) image.width = preview.width;
            if (preview.height) image.height = preview.height;
            container.appendChild(image);
          });
          return;
        }

        const warning = Array.isArray(preview?.warnings) ? preview.warnings.filter(Boolean)[0] : '';
        if (warning) {
          setMessage(warning, 'preview-error');
          return;
        }
      }
    } catch (err) {
      console.error(err);
    }
    setMessage('Failed to load preview', 'preview-error');
  } else {
    setMessage('No preview available for this format', 'preview-muted');
  }
}

export async function selectDocuments() {
  if (!window.api || !window.api.selectDocuments) {
    setStatus('Document picker is unavailable.', 'error');
    return;
  }
  addFiles(await window.api.selectDocuments());
}

export function renderQueue() {
  const body = query('queue-table-body');
  if (!body) return;
  body.innerHTML = '';

  if (state.queue.length === 0) {
    const row = document.createElement('tr');
    row.className = 'queue-empty';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No documents in queue.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  state.queue.forEach((item) => {
    const row = document.createElement('tr');
    row.classList.toggle('is-selected', item.id === state.selectedId);

    const nameCell = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-row-button';
    button.textContent = item.fileName;
    button.addEventListener('click', () => {
      state.selectedId = item.id;
      _queueRender();
    });
    nameCell.appendChild(button);

    [
      item.extraction?.doc_type || '-',
      item.status === 'review' ? item.reviewStatus : item.status,
      item.extraction ? `${item.extraction.confidence_score}%` : '-',
      item.receivedAt
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    row.prepend(nameCell);
    body.appendChild(row);
  });
}

export function renderSelected() {
  const item = getSelectedItem();
  text('document-filename', item?.fileName || '-');
  text('document-source', item?.source || '-');
  text('document-received-at', item?.receivedAt || '-');
  text('document-reviewer', item ? 'Local operator' : '-');
  text('document-status-pill', item ? item.reviewStatus : 'No document selected');
  text('review-status', item ? item.reviewStatus : 'Waiting');

  const notes = item?.error
    || getExtractionNotes(item?.extraction)
    || (item?.extraction ? 'OCR output loaded. Review editable fields before saving.' : 'Select a queued document to view extraction notes and review guidance.');
  text('document-notes', notes);

  const confidence = item?.extraction?.confidence_score || 0;
  text('overall-confidence', `${confidence}%`);

  Object.entries(fields).forEach(([key, id]) => {
    const value = item?.extraction?.[key] || '';
    const el = query(id);
    if (el) {
      if (el.tagName === 'INPUT') {
        el.value = value;
      } else {
        text(id, value || '-');
      }
    }
  });

  const notesEl = query('correction-notes');
  if (notesEl) {
    notesEl.value = item?.notes || getExtractionNotes(item?.extraction);
  }

  // Clear inline warnings
  const warnings = ['first-name', 'last-name', 'id-number', 'doc-type', 'expiry-date'];
  warnings.forEach(w => {
    const el = query(`warn-${w}`);
    if (el) el.classList.remove('is-visible');
  });

  _setValidationErrors([]);
  updateDocumentPreview(item);
}

let _setValidationErrors = () => {};
export function setValidationErrorsCallback(fn) {
  _setValidationErrors = fn;
}

export function renderMetrics() {
  const pending = state.queue.filter((item) => ['queued', 'processing', 'review'].includes(item.status)).length;
  const corrections = state.queue.filter((item) => item.reviewStatus === 'Manual Review Required').length;
  text('queue-count', `${pending} awaiting review`);
  text('pending-count', String(pending));
  text('correction-count', String(corrections));
  text('selected-document-state', getSelectedItem()?.fileName || 'None');
}
