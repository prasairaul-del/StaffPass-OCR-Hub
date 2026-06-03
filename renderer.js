const state = {
  activeView: 'ingestion',
  queue: [],
  selectedId: null,
  records: []
};

const fields = {
  first_name: 'field-first-name',
  last_name: 'field-last-name',
  doc_number: 'field-id-number',
  doc_type: 'field-doc-type',
  expiry_date: 'field-expiry-date',
  phone_number: 'field-phone-number'
};

function getConfidenceStatus(score) {
  const value = Number(score) || 0;
  if (value >= 95) return 'Trusted';
  if (value >= 80) return 'Review Recommended';
  return 'Manual Review Required';
}

function validateReviewData(data) {
  const errors = [];
  if (!String(data.first_name || '').trim()) errors.push('First name is required.');
  if (!String(data.last_name || '').trim()) errors.push('Last name is required.');
  if (!String(data.doc_type || '').trim()) errors.push('Document type is required.');
  if (!String(data.doc_number || '').trim()) errors.push('Document number is required.');
  return errors;
}

function normalizeExtraction(result = {}) {
  return {
    first_name: result.first_name || '',
    last_name: result.last_name || '',
    doc_type: result.doc_type || '',
    doc_number: result.doc_number || '',
    expiry_date: result.expiry_date || '',
    phone_number: result.phone_number || '',
    confidence_score: Number(result.confidence_score || result.confidence || 0)
  };
}

function createQueueItem(filePath) {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    filePath,
    fileName,
    source: filePath,
    receivedAt: new Date().toLocaleString(),
    status: 'queued',
    reviewStatus: 'Pending Review',
    extraction: null,
    error: null
  };
}

function query(id) {
  return document.getElementById(id);
}

function text(id, value) {
  const element = query(id);
  if (element) element.textContent = value;
}

function setStatus(message, tone = 'neutral') {
  const status = query('app-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function getSelectedItem() {
  return state.queue.find((item) => item.id === state.selectedId) || null;
}

function setActiveView(view) {
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

function addFiles(filePaths) {
  const paths = filePaths.filter(Boolean);
  if (paths.length === 0) {
    setStatus('No documents selected.');
    return;
  }

  const items = paths.map(createQueueItem);
  state.queue.push(...items);
  state.selectedId = items[0].id;
  setActiveView('review');
  setStatus(`${items.length} document${items.length === 1 ? '' : 's'} added to the queue.`, 'success');
  render();
}

async function selectDocuments() {
  if (!window.api || !window.api.selectDocuments) {
    setStatus('Document picker is unavailable.', 'error');
    return;
  }
  addFiles(await window.api.selectDocuments());
}

async function processSelectedOCR() {
  const item = getSelectedItem();
  if (!item) {
    setStatus('Select a queued document before running OCR.', 'error');
    return;
  }
  if (!window.api || !window.api.processOCR) {
    setStatus('OCR bridge is unavailable.', 'error');
    return;
  }

  item.status = 'processing';
  item.error = null;
  setStatus(`Processing ${item.fileName}...`);
  render();

  try {
    item.extraction = normalizeExtraction(await window.api.processOCR(item.filePath));
    item.status = 'review';
    item.reviewStatus = getConfidenceStatus(item.extraction.confidence_score);
    setStatus(`${item.fileName} is ready for review.`, 'success');
  } catch (error) {
    item.status = 'error';
    item.error = error.message || 'OCR failed.';
    setStatus(item.error, 'error');
  }

  render();
}

function readInspectorData() {
  const data = {};
  Object.entries(fields).forEach(([key, id]) => {
    data[key] = (query(id)?.textContent || '').replace(/^-$/, '').trim();
  });
  const selected = getSelectedItem();
  data.confidence_score = selected?.extraction?.confidence_score || 0;
  const notesEl = query('correction-notes');
  data.notes = notesEl ? notesEl.value.trim() : '';
  return data;
}

function setValidationErrors(errors) {
  const list = query('validation-errors');
  if (!list) return;
  list.innerHTML = '';
  errors.forEach((error) => {
    const item = document.createElement('li');
    item.textContent = error;
    list.appendChild(item);
  });
}

async function saveSelectedReview(reviewStatus) {
  const item = getSelectedItem();
  if (!item || !item.extraction) {
    setStatus('Run OCR before saving review decisions.', 'error');
    return;
  }

  const data = readInspectorData();
  const errors = validateReviewData(data);
  if (errors.length > 0) {
    setValidationErrors(errors);
    setStatus(errors[0], 'error');
    return;
  }

  const payload = {
    ...data,
    file_path: item.filePath,
    review_status: reviewStatus
  };

  try {
    if (window.api && window.api.saveReview) {
      await window.api.saveReview(payload);
    }
    item.notes = data.notes;
    item.extraction = data;
    item.status = reviewStatus === 'Rejected' ? 'rejected' : 'approved';
    item.reviewStatus = reviewStatus;
    setStatus(`${item.fileName} saved as ${reviewStatus.toLowerCase()}.`, 'success');
    await loadRecords();
  } catch (error) {
    setStatus(error.message || 'Could not save review.', 'error');
  }

  render();
}

async function loadRecords() {
  if (!window.api || !window.api.listRecords) return;
  state.records = await window.api.listRecords();
}

function renderMetrics() {
  const pending = state.queue.filter((item) => ['queued', 'processing', 'review'].includes(item.status)).length;
  const corrections = state.queue.filter((item) => item.reviewStatus === 'Manual Review Required').length;
  text('queue-count', `${pending} awaiting review`);
  text('pending-count', String(pending));
  text('correction-count', String(corrections));
  text('selected-document-state', getSelectedItem()?.fileName || 'None');
}

function renderQueue() {
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
      render();
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

function renderSelected() {
  const item = getSelectedItem();
  text('document-filename', item?.fileName || '-');
  text('document-source', item?.source || '-');
  text('document-received-at', item?.receivedAt || '-');
  text('document-reviewer', item ? 'Local operator' : '-');
  text('document-status-pill', item ? item.reviewStatus : 'No document selected');
  text('review-status', item ? item.reviewStatus : 'Waiting');

  const notes = item?.error
    || (item?.extraction ? 'OCR output loaded. Review editable fields before saving.' : 'Select a queued document to view extraction notes and review guidance.');
  text('document-notes', notes);

  const confidence = item?.extraction?.confidence_score || 0;
  text('overall-confidence', `${confidence}%`);

  Object.entries(fields).forEach(([key, id]) => {
    const value = item?.extraction?.[key] || '-';
    text(id, value);
  });

  const notesEl = query('correction-notes');
  if (notesEl) {
    notesEl.value = item?.notes || '';
  }

  setValidationErrors([]);
}

function renderRecords() {
  const body = query('records-table-body');
  if (!body) return;
  body.innerHTML = '';

  if (state.records.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = 'No approved records saved yet.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  state.records.forEach((record) => {
    const row = document.createElement('tr');
    [
      `${record.first_name || ''} ${record.last_name || ''}`.trim(),
      record.doc_type,
      record.doc_number,
      record.expiry_date || '-',
      record.notes || '-',
      `${record.confidence_score || 0}%`,
      record.review_status
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value || '-';
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

function render() {
  renderMetrics();
  renderQueue();
  renderSelected();
  renderRecords();
}

function bindEvents() {
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
  query('export-records-btn')?.addEventListener('click', () => {
    setStatus('Export is not part of the MVP workflow yet.');
  });
  query('approve-btn')?.addEventListener('click', () => saveSelectedReview('Approved'));
  query('reject-btn')?.addEventListener('click', () => saveSelectedReview('Rejected'));
  query('correct-btn')?.addEventListener('click', () => saveSelectedReview('Corrected'));
  query('save-corrections-btn')?.addEventListener('click', () => saveSelectedReview('Corrected'));

  query('file-input')?.addEventListener('change', (event) => {
    const paths = Array.from(event.target.files || []).map((file) => file.path).filter(Boolean);
    if (paths.length > 0) addFiles(paths);
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
      addFiles(Array.from(event.dataTransfer.files || []).map((file) => file.path).filter(Boolean));
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = query('theme-toggle');
  if (toggle) {
    const isDark = theme === 'dark';
    toggle.setAttribute('aria-checked', String(isDark));
  }
}

let toastTimer = null;

function showToast(message) {
  const toast = query('toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2200);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('staffpass-theme', next); } catch (_err) { /* ignore */ }
  showToast(next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled');
}

function loadSavedTheme() {
  try {
    const saved = localStorage.getItem('staffpass-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (_err) { /* ignore */ }
  return 'light';
}

async function init() {
  applyTheme(loadSavedTheme());
  query('theme-toggle')?.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'D') {
      event.preventDefault();
      toggleTheme();
      return;
    }
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const tabMap = { '1': 'ingestion', '2': 'review', '3': 'records' };
      const view = tabMap[event.key];
      if (view) {
        event.preventDefault();
        setActiveView(view);
        render();
        showToast(view === 'review' ? 'Review Queue' : view[0].toUpperCase() + view.slice(1));
      }
    }
  });
  bindEvents();
  setActiveView('ingestion');
  await loadRecords();
  render();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined') {
  module.exports = {
    createQueueItem,
    getConfidenceStatus,
    normalizeExtraction,
    validateReviewData
  };
}
