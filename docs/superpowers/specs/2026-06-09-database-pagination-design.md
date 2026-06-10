# Specification: Saved Records Database-Level Pagination

**Date**: 2026-06-09
**Status**: Implemented

This specification details the design for introducing database-level server-side pagination in the Saved Records panel of the StaffPass OCR Hub. This resolves Medium issue #15 by eliminating performance degradation when the SQLite database grows large.

---

## Current Verification

Rechecked on 2026-06-10:

- `database.js` supports `listRecords(options)` and `countRecords(options)`.
- `preload.js` exposes `listRecords(options)` and `countRecords(options)`.
- Renderer pagination state, page-size changes, search reset, and type-filter reset are covered in `tests/renderer.test.js`.
- `rtk npm test` passed.

---

## 1. UI Layout & CSS (Section 1)

We will append a pagination controls container to the `records-panel` in `index.html`, positioned immediately after the `.table-frame`.

### HTML Structure (`index.html`)
```html
<div class="pagination-container">
  <div class="pagination-info" id="pagination-info-text">
    Showing 0-0 of 0 records
  </div>
  <div class="pagination-actions">
    <div class="page-size-selector-wrapper">
      <label for="records-page-size">Page Size:</label>
      <select id="records-page-size" class="tool-button">
        <option value="10">10</option>
        <option value="25">25</option>
        <option value="50">50</option>
      </select>
    </div>
    <button id="records-prev-page" class="tool-button pagination-btn" type="button" disabled>Previous</button>
    <button id="records-next-page" class="tool-button pagination-btn" type="button" disabled>Next</button>
  </div>
</div>
```

### CSS Styling (`index.css`)
Style definitions match the existing premium design scheme, using glassmorphism and supporting dark mode automatically:
```css
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.pagination-info {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 500;
}

.pagination-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.page-size-selector-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-size-selector-wrapper label {
  font-size: 0.85rem;
  color: var(--muted);
}

.page-size-selector-wrapper select {
  min-height: 32px !important;
  padding: 0 8px !important;
  cursor: pointer;
  background: var(--surface);
  margin: 0;
  font-size: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.pagination-btn {
  min-height: 32px !important;
  padding: 0 12px !important;
  font-size: 0.85rem !important;
  margin: 0 !important;
}
```

---

## 2. Mockup Preview

Below is the design mockup showing the new pagination controls footer matching the system's design style:

![Records Pagination Mockup](file:///C:/Users/pc/.gemini/antigravity-cli/brain/29ace8c9-ac9b-49f7-987f-00e313742cf6/records_pagination_mockup_1780987903863.png)

---

## 3. Database & Preload APIs (Section 2)

### `database.js`
We modify [listRecords](file:///C:/Users/pc/Downloads/StaffPass-OCR-Hub/database.js) to accept options and implement `countRecords` to get matching count. Both build matching query conditions for search/type filtering.
- If pagination parameters (`page`, `limit`) are omitted, [listRecords](file:///C:/Users/pc/Downloads/StaffPass-OCR-Hub/database.js) queries all records, guaranteeing 100% backward compatibility for CSV exports.

```javascript
function listRecords(options) {
  options = options || {};
  const search = normalizeText(options.search).toLowerCase();
  const docType = normalizeText(options.type);
  const page = options.page ? Number(options.page) : null;
  const limit = options.limit ? Number(options.limit) : null;

  const conditions = [];
  const params = [];

  if (docType) {
    conditions.push('documents.doc_type = ?');
    params.push(docType);
  }

  if (search) {
    conditions.push('(LOWER(staff.first_name) LIKE ? OR LOWER(staff.last_name) LIKE ? OR LOWER(documents.doc_number) LIKE ? OR LOWER(documents.doc_type) LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  let sql = [
    'SELECT',
    '  documents.id AS document_id,',
    '  documents.staff_id,',
    '  staff.first_name,',
    '  staff.last_name,',
    '  staff.phone_number,',
    '  staff.overall_status,',
    '  documents.doc_type,',
    '  documents.doc_number,',
    '  documents.expiry_date,',
    '  documents.confidence_score,',
    '  documents.file_path,',
    '  documents.notes,',
    '  documents.review_status,',
    '  documents.uploaded_at',
    'FROM documents',
    'LEFT JOIN staff ON staff.id = documents.staff_id'
  ].join('\n');

  if (conditions.length > 0) {
    sql += '\nWHERE ' + conditions.join(' AND ');
  }

  sql += '\nORDER BY documents.uploaded_at DESC, documents.id DESC';

  if (limit !== null && page !== null) {
    const offset = (page - 1) * limit;
    sql += '\nLIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  return ensureDb().prepare(sql).all(...params);
}

function countRecords(options) {
  options = options || {};
  const search = normalizeText(options.search).toLowerCase();
  const docType = normalizeText(options.type);

  const conditions = [];
  const params = [];

  if (docType) {
    conditions.push('documents.doc_type = ?');
    params.push(docType);
  }

  if (search) {
    conditions.push('(LOWER(staff.first_name) LIKE ? OR LOWER(staff.last_name) LIKE ? OR LOWER(documents.doc_number) LIKE ? OR LOWER(documents.doc_type) LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  let sql = [
    'SELECT COUNT(1) AS count',
    'FROM documents',
    'LEFT JOIN staff ON staff.id = documents.staff_id'
  ].join('\n');

  if (conditions.length > 0) {
    sql += '\nWHERE ' + conditions.join(' AND ');
  }

  const row = ensureDb().prepare(sql).get(...params);
  return row ? row.count : 0;
}
```

### IPC Channel Registration (`main.js`)
Update IPC handlers to forward options:
```javascript
  ipcMain.handle('records:list', async (event, options) => {
    assertTrustedSender(event);
    return db.listRecords(options);
  });

  ipcMain.handle('records:count', async (event, options) => {
    assertTrustedSender(event);
    return db.countRecords(options);
  });
```

### IPC Preload Interface (`preload.js`)
Update IPC mappings:
```javascript
  listRecords: (options) => ipcRenderer.invoke('records:list', options),
  countRecords: (options) => ipcRenderer.invoke('records:count', options),
```

---

## 4. Renderer State & Event Loop (Section 3)

### `renderer/state.js`
Initialize the `pagination` object:
```javascript
export const state = {
  activeView: 'ingestion',
  queue: [],
  selectedId: null,
  records: [],
  pagination: {
    page: 1,
    limit: 10,
    total: 0
  }
};
```

### `renderer/review.js`
- `loadRecords()` queries both the record subset and the total count.
- `renderRecords()` displays the fetched page directly, and updates the disabled status of Previous/Next buttons and page information.
- A new helper `updatePaginationUI()` computes and configures the pagination UI text and buttons.

```javascript
export async function loadRecords() {
  if (!window.api || !window.api.listRecords || !window.api.countRecords) return;

  const searchText = (query('record-search-input')?.value || '').toLowerCase().trim();
  const typeFilter = query('record-type-filter')?.value || '';

  const options = {
    search: searchText,
    type: typeFilter,
    page: state.pagination.page,
    limit: state.pagination.limit
  };

  const [records, total] = await Promise.all([
    window.api.listRecords(options),
    window.api.countRecords({ search: searchText, type: typeFilter })
  ]);

  state.records = records;
  state.pagination.total = total;
}

export function renderRecords() {
  const body = query('records-table-body');
  if (!body) return;
  body.innerHTML = '';

  const records = state.records || [];

  if (records.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = 'No approved records saved yet.';
    row.appendChild(cell);
    body.appendChild(row);
    updatePaginationUI();
    return;
  }

  records.forEach((record) => {
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

  updatePaginationUI();
}

export function updatePaginationUI() {
  const infoText = query('pagination-info-text');
  const prevBtn = query('records-prev-page');
  const nextBtn = query('records-next-page');

  if (!infoText || !prevBtn || !nextBtn) return;

  const { page, limit, total } = state.pagination;
  const totalPages = Math.ceil(total / limit);

  if (total === 0) {
    infoText.textContent = 'Showing 0-0 of 0 records';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  } else {
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    infoText.textContent = `Showing ${start}-${end} of ${total} records`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  }
}
```

### Event Bindings (`renderer.js`)
We wire listeners for filters, search inputs, and page controls in `bindEvents()`. Active search/filter changes reset the page index back to 1.
```javascript
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
```

---

## 5. Testing Plan

### Database Tests (`tests/database.test.js`)
We will verify database query behavior:
1. `listRecords` and `countRecords` with search strings.
2. `listRecords` and `countRecords` with document type filters.
3. Correct paging slicing (`LIMIT`, `OFFSET`) using custom paging options.
4. Backward compatibility: Calling `listRecords()` without options returns all records.

### Renderer Tests (`tests/renderer.test.js`)
We will verify renderer integration:
1. Rendering correct pages, labels, and Previous/Next button disabled state.
2. Responding correctly to changing the page-size selector.
3. Resetting current page index to 1 when changing search query or doc type dropdown filter.
