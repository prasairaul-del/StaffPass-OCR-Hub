# Specification: Search Input Debouncing & Performance

**Date**: 2026-06-09
**Status**: Implemented

This specification details the design for introducing a search input debouncer and active spinner indicator in the Saved Records panel of the StaffPass OCR Hub. This resolves Medium issue #16 by eliminating rendering lag on every single keystroke.

---

## 1. Interaction & UI Design

### HTML Structure (`index.html`)
Wrap the `#record-search-input` in a relative `.search-wrapper` div and insert an absolute positioned `#search-spinner` div:
```html
<div class="search-wrapper" style="position: relative; flex: 1; display: flex; align-items: center;">
  <input id="record-search-input" class="correction-textarea" style="width: 100%; min-height: 36px; padding: 0 36px 0 12px; margin: 0;" type="text" placeholder="Search by name, document number, or type...">
  <div id="search-spinner" class="search-spinner" style="position: absolute; right: 12px; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; opacity: 0; pointer-events: none; transition: opacity 0.15s;"></div>
</div>
```

### CSS Styling (`index.css`)
Define the keyframe rotation animation and the class to show the spinner:
```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
.search-spinner.is-searching {
  opacity: 1 !important;
  animation: spin 0.6s linear infinite;
}
```

---

## 2. Mockup Preview

Below is the design mockup showing the neon-blue search loading indicator inside the input field:

![Search Input Spinner Mockup](file:///C:/Users/pc/.gemini/antigravity-cli/brain/29ace8c9-ac9b-49f7-987f-00e313742cf6/search_debounced_mockup_1780986851741.png)

---

## 3. Code Architecture & Event Handling

### `renderer/utils.js`
Implement and export a standard reusable `debounce` helper:
```javascript
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
```

### `renderer.js`
- Import `debounce` from `./renderer/utils.js`.
- Wrap the `input` listener on `#record-search-input` with a 250ms debouncer.
- Toggle the `.is-searching` class on `#search-spinner` when typing starts, and remove it once the debounced `renderRecords()` finishes.

---

## 4. Testing Plan

We will add unit tests inside `tests/renderer.test.js`:
- Verify that the `debounce` utility executes after the wait time.
- Verify that multiple successive triggers within the wait time only trigger the target function once.
