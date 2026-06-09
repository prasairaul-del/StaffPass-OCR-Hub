# Implementation Plan: Keyboard-Only Review Workflow

This implementation plan details the step-by-step tasks required to build the Keyboard-Only Review Workflow.

---

## 1. Task Checklist

| Priority | Task Description | Target File | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 🔴 **Critical** | Implement focus traversal helper `focusNextField` | `renderer/dom.js` | ⬜ **Pending** | Focus next field on `Enter` (non-textarea inputs). |
| 🔴 **Critical** | Integrate auto-advance selection inside `saveSelectedReview` | `renderer/review.js` | ⬜ **Pending** | Programmatically select next pending file and set focus. |
| 🟠 **High** | Add keydown listener router `handleReviewKeyDown` | `renderer.js` | ⬜ **Pending** | Intercept `Ctrl+Enter`, `Ctrl+Backspace`, `Ctrl+S`, and `Alt+Up/Down`. |
| 🟠 **High** | Add visual keyboard shortcut hints in UI markup | `index.html` | ⬜ **Pending** | Add visual badges or hints next to action buttons and rows. |
| 🟢 **Low** | Add comprehensive keyboard regression unit tests | `tests/renderer.test.js` | ⬜ **Pending** | Test keyboard navigation and actions. |

---

## 2. Detailed Technical Steps

### Step 1: Form Focus Traversal (`renderer/dom.js`)
- Write a function `focusNextField(currentField)`:
  - Define an array of form field IDs in sequence:
    `['field-first-name', 'field-last-name', 'field-doc-type', 'field-id-number', 'field-expiry-date', 'field-phone-number', 'correction-notes']`
  - Find the index of `currentField.id`. If found, focus the element at `index + 1`.
  - Export this helper.

### Step 2: Auto-Advance Logic (`renderer/review.js`)
- Modify `saveSelectedReview(reviewStatus)`:
  - After a successful review save, scan `state.queue` for the next file that needs review (status is `queued`, `review`, or `error`).
  - If a file is found, update `state.selectedId = nextItem.id`.
  - If no files are left, set `state.selectedId = null`.
  - Re-render the view by calling the callback.
  - Set a brief timeout (e.g. 50ms) to call `.focus()` on `field-first-name` of the newly active document.

### Step 3: Keydown Router (`renderer.js`)
- In `renderer.js`, implement `handleReviewKeyDown(event)`:
  - Check if `state.activeView === 'review'`.
  - Ensure overlays (`whats-new-overlay`, `shortcuts-overlay`) are hidden.
  - Listen for:
    - `Ctrl + Enter` -> call `saveSelectedReview('Approved')`.
    - `Ctrl + Backspace` -> call `saveSelectedReview('Rejected')`.
    - `Ctrl + S` -> call `saveSelectedReview('Corrected')`.
    - `Alt + ArrowDown` / `Alt + ArrowUp` -> change selected row in `state.queue`.
    - `Enter` (on form inputs) -> call `focusNextField(event.target)`.

### Step 4: UI Visual Affordances (`index.html`)
- Locate action buttons (`approve-btn`, `reject-btn`, `save-corrections-btn`).
- Append small visual text badges showing the shortcuts:
  - `Approve` -> add `<span class="kbd-badge">Ctrl+Enter</span>` or similar.
  - `Reject` -> add `<span class="kbd-badge">Ctrl+Backspace</span>`.
  - `Save Corrections` -> add `<span class="kbd-badge">Ctrl+S</span>`.
- Style badges in `index.css`.

---

## 3. Verification Plan

1. **Running Tests**:
   - Run `npm test` to verify all baseline tests are passing.
   - Run unit tests specifically testing keyboard actions in `tests/renderer.test.js`.
2. **Manual Smoke Check**:
   - Start Electron using `npm start`.
   - Add files, run OCR, navigate the inspector fields using `Enter`/`Tab`, and approve/reject using the keyboard hotkeys. Check if it advances smoothly.
