# Implementation Plan: Saved Records Database-Level Pagination

This implementation plan details the step-by-step tasks required to add database-level server-side pagination to the Saved Records panel.

---

## 1. Task Checklist

| Priority | Task Description | Target File | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 🔴 **Critical** | Implement `countRecords(options)` and update `listRecords(options)` with LIMIT/OFFSET in `database.js` | `database.js` | ✅ Completed | Add SQL parameter bindings, keep backward compatibility. |
| 🔴 **Critical** | Register `records:count` IPC handler and update `records:list` in `main.js` | `main.js` | ✅ Completed | Expose database methods through IPC. |
| 🔴 **Critical** | Expose `countRecords` and update `listRecords` in `preload.js` | `preload.js` | ✅ Completed | Expose methods to Main World API. |
| 🟠 **High** | Add pagination UI element structure under `.table-frame` | `index.html` | ✅ Completed | Add info text, page size dropdown, Prev/Next buttons. |
| 🟠 **High** | Add styles for pagination container and buttons | `index.css` | ✅ Completed | Styling for `.pagination-container` and subcomponents. |
| 🟠 **High** | Add pagination state in `renderer/state.js` | `renderer/state.js` | ✅ Completed | Initial state: `{ page: 1, limit: 10, total: 0 }`. |
| 🟠 **High** | Update `loadRecords` and `renderRecords` and add `updatePaginationUI` in `renderer/review.js` | `renderer/review.js` | ✅ Completed | Query database with page/limit, render page slice. |
| 🟠 **High** | Bind click/change events for page buttons/size selector in `renderer.js` | `renderer.js` | ✅ Completed | Setup event listeners in `bindEvents()`. |
| 🟢 **Low** | Add database unit tests validating pagination behavior | `tests/database.test.js` | ✅ Completed | Test count, limit, offset, and search queries. |
| 🟢 **Low** | Add renderer unit tests validating pagination page changes and search reset | `tests/renderer.test.js` | ✅ Completed | Test event handling, reset to page 1. |

---

## 2. Technical Steps

### Step 1: Database helpers (`database.js`)
- Modify `listRecords(options)` and implement `countRecords(options)` as detailed in the design spec.
- Ensure that if `limit` and `page` options are not passed, `listRecords` queries all records.

### Step 2: Main process & preload bridge (`main.js` & `preload.js`)
- In `main.js`, update `records:list` handler and add `records:count`.
- In `preload.js`, update `listRecords` contextBridge mapping to accept `options`, and add `countRecords`.

### Step 3: UI HTML & CSS (`index.html` & `index.css`)
- Insert the pagination footer inside `#records-panel` after `.table-frame` in `index.html`.
- Add style definitions for pagination components to `index.css`.

### Step 4: Renderer State (`renderer/state.js`)
- Extend the `state` object with:
  ```javascript
  pagination: {
    page: 1,
    limit: 10,
    total: 0
  }
  ```

### Step 5: Review panel rendering logic (`renderer/review.js`)
- Update `loadRecords()` to execute `listRecords(options)` and `countRecords(filters)` in parallel.
- Update `renderRecords()` to directly render records on the active page and call `updatePaginationUI()`.
- Implement `updatePaginationUI()` to configure the state of controls.

### Step 6: Event Listeners (`renderer.js`)
- Add click listeners for `#records-prev-page` and `#records-next-page`.
- Add change listener for `#records-page-size`.
- Update input/change listeners for search/filter inputs to reset page back to 1.

### Step 7: Tests (`tests/database.test.js` & `tests/renderer.test.js`)
- Write unit tests verifying database queries slice correctly and backward compatibility is preserved.
- Write renderer tests simulating page navigation and filter resets.

---

## 3. Verification Plan

1. **Unit Tests**: Run `npm test` to verify all test suites pass.
2. **Manual check**:
   - Save multiple document approvals (at least 11 records).
   - Change page size to 10. Verify footer shows "Showing 1-10 of 11 records".
   - Click "Next". Verify table shows the 11th record and info updates to "Showing 11-11 of 11 records".
   - Click "Previous". Verify navigation goes back.
   - Enter a query in search that filters results. Verify current page is reset to 1 and pagination text reflects matching filtered count.
