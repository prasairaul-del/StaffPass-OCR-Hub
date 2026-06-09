import { state, fields } from './state.js';
import { query, text, setStatus } from './dom.js';
import { getSelectedItem } from './queue.js';
import { validateReviewData } from './utils.js';

let _reviewRender = () => {};

export function setReviewRenderCallback(fn) {
  _reviewRender = fn;
}

export function readInspectorData() {
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

export function displayInlineWarnings(errors) {
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

export function setValidationErrors(errors) {
  const list = query('validation-errors');
  if (!list) return;
  list.innerHTML = '';
  errors.forEach((error) => {
    const item = document.createElement('li');
    item.textContent = error;
    list.appendChild(item);
  });
}

export async function saveSelectedReview(reviewStatus) {
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

  _reviewRender();
}

export async function loadRecords() {
  if (!window.api || !window.api.listRecords) return;
  state.records = await window.api.listRecords();
}

export function renderRecords() {
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

export async function exportRecords() {
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
