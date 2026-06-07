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
  
  const expiry = String(data.expiry_date || '').trim();
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    errors.push('Expiry date format must be YYYY-MM-DD.');
  }
  return errors;
}

function normalizeExtraction(result = {}) {
  const structured = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data');
  const data = structured ? (result.data || {}) : result;
  return {
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    doc_type: data.doc_type || '',
    doc_number: data.doc_number || '',
    expiry_date: data.expiry_date || '',
    phone_number: data.phone_number || '',
    confidence_score: Number(data.confidence_score || data.confidence || 0),
    notes: data.notes || '',
    ok: structured ? Boolean(result.ok) : true,
    degraded: structured ? Boolean(result.degraded) : false,
    engine: structured ? (result.engine || 'unknown') : 'legacy',
    warnings: structured && Array.isArray(result.warnings) ? result.warnings : []
  };
}

function getReviewStatusForExtraction(extraction) {
  if (extraction && extraction.degraded) return 'Manual Review Required';
  return getConfidenceStatus(extraction?.confidence_score || 0);
}

function getExtractionNotes(extraction) {
  if (!extraction) return '';
  const warnings = Array.isArray(extraction.warnings) ? extraction.warnings.filter(Boolean) : [];
  if (warnings.length > 0) return warnings.join(' ');
  return extraction.notes || '';
}

function createQueueItem(filePath, fileSize = null) {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  let sizeStr = 'Unknown';
  if (fileSize !== null) {
    if (fileSize < 1024) sizeStr = `${fileSize} B`;
    else if (fileSize < 1024 * 1024) sizeStr = `${(fileSize / 1024).toFixed(1)} KB`;
    else sizeStr = `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    filePath,
    fileName,
    fileSize: sizeStr,
    source: filePath,
    receivedAt: new Date().toLocaleString(),
    status: 'queued',
    reviewStatus: 'Pending Review',
    extraction: null,
    error: null
  };
}

function getOverlayFocusableElements(overlay) {
  if (!overlay || !overlay.querySelectorAll) return [];
  return Array.from(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.disabled && element.offsetParent !== null);
}

function restorePreviouslyFocusedElement() {
  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
    previouslyFocusedElement.focus();
  }
  previouslyFocusedElement = null;
}

function focusOverlayTarget(overlay, preferredSelector = null) {
  if (!overlay) return;
  const preferred = preferredSelector ? overlay.querySelector(preferredSelector) : null;
  if (preferred && typeof preferred.focus === 'function') {
    preferred.focus();
    return;
  }
  const focusable = getOverlayFocusableElements(overlay);
  if (focusable.length > 0 && typeof focusable[0].focus === 'function') {
    focusable[0].focus();
  }
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
  render();
}

function removeIngestedFile(id) {
  state.queue = state.queue.filter(item => item.id !== id);
  if (state.selectedId === id) {
    state.selectedId = state.queue.length > 0 ? state.queue[0].id : null;
  }
  setStatus('Document removed from queue.');
  render();
}

function renderIngestionQueue() {
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

async function updateDocumentPreview(item) {
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

async function selectDocuments() {
  if (!window.api || !window.api.selectDocuments) {
    setStatus('Document picker is unavailable.', 'error');
    return;
  }
  addFiles(await window.api.selectDocuments());
}

let isBatchProcessing = false;

async function processBatchOCR() {
  if (isBatchProcessing) return;

  const itemsToProcess = state.queue.filter(item => ['queued', 'error'].includes(item.status));
  if (itemsToProcess.length === 0) {
    setStatus('No pending documents to process.', 'error');
    return;
  }

  if (!window.api || !window.api.processOCR) {
    setStatus('OCR bridge is unavailable.', 'error');
    return;
  }

  isBatchProcessing = true;
  const batchContainer = query('batch-progress-container');
  const batchProgressBar = query('batch-progress-bar');
  const batchProgressText = query('batch-progress-text');

  if (batchContainer) batchContainer.classList.add('batch-progress-container', 'is-visible');

  const stepPrep = query('step-preparing');
  const stepRun = query('step-running');
  const stepSave = query('step-saving');

  const updateStep = (stepEl, stepState) => {
    if (!stepEl) return;
    stepEl.className = 'checklist-step';
    const icon = stepEl.querySelector('.step-icon');
    if (stepState === 'pending') {
      if (icon) icon.textContent = 'o';
    } else if (stepState === 'active') {
      stepEl.classList.add('is-active');
      if (icon) icon.textContent = '*';
    } else if (stepState === 'completed') {
      stepEl.classList.add('is-completed');
      if (icon) icon.textContent = 'v';
    }
  };

  setStatus(`Starting batch OCR on ${itemsToProcess.length} documents...`);

  for (let i = 0; i < itemsToProcess.length; i++) {
    const item = itemsToProcess[i];
    state.selectedId = item.id;
    item.status = 'processing';
    item.error = null;

    if (batchProgressText) {
      batchProgressText.textContent = `Processing ${i + 1} of ${itemsToProcess.length}: ${item.fileName}`;
    }
    if (batchProgressBar) {
      batchProgressBar.value = Math.round((i / itemsToProcess.length) * 100);
    }

    render();

    // Step 1: Preparing
    updateStep(stepPrep, 'active');
    updateStep(stepRun, 'pending');
    updateStep(stepSave, 'pending');
    await new Promise(r => setTimeout(r, 600));

    // Step 2: Running Model
    updateStep(stepPrep, 'completed');
    updateStep(stepRun, 'active');
    await new Promise(r => setTimeout(r, 400));

    try {
      const rawResult = await window.api.processOCR(item.filePath);
      item.extraction = normalizeExtraction(rawResult);
      item.status = 'review';
      item.reviewStatus = getReviewStatusForExtraction(item.extraction);
      item.notes = getExtractionNotes(item.extraction);
      if (item.extraction.degraded) {
        setStatus(item.notes || 'OCR degraded. Manual review is required.', 'error');
      }

      // Step 3: Saving
      updateStep(stepRun, 'completed');
      updateStep(stepSave, 'active');
      await new Promise(r => setTimeout(r, 500));
      updateStep(stepSave, 'completed');

    } catch (error) {
      item.status = 'error';
      item.error = error.message || 'OCR failed.';
      updateStep(stepRun, 'pending');
      updateStep(stepSave, 'pending');
      setStatus(item.error, 'error');
    }

    render();
    await new Promise(r => setTimeout(r, 500));
  }

  if (batchProgressBar) batchProgressBar.value = 100;
  if (batchProgressText) batchProgressText.textContent = `Completed batch processing of ${itemsToProcess.length} files.`;

  isBatchProcessing = false;
  setStatus('Batch processing complete.', 'success');

  setActiveView('review');
  render();

  setTimeout(() => {
    if (batchContainer) batchContainer.classList.remove('is-visible');
  }, 3000);
}

async function processSelectedOCR() {
  await processBatchOCR();
}

async function downloadModel() {
  const btn = query('download-model-btn');
  const statusEl = query('model-download-status');
  if (!window.api || !window.api.downloadModel) {
    setStatus('Model download is unavailable.', 'error');
    return;
  }

  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Downloading...';
  setStatus('Downloading OCR model...');

  const removeListener = window.api.onDownloadStatus((status) => {
    if (statusEl) {
      statusEl.textContent = status.message;
    }
    if (status.state === 'progress') {
      setStatus(status.message);
    } else if (status.state === 'success') {
      setStatus(status.message, 'success');
      if (btn) btn.disabled = false;
      removeListener();
    } else if (status.state === 'error') {
      setStatus(status.message, 'error');
      if (btn) btn.disabled = false;
      removeListener();
    }
  });

  try {
    await window.api.downloadModel();
  } catch (error) {
    setStatus(error.message || 'Model download failed.', 'error');
    if (statusEl) statusEl.textContent = 'Failed';
    if (btn) btn.disabled = false;
    removeListener();
  }
}

function readInspectorData() {
  const data = {};
  Object.entries(fields).forEach(([key, id]) => {
    const el = query(id);
    if (el) {
      if (el.tagName === 'INPUT') {
        data[key] = (el.value || '').replace(/^-$/, '').trim();
      } else {
        data[key] = (el.textContent || '').replace(/^-$/, '').trim();
      }
    }
  });
  const selected = getSelectedItem();
  data.confidence_score = selected?.extraction?.confidence_score || 0;
  const notesEl = query('correction-notes');
  data.notes = notesEl ? notesEl.value.trim() : '';
  return data;
}

function displayInlineWarnings(errors) {
  const warnings = ['first-name', 'last-name', 'id-number', 'doc-type', 'expiry-date'];
  warnings.forEach(w => {
    const el = query(`warn-${w}`);
    if (el) el.classList.remove('is-visible');
  });

  errors.forEach(err => {
    if (err.includes('First name')) {
      const el = query('warn-first-name');
      if (el) el.classList.add('is-visible');
    } else if (err.includes('Last name')) {
      const el = query('warn-last-name');
      if (el) el.classList.add('is-visible');
    } else if (err.includes('Document number')) {
      const el = query('warn-id-number');
      if (el) el.classList.add('is-visible');
    } else if (err.includes('Document type')) {
      const el = query('warn-doc-type');
      if (el) el.classList.add('is-visible');
    } else if (err.includes('Expiry date') || err.includes('date format')) {
      const el = query('warn-expiry-date');
      if (el) el.classList.add('is-visible');
    }
  });
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
  displayInlineWarnings(errors);
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

function escapeCsvValue(value) {
  const textValue = value == null ? '' : String(value);
  if (/[",\r\n]/.test(textValue)) {
    return `"${textValue.replace(/"/g, '""')}"`;
  }
  return textValue;
}

function recordsToCsv(records) {
  const columns = [
    ['first_name', 'First Name'],
    ['last_name', 'Last Name'],
    ['phone_number', 'Phone Number'],
    ['doc_type', 'Document Type'],
    ['doc_number', 'Document Number'],
    ['expiry_date', 'Expiry Date'],
    ['confidence_score', 'Confidence Score'],
    ['review_status', 'Review Status'],
    ['notes', 'Notes'],
    ['uploaded_at', 'Uploaded At']
  ];
  const rows = [columns.map(([, heading]) => heading)];
  (records || []).forEach((record) => {
    rows.push(columns.map(([key]) => record[key]));
  });
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}

async function exportRecords() {
  if (!window.api || !window.api.exportRecords) {
    setStatus('Export is unavailable.', 'error');
    return;
  }

  try {
    const result = await window.api.exportRecords({ format: 'csv' });
    if (result && result.canceled) {
      setStatus('Export canceled.');
      return;
    }
    setStatus(`Exported ${result.rowCount || 0} record${result.rowCount === 1 ? '' : 's'} to CSV.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Could not export records.', 'error');
  }
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

  setValidationErrors([]);
  updateDocumentPreview(item);
}

function renderRecords() {
  const body = query('records-table-body');
  if (!body) return;
  body.innerHTML = '';

  const searchText = (query('record-search-input')?.value || '').toLowerCase().trim();
  const typeFilter = query('record-type-filter')?.value || '';

  const filteredRecords = state.records.filter((record) => {
    if (typeFilter && record.doc_type !== typeFilter) {
      return false;
    }
    if (searchText) {
      const firstName = (record.first_name || '').toLowerCase();
      const lastName = (record.last_name || '').toLowerCase();
      const docNum = (record.doc_number || '').toLowerCase();
      const docType = (record.doc_type || '').toLowerCase();
      
      const matchSearch = firstName.includes(searchText) || 
                          lastName.includes(searchText) || 
                          docNum.includes(searchText) || 
                          docType.includes(searchText);
      if (!matchSearch) return false;
    }
    return true;
  });

  if (filteredRecords.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = 'No approved records saved yet.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  filteredRecords.forEach((record) => {
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
  renderIngestionQueue();
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

let previouslyFocusedElement = null;

function toggleShortcutsOverlay() {
  const overlay = query('shortcuts-overlay');
  if (!overlay) return;
  const isHidden = overlay.getAttribute('aria-hidden') === 'true';
  if (isHidden) {
    previouslyFocusedElement = document.activeElement;
    overlay.setAttribute('aria-hidden', 'false');
    focusOverlayTarget(overlay, '#shortcuts-close');
  } else {
    overlay.setAttribute('aria-hidden', 'true');
    restorePreviouslyFocusedElement();
  }
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

function parseReleaseNotes(markdown) {
  if (!markdown) return null;
  const sections = [];
  let currentSection = null;

  markdown.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      currentSection = { heading: trimmed.slice(4).trim(), items: [] };
      sections.push(currentSection);
    } else if (trimmed.startsWith('- ') && currentSection) {
      currentSection.items.push(trimmed.slice(2).trim());
    } else if (trimmed.startsWith('* ') && currentSection) {
      currentSection.items.push(trimmed.slice(2).trim());
    }
  });

  if (sections.length === 0 && markdown.trim()) {
    sections.push({ heading: 'Changes', items: markdown.trim().split('\n').filter(Boolean) });
  }

  return sections.length > 0 ? sections : null;
}

async function fetchReleaseNotes(version) {
  // Check cache first to avoid GitHub API rate limits
  try {
    const cached = localStorage.getItem(`staffpass-release-notes-${version}`);
    if (cached) return JSON.parse(cached);
  } catch (_err) { /* ignore */ }

  if (!window.api || !window.api.fetchReleaseNotes) return null;
  try {
    const result = await window.api.fetchReleaseNotes(version);
    const sections = parseReleaseNotes(result.body);
    if (sections) {
      try { localStorage.setItem(`staffpass-release-notes-${version}`, JSON.stringify(sections)); } catch (_err) { /* ignore */ }
    }
    return sections;
  } catch (_err) {
    return null;
  }
}

function showWhatsNewDialog(version, sections) {
  const overlay = query('whats-new-overlay');
  if (!overlay) return;

  text('whats-new-version', `v${version}`);

  const body = query('whats-new-body');
  if (body) {
    body.innerHTML = '';
    if (sections && sections.length > 0) {
      sections.forEach((section) => {
        const heading = document.createElement('h3');
        heading.textContent = section.heading;
        body.appendChild(heading);
        const list = document.createElement('ul');
        section.items.forEach((item) => {
          const li = document.createElement('li');
          li.textContent = item;
          list.appendChild(li);
        });
        body.appendChild(list);
      });
    } else {
      const p = document.createElement('p');
      p.textContent = 'Bug fixes and improvements.';
      body.appendChild(p);
    }
  }

  overlay.setAttribute('aria-hidden', 'false');
  previouslyFocusedElement = document.activeElement;
  focusOverlayTarget(overlay, '#whats-new-close');
}

function dismissWhatsNew() {
  const overlay = query('whats-new-overlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  restorePreviouslyFocusedElement();
}

function keepFocusInsideOverlay(event, overlayId) {
  if (event.key !== 'Tab') return false;
  const overlay = query(overlayId);
  if (!overlay || overlay.getAttribute('aria-hidden') !== 'false') return false;

  const focusable = getOverlayFocusableElements(overlay);
  if (focusable.length === 0) return false;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;
  const focusIsInsideOverlay = typeof overlay.contains === 'function'
    ? overlay.contains(activeElement)
    : activeElement === first || activeElement === last;

  if (!focusIsInsideOverlay) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function enforceOverlayFocus(event) {
  const overlayIds = ['whats-new-overlay', 'shortcuts-overlay'];
  const activeOverlay = overlayIds.map(query).find((overlay) => overlay && overlay.getAttribute('aria-hidden') === 'false');
  if (!activeOverlay) return;
  if (typeof activeOverlay.contains === 'function' && activeOverlay.contains(event.target)) return;
  focusOverlayTarget(activeOverlay);
}

function saveSeenVersion(version) {
  try { localStorage.setItem('staffpass-last-seen-version', version); } catch (_err) { /* ignore */ }
}

function getSeenVersion() {
  try { return localStorage.getItem('staffpass-last-seen-version'); } catch (_err) { return null; }
}

async function checkAndShowWhatsNew() {
  if (!window.api || !window.api.getVersion) return;
  try {
    const version = await window.api.getVersion();
    const seen = getSeenVersion();
    if (!seen || compareVersions(version, seen) > 0) {
      const sections = await fetchReleaseNotes(version);
      showWhatsNewDialog(version, sections);
    }
    saveSeenVersion(version);
  } catch (_err) { /* ignore */ }
}

function checkForUpdates() {
  if (!window.api || !window.api.checkForUpdates) return;
  window.api.checkForUpdates();
}

function setupAutoUpdateUI() {
  if (!window.api || !window.api.onUpdateStatus) return;

  window.api.onUpdateStatus((status) => {
    switch (status.state) {
      case 'checking':
        showToast('Checking for updates...');
        break;
      case 'available':
        showToast(`Update v${status.version} available - downloading...`);
        break;
      case 'downloading':
        showToast(`Downloading update... ${status.percent}%`);
        break;
      case 'downloaded':
        showUpdateReadyBanner(status.version);
        break;
      case 'not-available':
        // Silently ignore - no need to notify the user they're up to date
        break;
      case 'error':
        // Silently ignore - updater errors are logged in the main process
        break;
    }
  });
}

function showUpdateReadyBanner(version) {
  let banner = query('update-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.setAttribute('role', 'alert');
    document.body.appendChild(banner);
  }

  banner.innerHTML = '';

  const text = document.createElement('span');
  text.textContent = `Update v${version} is ready to install. `;
  banner.appendChild(text);

  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.className = 'update-banner-btn';
  installBtn.textContent = 'Restart & Install';
  installBtn.addEventListener('click', () => {
    if (window.api && window.api.installUpdate) {
      window.api.installUpdate();
    }
  });
  banner.appendChild(installBtn);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'update-banner-dismiss';
  dismissBtn.textContent = 'x';
  dismissBtn.setAttribute('aria-label', 'Dismiss update notification');
  dismissBtn.addEventListener('click', () => {
    banner.remove();
  });
  banner.appendChild(dismissBtn);
}

async function loadVersion() {
  if (!window.api || !window.api.getVersion) return;
  try {
    const version = await window.api.getVersion();
    text('app-version', `v${version}`);
  } catch (_err) { /* ignore */ }
}

function setupModelDownloadUI() {
  const btn = query('download-model-btn');
  const statusEl = query('model-download-status');
  const progressContainer = query('model-progress-container');
  const progressBar = query('model-progress-bar');
  const progressDetail = query('model-progress-detail');
  if (!btn || !window.api || !window.api.downloadModel) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    if (statusEl) statusEl.textContent = 'Starting download...';
    if (progressContainer) progressContainer.classList.add('is-visible');
    if (progressBar) progressBar.value = 0;
    if (progressDetail) progressDetail.textContent = '0% (Connecting...)';
    showToast('Starting OCR Model download...');

    try {
      await window.api.downloadModel();
      btn.textContent = 'Download OCR Model';
      btn.disabled = false;
      if (statusEl) statusEl.textContent = 'Ready (Cached)';
      if (progressContainer) progressContainer.classList.remove('is-visible');
      showToast('OCR Model cached successfully!');
    } catch (error) {
      btn.textContent = 'Download OCR Model';
      btn.disabled = false;
      if (statusEl) statusEl.textContent = 'Failed';
      showToast(`Download failed: ${error.message}`);
    }
  });

  if (window.api.onDownloadStatus) {
    window.api.onDownloadStatus((progress) => {
      const lastText = progress.trim();
      if (!lastText) return;

      const percentMatch = lastText.match(/(\d+)%/);
      const sizeMatch = lastText.match(/([\d\.]+[GMK]B?)\/([\d\.]+[GMK]B?)/i);
      const speedMatch = lastText.match(/([\d\.]+\s*[GMK]B\/s)/i);

      if (percentMatch) {
        const percent = parseInt(percentMatch[1], 10);
        if (progressBar) progressBar.value = percent;
        
        let details = `${percent}%`;
        if (sizeMatch) details += ` (${sizeMatch[0]})`;
        if (speedMatch) details += ` @ ${speedMatch[1]}`;
        
        if (progressDetail) progressDetail.textContent = details;
        if (statusEl) statusEl.textContent = 'Downloading weights...';
      } else {
        const lines = lastText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          const currentTask = lines[lines.length - 1];
          if (statusEl) statusEl.textContent = currentTask;
          if (progressDetail && !currentTask.includes('%')) {
            progressDetail.textContent = currentTask;
          }
        }
      }
    });
  }
}

async function init() {
  applyTheme(loadSavedTheme());
  setupAutoUpdateUI();
  setupModelDownloadUI();
  loadVersion();
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
    if (keepFocusInsideOverlay(event, 'whats-new-overlay') || keepFocusInsideOverlay(event, 'shortcuts-overlay')) {
      return;
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
        event.preventDefault();
        dismissWhatsNew();
      } else if (shortcutsOverlay && shortcutsOverlay.getAttribute('aria-hidden') === 'false') {
        event.preventDefault();
        toggleShortcutsOverlay();
      }
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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined') {
  module.exports = {
    createQueueItem,
    escapeCsvValue,
    getConfidenceStatus,
    getExtractionNotes,
    getReviewStatusForExtraction,
    normalizeExtraction,
    recordsToCsv,
    validateReviewData
  };
}
