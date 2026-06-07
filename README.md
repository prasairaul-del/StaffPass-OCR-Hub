# StaffPass OCR Hub

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/prasairaul-del/StaffPass-OCR-Hub/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Electron](https://img.shields.io/badge/Electron-40.9.3-9feaf9.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)](#installation)

> A local-first desktop application for processing staff ID and pass documents with AI-powered OCR. Runtime document processing stays on the machine; optional model downloads and GitHub release checks use the network only when enabled by the operator.

<!-- Add a PNG or SVG logo image here for GitHub rendering -->

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Installation](#installation)
- [Android Mobile App](#android-mobile-app)
- [Usage](#usage)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Building](#building)
- [Auto-Updates](#auto-updates)
- [Database Schema](#database-schema)
- [OCR Adapter](#ocr-adapter)
- [Security](#security)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## Features

### Document Processing & Batch Intake
- **Drag-and-drop** file ingestion for quick document uploads
- **Multi-file selection** via native file picker
- **Sequential Batch OCR Ingestion** — upload multiple documents and run them sequentially, displaying real-time progress checklist steps ("Preparing...", "Running...", "Saving...")
- **AI-powered OCR** extraction of staff document metadata (name, document number, expiry, etc.)
- **Confidence scoring** — each extraction receives a trust score (95%+ = Trusted, 80-94% = Review Recommended, <80% = Manual Review Required)
- **Local Offline Font Packaging** — all fonts are bundled locally, enabling fully air-gapped system compatibility with zero remote CDN dependencies

### Review Workflow & Document Previews
- **Side-by-Side Queue Document Previews** — preview scanned documents directly inside the Review Queue before metadata approval
- **Interactive Review Queue** for inspecting and correcting extracted metadata
- **Form Validation & Constraints** — inline validation constraints (e.g., expiry date formatted as YYYY-MM-DD, required fields) in the Inspector panel
- **Approve / Reject / Correct** actions with validation
- **Saved records table** for browsing previously reviewed staff documents
- **Real-Time Record Search & Filter** — filter saved records instantaneously by text search queries or document types
- **Export** records for downstream use

### User Interface & Aesthetics
- **Premium Dark Mode UI** — clean slate/zinc HSL color system with glassmorphism sidebar tabs, smooth focus outlines, responsive cards, and micro-animations
- **Responsive layout** — three-panel design (sidebar, workspace, inspector) that adapts to screen size
- **Smooth CSS transitions** on buttons, tabs, panels, and status elements
- **CSS-only tooltips** with keyboard shortcut hints that trigger precisely on mouse hover
- **Toast notifications** for status updates and confirmations

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Switch to Ingestion tab |
| `Ctrl+2` | Switch to Review Queue tab |
| `Ctrl+3` | Switch to Records tab |
| `Ctrl+O` | Open / select files |
| `Ctrl+N` | Run OCR on selected document |
| `Ctrl+E` | Export records |
| `Ctrl+U` | Check for updates |
| `Ctrl+Shift+D` | Toggle dark mode |
| `Ctrl+/` | Show keyboard shortcuts panel |
| `Escape` | Close overlay / dialog |

### Updates
- **Auto-updater** — checks GitHub Releases for new versions on startup
- **Manual update check** via sidebar button or `Ctrl+U`
- **What's new dialog** — shows release notes after each update, fetched dynamically from GitHub Releases

---

## Screenshots

> *Place your screenshots in an `assets/` directory and reference them here.*

```
![Ingestion Tab](assets/screenshot-ingestion.png)
![Review Queue](assets/screenshot-review.png)
![Dark Mode](assets/screenshot-dark.png)
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  RENDERER PROCESS               │
│   index.html / renderer.js / index.css          │
│   (UI, keyboard shortcuts, themes, dialogs)     │
└──────────────────────┬──────────────────────────┘
                       │ IPC (contextIsolation: true)
┌──────────────────────┴──────────────────────────┐
│                  MAIN PROCESS                   │
│   main.js                                       │
│   ├── Electron BrowserWindow                    │
│   ├── IPC handlers (documents, OCR, review,     │
│   │   records, version, release notes)          │
│   ├── Auto-updater (electron-updater)           │
│   └── Database (SQLite via better-sqlite3)      │
└──────────┬───────────────────┬──────────────────┘
           │                   │
┌──────────┴──────────┐ ┌──────┴──────────────────┐
│   SIDECAR BRIDGE    │ │   SQLite Database        │
│   sidecar_bridge.js │ │   database.js            │
│   Spawns Python     │ │   staff / documents /    │
│   subprocess        │ │   audit_logs tables      │
└──────────┬──────────┘ └─────────────────────────┘
           │ stdin/stdout (JSON)
┌──────────┴──────────────────────────────────────┐
│              PYTHON OCR SIDECAR                  │
│   sidecar/ocr_sidecar.py                        │
│   ├── BaseVLMAdapter (interface)                 │
│   └── MockAdapter (development)                  │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- **Context isolation** is enabled — the renderer only communicates with the main process via named IPC channels through a hardened preload bridge
- **Python sidecar** runs as a child process, communicating via JSON over stdin/stdout
- **Offline-first** — no external API calls; all processing happens locally
- **Pluggable OCR** — the `BaseVLMAdapter` interface allows swapping OCR engines without changing application logic

---

## Installation

### Download (Recommended)

1. Go to [Releases](https://github.com/prasairaul-del/StaffPass-OCR-Hub/releases)
2. Download the latest `StaffPass OCR Hub Setup X.X.X.exe`
3. Run the installer and follow the setup wizard
4. Launch from the desktop shortcut or Start Menu

### Build from Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) v18+ and npm
- [Python](https://python.org/) 3.10+
- Windows 10/11 (with Developer Mode enabled for full icon support)

```bash
# Clone the repository
git clone https://github.com/prasairaul-del/StaffPass-OCR-Hub.git
cd StaffPass-OCR-Hub

# Install Node.js dependencies
npm install

# Install Python dependencies
cd sidecar
pip install -r requirements.txt
cd ..

# Pre-download and cache the GLM-OCR model weights (recommended before packaging/offline use)
npm run download-model

# Start the app in development mode
npm start

```

---

## Android Mobile App

The repository includes a standalone Android Expo app under `mobile/`. It is a mobile-native local-first implementation, not an Electron wrapper.

Current mobile behavior:
- Captures documents with the Android camera or imports images/PDFs through Expo pickers.
- Stores review records locally with `expo-sqlite`.
- Exports records as CSV through the Android share/save flow.
- Uses the same truthful OCR contract shape: `{ ok, degraded, data, warnings, engine }`.
- Returns degraded/manual-review-only OCR output until a native Android OCR adapter is added.

Mobile development:

```bash
cd mobile
npm install
npm run start
npm run doctor
npm run typecheck
npm test
```

Android builds:

```bash
# From the repository root

# One-time setup under your Expo account
cd mobile
npx eas-cli@latest init
cd ..

# Direct-install/internal tester APK
npm run mobile:android:apk

# Google Play-ready Android App Bundle profile
npm run mobile:android:aab
```

APK builds are for direct install and internal testing. Google Play release should use the AAB profile. Expo/EAS can manage Android signing credentials, but keystores, service-account files, APKs, and AABs must stay untracked.

---

## Usage

### 1. Ingest Documents
- Click **Select files** or drag-and-drop documents (JPG, PNG, PDF, TIFF) onto the drop zone
- Documents are added to the processing queue

### 2. Run OCR
- Select a queued document and click **Run OCR** (or press `Ctrl+N`)
- The Python sidecar extracts metadata: name, document type, number, expiry date, phone number, and confidence score

### 3. Review & Approve
- Inspect the extracted fields in the inspector panel (right side)
- Edit any fields directly (they are contenteditable)
- Click **Approve**, **Reject**, or **Mark corrections** to save your decision
- Add review notes in the correction panel

### 4. Browse Records
- Switch to the **Records** tab (`Ctrl+3`) to view all saved staff records
- Use **Refresh records** to reload from the database

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | [Electron](https://www.electronjs.org/) v40.9.3 |
| UI | Vanilla HTML/CSS/JS (no framework) |
| Database | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| OCR sidecar | Python 3.10+ |
| Packaging | [electron-builder](https://www.electron.build/) |
| Auto-updates | [electron-updater](https://www.electron.build/auto-update) |
| Testing | [Mocha](https://mochajs.org/) |
| Git hooks | [Husky](https://typicode.github.io/husky/) |

| Mobile layer | Technology |
|--------------|------------|
| Android framework | [Expo](https://expo.dev/) SDK 56 / React Native |
| Mobile routing | Expo Router tabs + stack screens |
| Mobile storage | `expo-sqlite` local records database |
| Mobile document intake | `expo-image-picker` and `expo-document-picker` |
| Mobile export | `expo-file-system` + `expo-sharing` |
| Mobile packaging | EAS Build APK/AAB profiles |

---

## Project Structure

```
StaffPass-OCR-Hub/
├── main.js                  # Electron main process
├── preload.js               # Context bridge (secure IPC API)
├── renderer.js              # UI logic, keyboard shortcuts, themes
├── database.js              # SQLite schema and helpers
├── sidecar_bridge.js        # Spawns and communicates with Python sidecar
├── index.html               # Application shell
├── index.css                # All styles (CSS variables, dark mode, responsive)
├── icon.ico                 # Custom app icon (16–256px)
├── package.json             # Dependencies and electron-builder config
├── CHANGELOG.md             # Release history
├── .gitignore               # Git ignore rules
├── agents.md                # Agent workflow specification
├── implementation_plan.md   # Development roadmap
├── build_blueprint_staffpass_ocr_hub.md  # Architecture blueprint
├── sidecar/                 # Python OCR sidecar
│   ├── base_adapter.py      # BaseVLMAdapter interface
│   ├── mock_adapter.py      # Mock OCR adapter (development)
│   ├── ocr_sidecar.py       # Sidecar entry point (stdin/stdout JSON)
│   ├── requirements.txt     # Python dependencies
│   └── tests/
│       └── test_sidecar.py  # Python unit tests
├── mobile/                  # Expo Android app
└── tests/                   # JavaScript unit tests
    ├── electron.test.js     # Electron app wiring tests
    ├── database.test.js     # SQLite schema tests
    ├── renderer.test.js     # UI helper function tests
    └── sidecar_bridge.test.js  # Bridge integration tests
```

---

## Development

### Start in Development Mode

```bash
npm start
```

### Run Tests

```bash
npm test
```

This runs the full Mocha test suite covering:
- Database schema creation and CRUD operations
- Electron app wiring (IPC handlers, preload API, window configuration)
- Renderer UI helpers (confidence scoring, field validation, OCR normalization)
- OCR sidecar bridge (mock processing, error handling)

### Pre-commit Hook

Husky runs `npm test` before every commit to prevent regressions.

---

## Testing

```bash
# Run all tests
npm test

# Run tests for a specific file
npx mocha tests/database.test.js

# Run Python sidecar tests
cd sidecar
python -m pytest tests/

# Run mobile Expo checks
cd ..
npm run mobile:doctor
npm run mobile:typecheck
npm run mobile:test
```

---

## Building

### Windows Installer

```bash
# Build an unsigned unpacked app for local smoke testing
npm run dist:smoke

# Build an unsigned local NSIS installer for test installs only
npm run dist:installer:unsigned

# Build the release installer when signing material is available
npm run dist:release

# Validate draft-release config without secrets
npm run validate:release-config

# Validate updater metadata and installer output
npm run validate:release
```

The output will be in the `dist_installer/` directory.

Release states:

1. `npm run dist:smoke` produces an unsigned `win-unpacked` directory for local verification only. It does not create an installer `.exe`.
2. `npm run dist:installer:unsigned` produces an unsigned local NSIS installer `.exe` for test installs only. Do not publish it as a production release.
3. `npm run dist:release` is the cert-ready guarded build. It requires the Windows signing environment before packaging the production installer.
4. `npm run validate:release` is the production release check. It requires fresh updater metadata, matching `package.json` and `dist_installer/latest.yml` versions, and the referenced installer artifact to exist on disk.

**Note:** Windows Developer Mode must be enabled for `electron-builder` to extract `winCodeSign` (required for embedding the custom icon into the `.exe`). Without it, the installer will use the default Electron icon.

### Android APK / AAB

```bash
# Validate Expo config and dependency versions
npm run mobile:doctor

# Typecheck and run mobile unit tests
npm run mobile:typecheck
npm run mobile:test

# Build a direct-install Android APK through EAS
npm run mobile:android:apk

# Build an Android App Bundle for Google Play tracks
npm run mobile:android:aab
```

The mobile APK is separate from the Windows installer and does not include Electron, `better-sqlite3`, or the Python sidecar. The first Android build uses a degraded manual-review OCR adapter until native Android OCR is implemented.

Mobile build notes:
- Run `npx eas-cli@latest init` inside `mobile/` before non-interactive APK/AAB builds.
- The mobile scripts call `npx eas-cli@latest` to avoid stale global EAS CLI versions.
- Expo SDK 56 expects Expo Router-managed navigation and the newer `expo-file-system` `File`/`Paths` API.

### Rebuild Native Modules

If you change the Electron version or install new native dependencies:

```bash
npm run rebuild
```

For release or packaging runs, start from `npm ci` or another lockfile-respecting install so `better-sqlite3` and other native rebuilds stay reproducible from the committed `package-lock.json`.

---

## Electron Compatibility

### Verified baseline
- Electron `40.9.3` is the current verified release baseline for this repository.
- The existing packaging and test flow is aligned to that baseline and should remain the reference point for release smoke checks.

### Electron 42 compatibility wave
- Electron `42` is out of scope for this pass.
- The current blocker is native rebuild readiness for `better-sqlite3` on Windows, which depends on a working Visual Studio Build Tools and `node-gyp` toolchain.

### Compatibility prerequisites
- Visual Studio Build Tools installed and reachable from the shell.
- `node-gyp` readiness confirmed before attempting native rebuilds.
- `npm run rebuild` uses `electron-builder install-app-deps` to refresh native modules against the active Electron version.
- `npm run dist:dir` passes as the local packaging smoke check.
- App boot smoke passes on startup.
- IPC tests pass before any compatibility claim is treated as verified.

---

## Auto-Updates

The app uses `electron-updater` with GitHub Releases as the update source.

### How It Works

1. On startup, the app checks GitHub Releases for a newer version (after a 3-second delay)
2. If a newer version is found, it downloads silently in the background
3. When the download is complete, a banner appears at the top with a **Restart & Install** button
4. You can also check manually via the **Check for updates** button or `Ctrl+U`

### Publishing a New Release

```bash
# Bump version in package.json
npm version patch  # or minor, major

# Smoke-test the packaged app without signing
npm run dist:smoke

# Optional: create an unsigned local installer for test installs only
npm run dist:installer:unsigned

# Require Windows signing material for release builds
$env:STAFFPASS_REQUIRE_SIGNING = "1"
npm run dist:release

# Validate the draft release config and generated updater metadata
npm run validate:release-config
npm run validate:release

# Tag and push
git tag -a vX.Y.Z -m "vX.Y.Z: release notes"
git push origin vX.Y.Z

# Create GitHub release with installer attached
gh release create vX.Y.Z "dist_installer/StaffPass OCR Hub Setup X.Y.Z.exe" \
  --title "vX.Y.Z: Title" --notes "Release notes here"
```

**Important:** Production releases must be code-signed and regenerated from fresh updater metadata. Set `STAFFPASS_REQUIRE_SIGNING=1` with `CSC_LINK`/`WIN_CSC_LINK` or `CSC_NAME`/`WIN_CSC_NAME` before packaging the guarded release build. Use `validate:release-config` to check the draft-release GitHub settings without secrets, `validate:smoke` to confirm an unsigned smoke build is present, and `validate:release` to confirm the generated `latest.yml` stays aligned with the installer asset before publishing. The unsigned local installer is only for local installation testing and must not be attached to a public production release.

---

## Database Schema

### staff
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| first_name | TEXT | Staff first name |
| last_name | TEXT | Staff last name |
| phone_number | TEXT | Contact number |
| overall_status | TEXT | Default: "Pending Review" |
| created_at | DATETIME | Auto-set on creation |
| updated_at | DATETIME | Auto-updated |

### documents
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| staff_id | INTEGER | Foreign key → staff |
| doc_type | TEXT | PASSPORT, EMIRATES_ID, VISA, etc. |
| doc_number | TEXT | Document number |
| expiry_date | TEXT | ISO format date |
| confidence_score | INTEGER | 0–100 |
| file_path | TEXT | Original file path |
| review_status | TEXT | Pending Review / Approved / Rejected / Corrected |
| uploaded_at | DATETIME | Auto-set on creation |

### audit_logs
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| event_type | TEXT | Upload, OCR, Correction, Approval, Deletion |
| details | TEXT | JSON details |
| created_at | DATETIME | Auto-set on creation |

---

## OCR Adapter & Local AI Engine

The OCR system uses a pluggable adapter pattern. The default development engine is the `MockAdapter`, while production environments utilize a local multimodal AI engine.

### GLM-OCR Integration (CPU-Only Mode)

The application includes a CPU-optimized adapter (`sidecar/glmocr_adapter.py`) designed specifically for **hardware-constrained systems** (e.g., computers with 8GB RAM, normal Intel i5 9th/10th generation processors, and no GPU).

- **No GPU Needed:** Runs entirely on CPU using PyTorch and Hugging Face `transformers` (targeting the `zai-org/GLM-OCR` 0.9B parameter model).
- **No External OCR Service:** Does not require an Ollama service or cloud OCR API. Initial model download/cache setup may use Hugging Face/PyTorch package endpoints; cached runtime OCR remains local.
- **CPU Throttling:** Restricts PyTorch thread counts dynamically to prevent interface lags and system freezes during inference.
- **Image Downsampling Optimization:** Automatically resizes larger document scans to a maximum dimension of `512px` (preserving aspect ratio) before running OCR. This reduces the number of visual patches from 2,576 to at most 616, cutting memory overhead and accelerating CPU inference by over 16x (resolving process timeouts on standard desktop CPUs).

### How it Works (Zero-Memory Idle & Cleanup)

To ensure the desktop app remains lightweight:
1. **On-Demand Loading:** The Python sidecar loads the 0.9B parameter model and processor only when an OCR extraction is explicitly requested, instantly offloading them (`gc.collect()` and PyTorch VRAM cleanups) after inference completes. The idle footprint is virtually zero.
2. **Process Lifecycle Hooks:** When the Electron app is closed, the main process catches the `will-quit` hook and triggers `SIGKILL` on the Python sidecar process tree, guaranteeing that no orphan Python tasks remain active in Windows Task Manager.

---

## Security

- **Context isolation and renderer sandbox** enabled: renderer cannot access Node.js APIs directly
- **Hardened preload bridge**: only named IPC channels are exposed; no generic `send`, `invoke`, or `on`
- **IPC sender and file validation**: main-process handlers reject unknown senders, unsupported extensions, and missing document files
- **Content Security Policy**: renderer scripts are restricted to local app assets
- **Local data first**: documents and database records remain on the local machine; update checks and model downloads are explicit online operations
- **Export privacy**: CSV exports omit source file paths and are created only through a save dialog
- **Mobile privacy**: Android records and imported files stay device-local; mobile CSV exports use the Android share/save flow and omit source file paths

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the existing code style
4. Write or update tests as needed
5. Run the test suite (`npm test`)
6. Commit your changes (`git commit -m 'feat: add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style

- Follow existing patterns in the codebase
- Use CSS custom properties (no hardcoded colors)
- All IPC channels must be named and registered in the preload bridge
- Tests must pass before committing (enforced by Husky pre-commit hook)

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of all releases.

### Recent Releases

- **v1.3.0** — Local CPU-optimized GLM-OCR integration, zero-memory idle state, strict lifecycle controls, and Node 26 compatibility runner
- **v1.2.0** — Dynamic release notes fetched from GitHub Releases API
- **v1.1.0** — Auto-updater with GitHub Releases, What's new dialog, version display
- **v1.0.0** — Initial release: dark mode, keyboard shortcuts, Electron packaging, NSIS installer

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Database powered by [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- Packaging by [electron-builder](https://www.electron.build/)
- Icons and UI inspired by modern design systems
