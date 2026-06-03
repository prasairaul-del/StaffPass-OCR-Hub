# StaffPass Local OCR Hub Initial Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize Electron boilerplate, configure SQLite schema, and create the Python OCR sidecar with BaseVLMAdapter to build the offline document ingestion pipeline.

**Architecture:** Electron main process coordinates SQLite and spawns a Python subprocess (sidecar) for ML/OCR tasks. IPC bridge passes base64 images/PDFs or paths, returning structured JSON metadata.

**Tech Stack:** Electron, SQLite3, Python 3.10+, PyTorch (mocked first), PyMuPDF (for PDF processing), vanilla HTML/CSS/JS.

---

### Task 1: Electron Project Initialization & Core UI boilerplate

**Files:**
- Create: `package.json`
- Create: `main.js`
- Create: `preload.js`
- Create: `renderer.js`
- Create: `index.html`
- Create: `index.css`
- Create: `tests/electron.test.js`

- [ ] **Step 1: Write the failing test**
Create `tests/electron.test.js` to verify Electron launches and window is configured correctly.
```javascript
const assert = require('assert');
// Mock window behavior test or simple unit check
describe('Electron App Config', () => {
  it('should have standard package configuration', () => {
    const pkg = require('../package.json');
    assert.strictEqual(pkg.main, 'main.js');
    assert.ok(pkg.dependencies.electron);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL (missing package.json)

- [ ] **Step 3: Write minimal implementation**
Create `package.json`:
```json
{
  "name": "staffpass-ocr-hub",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "mocha tests/**/*.test.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "electron": "^30.0.0"
  },
  "devDependencies": {
    "mocha": "^10.4.0"
  }
}
```

Create `main.js`:
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

Create `preload.js`:
```javascript
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args))
});
```

Create `index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>StaffPass Local OCR Hub</title>
  <link rel="stylesheet" href="index.css">
</head>
<body>
  <h1>StaffPass Local OCR Hub</h1>
  <div id="app">Ready.</div>
  <script src="renderer.js"></script>
</body>
</html>
```

Create `index.css`:
```css
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #1e1e1e;
  color: #ffffff;
  margin: 0;
  padding: 20px;
}
```

Create `renderer.js`:
```javascript
console.log('Renderer initialized');
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm install && npm test`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add package.json main.js preload.js renderer.js index.html index.css tests/electron.test.js
git commit -m "feat: initialize electron app boilerplate"
```

---

### Task 2: SQLite Schema Setup

**Files:**
- Create: `database.js`
- Create: `tests/database.test.js`

- [ ] **Step 1: Write the failing test**
Create `tests/database.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');
const db = require('../database');

describe('Database Schema', () => {
  before(() => {
    db.init(':memory:');
  });

  it('should create staff, documents, and audit_logs tables', () => {
    const tables = db.getTables();
    assert.ok(tables.includes('staff'));
    assert.ok(tables.includes('documents'));
    assert.ok(tables.includes('audit_logs'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL (database.js empty or missing method)

- [ ] **Step 3: Write database setup implementation**
Create `database.js`:
```javascript
const Database = require('better-sqlite3');
let db;

function init(dbPath = 'staffpass.db') {
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT,
      overall_status TEXT DEFAULT 'Pending Review',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      doc_number TEXT NOT NULL,
      expiry_date TEXT,
      confidence_score INTEGER DEFAULT 0,
      file_path TEXT NOT NULL,
      review_status TEXT DEFAULT 'Pending Review',
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getTables() {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return rows.map(r => r.name);
}

module.exports = { init, getTables };
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add database.js tests/database.test.js
git commit -m "feat: setup sqlite tables schema and initialization helper"
```

---

### Task 3: Python OCR Sidecar interface and BaseVLMAdapter

**Files:**
- Create: `sidecar/base_adapter.py`
- Create: `sidecar/mock_adapter.py`
- Create: `sidecar/ocr_sidecar.py`
- Create: `sidecar/requirements.txt`
- Create: `sidecar/tests/test_sidecar.py`

- [ ] **Step 1: Write the failing test**
Create `sidecar/tests/test_sidecar.py`:
```python
import unittest
import json
from sidecar.mock_adapter import MockAdapter

class TestOCRAdapter(unittest.TestCase):
    def test_mock_extraction(self):
        adapter = MockAdapter()
        adapter.load()
        result = adapter.extract_metadata("test_passport.jpg")
        self.assertEqual(result["first_name"], "JOHN")
        self.assertEqual(result["doc_type"], "PASSPORT")
        adapter.unload()
```

- [ ] **Step 2: Run test to verify it fails**
Run: `python -m unittest sidecar/tests/test_sidecar.py`
Expected: FAIL (missing files)

- [ ] **Step 3: Write Python OCR Sidecar code**
Create `sidecar/base_adapter.py`:
```python
class BaseVLMAdapter:
    def load(self):
        pass
    def extract_metadata(self, file_path: str) -> dict:
        raise NotImplementedError()
    def unload(self):
        pass
```

Create `sidecar/mock_adapter.py`:
```python
from .base_adapter import BaseVLMAdapter

class MockAdapter(BaseVLMAdapter):
    def load(self):
        pass
    def extract_metadata(self, file_path: str) -> dict:
        return {
            "first_name": "JOHN",
            "last_name": "SMITH",
            "doc_type": "PASSPORT",
            "doc_number": "A1234567",
            "expiry_date": "2030-12-31",
            "confidence_score": 98,
            "phone_number": "+971501234567"
        }
    def unload(self):
        pass
```

Create `sidecar/ocr_sidecar.py`:
```python
import sys
import json
from mock_adapter import MockAdapter

def main():
    # Loop reading JSON commands from stdin
    # Command shape: {"action": "ocr", "file_path": "path"}
    adapter = MockAdapter()
    adapter.load()
    try:
        for line in sys.stdin:
            if not line.strip():
                continue
            cmd = json.loads(line)
            action = cmd.get("action")
            if action == "ocr":
                fp = cmd.get("file_path")
                data = adapter.extract_metadata(fp)
                print(json.dumps({"status": "success", "data": data}))
            elif action == "exit":
                break
            sys.stdout.flush()
    finally:
        adapter.unload()

if __name__ == "__main__":
    main()
```

Create `sidecar/requirements.txt`:
```text
pillow>=10.0.0
```

- [ ] **Step 4: Run test to verify it passes**
Run: `python -m unittest sidecar/tests/test_sidecar.py`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add sidecar/
git commit -m "feat: implement Python OCR Sidecar and MockAdapter"
```

---

### Task 4: IPC Bridge between Electron and Python OCR Sidecar

**Files:**
- Create: `sidecar_bridge.js`
- Create: `tests/sidecar_bridge.test.js`
- Modify: `main.js`

- [ ] **Step 1: Write the failing test**
Create `tests/sidecar_bridge.test.js` to ensure the bridge launches Python subprocess and receives JSON output.
```javascript
const assert = require('assert');
const path = require('path');
const bridge = require('../sidecar_bridge');

describe('OCR Sidecar Bridge', () => {
  it('should process OCR task and return mock data', async () => {
    const result = await bridge.runOCR('dummy.jpg');
    assert.strictEqual(result.first_name, 'JOHN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL (missing bridge module)

- [ ] **Step 3: Implement sidecar bridge**
Create `sidecar_bridge.js`:
```javascript
const { spawn } = require('child_process');
const path = require('path');

let child = null;

function getChild() {
  if (!child) {
    const scriptPath = path.join(__dirname, 'sidecar', 'ocr_sidecar.py');
    child = spawn('python', [scriptPath]);
    child.stderr.on('data', (data) => {
      console.error(`python error: ${data}`);
    });
  }
  return child;
}

function runOCR(filePath) {
  return new Promise((resolve, reject) => {
    const py = getChild();
    const onData = (data) => {
      py.stdout.removeListener('data', onData);
      try {
        const res = JSON.parse(data.toString());
        if (res.status === 'success') {
          resolve(res.data);
        } else {
          reject(new Error(res.message || 'OCR failed'));
        }
      } catch (err) {
        reject(err);
      }
    };
    py.stdout.on('data', onData);
    py.stdin.write(JSON.stringify({ action: 'ocr', file_path: filePath }) + '\n');
  });
}

function stop() {
  if (child) {
    child.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
    child.kill();
    child = null;
  }
}

module.exports = { runOCR, stop };
```

Modify `main.js` to register the IPC listener and call stop on exit:
```javascript
// Add:
const bridge = require('./sidecar_bridge');

// Add before app.whenReady().then(createWindow):
ipcMain.handle('ocr:process', async (event, filePath) => {
  return await bridge.runOCR(filePath);
});

app.on('will-quit', () => {
  bridge.stop();
});
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add sidecar_bridge.js main.js tests/sidecar_bridge.test.js
git commit -m "feat: bridge electron with Python OCR sidecar"
```
