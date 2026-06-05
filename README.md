# StaffPass OCR Hub

[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/prasairaul-del/StaffPass-OCR-Hub/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Electron](https://img.shields.io/badge/Electron-30-9feaf9.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)](#installation)

> A fully offline desktop application for processing staff ID and pass documents with AI-powered OCR. Built with Electron, SQLite, and a Python OCR sidecar.

<!-- Add a PNG or SVG logo image here for GitHub rendering -->

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Installation](#installation)
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

### Document Processing
- **Drag-and-drop** file ingestion for quick document uploads
- **Multi-file selection** via native file picker
- **AI-powered OCR** extraction of staff document metadata (name, document number, expiry, etc.)
- **Confidence scoring** — each extraction receives a trust score (95%+ = Trusted, 80-94% = Review Recommended, <80% = Manual Review Required)

### Review Workflow
- **Review queue** for inspecting and correcting extracted metadata
- **Approve / Reject / Correct** actions with validation
- **Saved records table** for browsing previously reviewed staff documents
- **Export** records for downstream use

### User Interface
- **Dark mode** with localStorage persistence and toggle switch
- **Responsive layout** — three-panel design (sidebar, workspace, inspector) that adapts to screen size
- **Smooth CSS transitions** on buttons, tabs, panels, and status elements
- **CSS-only tooltips** with keyboard shortcut hints
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
| Desktop framework | [Electron](https://www.electronjs.org/) v30 |
| UI | Vanilla HTML/CSS/JS (no framework) |
| Database | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| OCR sidecar | Python 3.10+ |
| Packaging | [electron-builder](https://www.electron.build/) |
| Auto-updates | [electron-updater](https://www.electron.build/auto-update) |
| Testing | [Mocha](https://mochajs.org/) |
| Git hooks | [Husky](https://typicode.github.io/husky/) |

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
```

---

## Building

### Windows Installer

```bash
# Build NSIS installer (requires Developer Mode for icon embedding)
npm run dist

# Build unpacked directory (for testing)
npm run dist:dir
```

The output will be in the `dist_installer/` directory.

**Note:** Windows Developer Mode must be enabled for `electron-builder` to extract `winCodeSign` (required for embedding the custom icon into the `.exe`). Without it, the installer will use the default Electron icon.

### Rebuild Native Modules

If you change the Electron version or install new native dependencies:

```bash
npm run rebuild
```

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

# Build the installer
npm run dist

# Tag and push
git tag -a vX.Y.Z -m "vX.Y.Z: release notes"
git push origin vX.Y.Z

# Create GitHub release with installer attached
gh release create vX.Y.Z "dist_installer/StaffPass OCR Hub Setup X.Y.Z.exe" \
  --title "vX.Y.Z: Title" --notes "Release notes here"
```

**Important:** After building, update the `latest.yml` file in the release to reference the correct GitHub asset filename (GitHub replaces spaces with dots in asset names).

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
- **No External Services:** Does not require an Ollama service or internet access.
- **CPU Throttling:** Restricts PyTorch thread counts dynamically to prevent interface lags and system freezes during inference.

### How it Works (Zero-Memory Idle & Cleanup)

To ensure the desktop app remains lightweight:
1. **On-Demand Loading:** The Python sidecar loads the 0.9B parameter model and processor only when an OCR extraction is explicitly requested, instantly offloading them (`gc.collect()` and PyTorch VRAM cleanups) after inference completes. The idle footprint is virtually zero.
2. **Process Lifecycle Hooks:** When the Electron app is closed, the main process catches the `will-quit` hook and triggers `SIGKILL` on the Python sidecar process tree, guaranteeing that no orphan Python tasks remain active in Windows Task Manager.

---

## Security

- **Context isolation** enabled — renderer cannot access Node.js APIs directly
- **Hardened preload bridge** — only named IPC channels are exposed (no generic `send`/`invoke`/`on`)
- **Content Security Policy** — inline scripts are blocked via SHA-256 hash allowlist
- **Offline-first** — no external network calls, no telemetry, no analytics
- **Local data only** — all documents and database records remain on the local machine

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
