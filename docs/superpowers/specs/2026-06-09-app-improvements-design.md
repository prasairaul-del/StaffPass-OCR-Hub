# Specification: App Improvements (Codebase, UI/UX, Sidecar, Mobile)

**Date**: 2026-06-09
**Status**: Approved

This specification details the design for implementing various codebase, UI/UX, sidecar, and mobile app improvements across the StaffPass OCR Hub project.

---

## 1. Codebase & Database

### SQLite Transactions
In `database.js`, we will wrap batch records inserts and status updates inside SQLite transactions.
```javascript
const saveReviewTx = db.transaction((id, status, notes, fields) => {
  // Database update queries
});
```
This guarantees that updates to the `documents` and `staff` tables are atomic and prevents partial data saving if a write fails.

### UI Error Boundaries
In the renderer files, we will catch unhandled promise rejections to prevent silent failures.
```javascript
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  showToast('An unexpected error occurred. Please try again.');
});
```

### TypeScript Strictness
In `mobile/tsconfig.json`, we will set:
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

---

## 2. UI/UX Redesign

### Drag & Drop Overlay
We will append a hidden drag-and-drop overlay to the main app shell in `index.html`:
```html
<div id="drag-overlay" class="drag-overlay" style="display: none;">
  <div class="drag-overlay-content">
    <span class="drag-overlay-icon">📥</span>
    <h3>Drop files to ingest</h3>
    <p>PDF, PNG, JPG, and TIFF are supported</p>
  </div>
</div>
```
In `renderer/events.js`, we will bind `dragover`, `dragleave`, and `drop` events to display this overlay with a premium backdrop blur when files are dragged over the window.

### Confidence Badges
We will replace raw confidence numbers in table columns and the inspector panel with smart status badges:
- **>= 95%**: Green badge with check icon (Trusted)
- **80% - 94%**: Orange badge with warning icon (Review Recommended)
- **< 80%**: Red badge with cross icon (Manual Review Required)

### Slate HSL Styling
Update `index.css` to add glowing shadows and modern left-accent borders to active/hovered rows and cards.

---

## 3. Sidecar & Mobile

### Sidecar Auto-Restart
In `sidecar_bridge.js`, we will handle unexpected exits of the Python child process. If the process exits with a non-zero code while active, we will automatically re-spawn the process and re-send the pending request.

### IPC Schema Validation
Define schema validation in JavaScript before sending stdin payloads, and in Python (`ocr_sidecar.py`) before processing payloads:
```javascript
function validatePayload(payload) {
  if (!payload.action || !['ocr', 'preview', 'exit'].includes(payload.action)) {
    throw new Error('Invalid action');
  }
}
```

### Mobile Linter
Install and configure ESLint in `mobile/package.json` to enforce consistent style and check for common bugs during development.

---

## 4. Verification Plan

1. **Unit Tests**:
   - Verify that SQLite transactions successfully commit or rollback.
   - Verify that sidecar auto-restart logic correctly restarts the process on premature exit.
2. **Manual Check**:
   - Drag files over the application. Verify that the drag overlay is rendered smoothly with modern styling.
   - Run OCR and check if the confidence badges display correctly with their respective colors and icons.
   - Prematurely kill the Python sidecar process. Verify that subsequent OCR actions automatically re-spawn the process and complete successfully.
