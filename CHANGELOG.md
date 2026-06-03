# Changelog

All notable changes to StaffPass OCR Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-03

### Added

- **Dark mode** — Full dark theme with CSS custom properties, toggle switch in the sidebar, and `localStorage` persistence so the preference survives restarts.
- **Keyboard shortcuts** — `Ctrl+Shift+D` toggles dark mode; `Ctrl+1`/`Ctrl+2`/`Ctrl+3` switch between Ingestion, Review Queue, and Records tabs; `Ctrl+/` opens a keyboard shortcut help overlay; `Escape` closes it.
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
