# Implementation Plan: Search Input Debouncing & Performance

This implementation plan details the step-by-step tasks required to add search input debouncing and the active spinner feedback to the Saved Records panel.

---

## 1. Task Checklist

| Priority | Task Description | Target File | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 🔴 **Critical** | Implement `debounce` utility in `renderer/utils.js` | `renderer/utils.js` | ⬜ **Pending** | Standard debouncer function. |
| 🔴 **Critical** | Update event listener in `renderer.js` to debounce search | `renderer.js` | ⬜ **Pending** | Integrate spinner toggle and 250ms debounce. |
| 🟠 **High** | Wrap search input and add visual spinner element in HTML | `index.html` | ⬜ **Pending** | Wrap in relative `.search-wrapper` and add `#search-spinner`. |
| 🟠 **High** | Add spinner styles and keyframe spin animation in CSS | `index.css` | ⬜ **Pending** | Add `@keyframes spin` and styling for `.search-spinner`. |
| 🟢 **Low** | Add debounce unit tests | `tests/renderer.test.js` | ⬜ **Pending** | Test debounce timeout behavior and throttling. |

---

## 2. Technical Steps

### Step 1: Debounce Utility (`renderer/utils.js`)
- Implement and export `debounce(func, wait)`:
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

### Step 2: HTML Wrapper & Spinner (`index.html`)
- Wrap `#record-search-input` in a `<div class="search-wrapper" style="position: relative; flex: 1; display: flex; align-items: center;">`.
- Add `<div id="search-spinner" class="search-spinner" style="position: absolute; right: 12px; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; opacity: 0; pointer-events: none; transition: opacity 0.15s;"></div>`.

### Step 3: CSS Spinner Styles (`index.css`)
- Append:
  ```css
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .search-spinner.is-searching {
    opacity: 1 !important;
    animation: spin 0.6s linear infinite;
  }
  ```

### Step 4: Hook Event Listener (`renderer.js`)
- Import `debounce` from `./renderer/utils.js`.
- Update the `record-search-input` input listener:
  ```javascript
  const searchInput = query('record-search-input');
  const spinner = query('search-spinner');

  const debouncedRender = debounce(() => {
    renderRecords();
    if (spinner) {
      spinner.classList.remove('is-searching');
    }
  }, 250);

  searchInput?.addEventListener('input', () => {
    if (spinner) {
      spinner.classList.add('is-searching');
    }
    debouncedRender();
  });
  ```

### Step 5: Test Coverage (`tests/renderer.test.js`)
- Add unit tests verifying:
  - Debounce waits the expected duration before running.
  - Multi-invocation only calls the target function once.

---

## 3. Verification Plan

1. **Unit Tests**: Run `npm test` to verify all tests pass.
2. **Manual check**: Run `npm start`, type in the Saved Records search bar, observe the spinner animation appearing during typing and disappearing after results load.
