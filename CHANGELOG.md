# Changelog

All notable changes to StaffPass OCR Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-06-05

### Fixed
- **GLM-OCR Model Call Bug** — Added `return_dict=True` to the chat template processor call in `GLMOCRAdapter` to resolve a critical unpacking tensor mapping error.
- **CPU Inference Throttling & Performance** — Integrated automatic image downsampling to a maximum dimension of `512px` (while preserving aspect ratio) inside `GLMOCRAdapter`. This reduces the visual patch count from 2,576 to at most 616, improving CPU inference speed by over 16x and preventing process timeouts.

## [1.3.0] - 2026-06-05

### Added
- **GLM-OCR Local CPU Adapter** — Added a CPU-optimized adapter (`glmocr_adapter.py`) to run multimodal document recognition without requiring a GPU or an external Ollama installation.
- **On-Demand Memory Management** — The model is loaded into RAM/VRAM only during OCR extraction and immediately garbage-collected and unloaded when idle.
- **Node 26 Compatibility** — Added a custom, lightweight test runner (`tests/run.js`) and explicit `"type": "commonjs"` configuration in `package.json` to prevent ESM module resolution and yargs/mocha compatibility errors.

### Fixed
- **Process Leakage Prevention** — Enforced a strict background process lifecycle; the Electron main process kills the Python sidecar process tree using `SIGKILL` on exit to guarantee no orphaned background tasks.

## [1.2.0] - 2026-06-04

### Changed

- **Dynamic release notes** — "What's new" dialog now fetches release notes from the GitHub Releases API instead of using hardcoded content. Notes are cached in localStorage to avoid API rate limits.

## [1.1.0] - 2026-06-04

### Changed

- **Publish provider** — Switched auto-updater from generic URL to GitHub Releases (`prasairaul-del/StaffPass-OCR-Hub`), enabling automatic update distribution through GitHub.
- **Version display** — App version shown in the sidebar brand area (e.g. "v1.1.0").
- **What's new dialog** — Automatically shows release notes on first launch after an update. Fetches release notes dynamically from the GitHub Releases API, with a graceful fallback for offline or error cases. Compares stored version in localStorage against the current app version and displays a modal with version-specific changes. Dismissable via button, backdrop click, or Escape.

## [1.0.0] - 2026-06-03

### Added

- **Dark mode** — Full dark theme with CSS custom properties, toggle switch in the sidebar, and `localStorage` persistence so the preference survives restarts.
- **Keyboard shortcuts** — `Ctrl+Shift+D` toggles dark mode; `Ctrl+1`/`Ctrl+2`/`Ctrl+3` switch between Ingestion, Review Queue, and Records tabs; `Ctrl+O` opens the file picker; `Ctrl+N` runs OCR on the selected document; `Ctrl+E` exports records; `Ctrl+/` opens a keyboard shortcut help overlay; `Escape` closes it.
- **Toast notifications** — Brief slide-up toast confirms theme changes and tab switches.
- **CSS-only tooltips** — Hovering sidebar tab buttons shows descriptive tooltips with shortcut hints (e.g. "Ctrl+1") and no JavaScript required.
- **Keyboard shortcut help overlay** — Modal dialog listing all available shortcuts with `<kbd>` styled keys, backdrop click dismiss, and full keyboard accessibility (focus management, Escape to close).
- **Smooth transitions** — 0.15s–0.2s CSS transitions on tab buttons, action buttons, tool buttons, drop zone, status bar, and panel entry animations.
- **Panel visibility split** — Document summary panel shows on Ingestion and Review tabs; saved records table shows only on the Records tab.
- **Husky pre-commit hook** — Runs the full test suite (`npm test`) before every commit to prevent regressions.
- **`.gitignore`** — Excludes `node_modules/`, `package-lock.json`, `__pycache__/`, and `app-output.txt`.

### Fixed

- **Records table colspan** — Changed the empty-state `<td>` from `colspan="6"` to `colspan="7"` to match the 7-column table header.
- **Missing newline in renderer.js** — Restored blank line between `getSelectedItem` and `setActiveView` function declarations.

### Security

- **Hardened preload API** — Removed overly broad generic `send`, `invoke`, and `on` methods from the Electron context bridge. Only the four named APIs (`selectDocuments`, `processOCR`, `saveReview`, `listRecords`) are now exposed to the renderer.
- **CSP hash** — Added SHA-256 hash for the inline theme-preload `<script>` in the `<head>` to comply with the Content Security Policy.

### Changed

- **CSS variables** — Replaced all hardcoded color values (`#f5f7f9`, `#fff`, `#f7f9fb`, `#eef4ff`, `#103a7a`, `#10522f`, `#8f2017`, `#7c8a97`) with CSS custom properties so both light and dark themes use a single source of truth.
- **Dead CSS cleanup** — Removed orphaned `.records-block` and `.records-header` rules that were no longer referenced in the HTML.
- **Electron test** — Updated preload API assertion to expect the 4 named methods instead of 7.

### Infrastructure

- **Git repository** — Initialized with a clean `.gitignore` and two commits.
- **Tag** — `v1.0.0` annotated tag pointing to the initial release.
- **Dependencies** — `husky` (^9.1.7) added as a dev dependency with `"prepare": "husky"` script.
- **Electron-builder packaging** — Configured `electron-builder` for Windows NSIS installer generation. Package config includes: `appId`, product name, custom install directory option, Start Menu and Desktop shortcuts, and proper bundling of `better-sqlite3` native module via `install-app-deps`.
- **Windows NSIS installer** — `npm run dist` produces a full Windows installer (`StaffPass OCR Hub Setup 1.0.0.exe`) with one-click or custom install modes, uninstaller, and optional install directory selection.
- **Auto-updater** — Integrated `electron-updater` with generic publish provider. Checks for updates 3 seconds after startup, downloads silently in the background, and shows a banner notification when an update is ready to install. Includes IPC bridge for manual update checks and quit-and-install from the renderer.
- **Update notification banner** — Slides down from the top of the window when a new version is downloaded. Includes a "Restart & Install" button and a dismiss control. Styled for both light and dark themes.
- **Manual update check** — "Check for updates" button in the sidebar and `Ctrl+U` keyboard shortcut to trigger a manual update check at any time.
- **Custom app icon** — Multi-size `.ico` (16–256px) blue rounded-rectangle icon with "OCR" text, used for the desktop shortcut, installer, and embedded into the packaged `.exe` via `signAndEditExecutable`.
- **Desktop shortcut** — Auto-created by the NSIS installer with the custom icon. Manual `.lnk` shortcut also available in the project for development use.
- **Developer Mode dependency** — Windows Developer Mode must be enabled for `electron-builder` to extract `winCodeSign` (contains macOS `.dylib` symlinks). Without it, `signAndEditExecutable` is skipped and the `.exe` uses the default Electron icon.
